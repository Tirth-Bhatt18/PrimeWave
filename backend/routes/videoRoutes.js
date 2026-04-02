const express = require('express');
const { verifyToken } = require('../middleware/authMiddleware');
const db = require('../db');
const s3Service = require('../services/s3Service');

const router = express.Router();

const parsePositiveInt = (value) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return null;
    }
    return parsed;
};

const getContent = async (contentId) => {
    const contentResult = await db.query(`
        SELECT 
            c.content_id, c.title, c.content_type, c.access_level, 
            c.audio_tracks, c.subtitle_tracks,
            c.description, c.release_year as year, c.age_rating as rating, c.thumbnail_url as image,
            m.duration
        FROM content c
        LEFT JOIN movies m ON c.content_id = m.content_id
        WHERE c.content_id = $1 LIMIT 1
    `, [contentId]);

    if (contentResult.rows.length === 0) {
        return null;
    }

    return contentResult.rows[0];
};

router.get('/:contentId/catalog', verifyToken, async (req, res) => {
    const contentId = parsePositiveInt(req.params.contentId);
    if (!contentId) {
        return res.status(404).json({ message: 'Content not found' });
    }

    try {
        const content = await getContent(contentId);
        if (!content) {
            return res.status(404).json({ message: 'Content not found' });
        }

        if (content.content_type === 'movie') {
            return res.json({
                id: content.content_id,
                title: content.title,
                contentType: 'movie',
                description: content.description || '',
                year: content.year,
                rating: content.rating,
                image: content.image || 'https://via.placeholder.com/500x750/14141a/ffffff?text=' + encodeURIComponent(content.title),
                duration: content.duration ? `${Math.floor(content.duration/60)}h ${content.duration%60}m` : null
            });
        }

        if (content.content_type !== 'series') {
            return res.status(404).json({ message: 'Content not found' });
        }

        const rows = await db.query(
            `SELECT
                se.season_number,
                e.episode_number,
                e.title
            FROM series s
            JOIN seasons se ON se.series_id = s.series_id
            JOIN episodes e ON e.season_id = se.season_id
            WHERE s.content_id = $1
            ORDER BY se.season_number ASC, e.episode_number ASC`,
            [contentId]
        );

        if (rows.rows.length === 0) {
            return res.json({
                contentId: content.content_id,
                title: content.title,
                contentType: 'series',
                seasons: [],
            });
        }

        const seasonsMap = new Map();

        for (const row of rows.rows) {
            if (!seasonsMap.has(row.season_number)) {
                seasonsMap.set(row.season_number, {
                    seasonNumber: row.season_number,
                    episodes: [],
                });
            }

            seasonsMap.get(row.season_number).episodes.push({
                episodeNumber: row.episode_number,
                title: row.title || `Episode ${row.episode_number}`,
            });
        }

        return res.json({
            id: content.content_id,
            title: content.title,
            contentType: 'series',
            description: content.description || '',
            year: content.year,
            rating: content.rating,
            image: content.image || 'https://via.placeholder.com/500x750/14141a/ffffff?text=' + encodeURIComponent(content.title),
            seasons: Array.from(seasonsMap.values()),
        });
    } catch (err) {
        console.error('Failed to fetch content catalog:', err);
        return res.status(500).json({ message: 'Failed to fetch content catalog' });
    }
});

// Resolve poster image — thumbnail_url should be a full URL; fallback to placeholder
const resolveImage = (r) => {
    if (r.image && r.image.startsWith('http')) return r.image;
    return `https://via.placeholder.com/500x750/14141a/ffffff?text=${encodeURIComponent(r.title)}`;
};

// GET /api/videos/catalog/all
router.get('/catalog/all', verifyToken, async (req, res) => {

    try {
        const rows = await db.query(`
            SELECT 
                c.content_id as id, 
                c.title, 
                c.description, 
                c.release_year as year, 
                c.content_type as type, 
                c.thumbnail_url as image,
                c.age_rating as rating,
                m.duration as duration,
                (SELECT COUNT(DISTINCT se.season_number) FROM seasons se JOIN series s ON se.series_id = s.series_id WHERE s.content_id = c.content_id) as seasons
            FROM content c
            LEFT JOIN movies m ON c.content_id = m.content_id
            ORDER BY c.release_year DESC
        `);
        
        const mapped = rows.rows.map(r => ({
            id: r.id,
            title: r.title,
            type: r.type,
            description: r.description || '',
            year: r.year,
            rating: r.rating || 0,
            image: resolveImage(r),
            duration: r.duration ? `${Math.floor(r.duration/60)}h ${r.duration%60}m` : null,
            seasons: parseInt(r.seasons) > 0 ? `${r.seasons} Seasons` : null
        }));
        
        const movies = mapped.filter(r => r.type === 'movie');
        const series = mapped.filter(r => r.type === 'series');
        
        return res.json({ movies, series });
    } catch (err) {
        console.error('Failed to fetch all catalog:', err);
        return res.status(500).json({ message: 'Failed to fetch catalog' });
    }
});

// GET /api/videos/:contentId/stream
router.get('/:contentId/stream', verifyToken, async (req, res) => {
    const contentId = parsePositiveInt(req.params.contentId);

    if (!contentId) {
        return res.status(404).json({ message: 'Content not found' });
    }

    const awsConfig = s3Service.getAwsConfig();

    if (
        !awsConfig.region ||
        !awsConfig.bucket ||
        !awsConfig.accessKeyId ||
        !awsConfig.secretAccessKey
    ) {
        return res.status(500).json({ message: 'Server is not configured for video streaming' });
    }

    try {
        const content = await getContent(contentId);
        if (!content) {
            return res.status(404).json({ message: 'Content not found' });
        }

        const requiredPlanId = content.access_level || 1;
        const userPlanId = req.user.plan_id || 1;

        if (req.user.role !== 'admin' && userPlanId < requiredPlanId) {
            return res.status(403).json({ 
                message: 'Subscription upgrade required to watch this content.', 
                code: 'UPGRADE_REQUIRED' 
            });
        }

        let objectKey = null;

        if (content.content_type === 'movie') {
            const movieResult = await db.query(
                'SELECT video_url FROM movies WHERE content_id = $1 LIMIT 1',
                [contentId]
            );

            if (movieResult.rows.length > 0 && movieResult.rows[0].video_url) {
                objectKey = movieResult.rows[0].video_url;
            } else {
                // Fallback deterministic S3 path
                const titleSlug = content.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                objectKey = `movies/${titleSlug}/1080p.mp4`;
            }
        } else if (content.content_type === 'series') {
            const seasonNumber = parsePositiveInt(req.query.seasonNumber);
            const episodeNumber = parsePositiveInt(req.query.episodeNumber);

            if (!seasonNumber || !episodeNumber) {
                return res.status(400).json({
                    message: 'seasonNumber and episodeNumber are required for series streaming',
                });
            }

            const episodeResult = await db.query(
                `SELECT e.video_url
                 FROM series s
                 JOIN seasons se ON se.series_id = s.series_id
                 JOIN episodes e ON e.season_id = se.season_id
                 WHERE s.content_id = $1
                   AND se.season_number = $2
                   AND e.episode_number = $3
                 LIMIT 1`,
                [contentId, seasonNumber, episodeNumber]
            );

            if (episodeResult.rows.length > 0 && episodeResult.rows[0].video_url) {
                objectKey = episodeResult.rows[0].video_url;
            } else {
                // Fallback deterministic S3 path matching actual bucket structure
                const titleSlug = content.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                const seasonPad = String(seasonNumber).padStart(2, '0');
                const episodePad = String(episodeNumber).padStart(3, '0');
                objectKey = `webseries/${titleSlug}/season-${seasonPad}/episode-${episodePad}/720p.mp4`;
            }
        } else {
            return res.status(404).json({ message: 'Content not found' });
        }

        const exists = await s3Service.checkFileExists(objectKey);
        if (!exists) {
            return res.status(404).json({ message: 'Video file not found in storage' });
        }

        const signedUrl = await s3Service.getPresignedUrl(objectKey, 3600);

        // Generate signed URLs for multiple tracks
        const objectKeyDir = objectKey.substring(0, objectKey.lastIndexOf('/') + 1);
        const audioData = {};
        const subtitleData = {};

        const audioTracks = content.audio_tracks || [];
        const subtitleTracks = content.subtitle_tracks || [];

        for (const lang of audioTracks) {
            const trackKey = `${objectKeyDir}audio_${lang}.aac`;
            try { audioData[lang] = await s3Service.getPresignedUrl(trackKey); } catch (e) {}
        }

        for (const lang of subtitleTracks) {
            const trackKey = `${objectKeyDir}sub_${lang}.vtt`;
            try { subtitleData[lang] = await s3Service.getPresignedUrl(trackKey); } catch (e) {}
        }

        return res.json({ 
            url: signedUrl, 
            expiresIn: 3600,
            audios: audioData,
            subtitles: subtitleData
        });
    } catch (err) {
        console.error('Failed to generate signed video URL:', err);
        return res.status(500).json({ message: 'Failed to generate video stream URL' });
    }
});

module.exports = router;