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
                image: await resolveImage({ image: content.image, title: content.title }),
                duration: content.duration ? `${Math.floor(content.duration/60)}h ${content.duration%60}m` : null,
                accessLevel: content.access_level
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
            image: await resolveImage({ image: content.image, title: content.title }),
            seasons: Array.from(seasonsMap.values()),
            accessLevel: content.access_level
        });
    } catch (err) {
        console.error('Failed to fetch content catalog:', err);
        return res.status(500).json({ message: 'Failed to fetch content catalog' });
    }
});

// Resolve poster image — thumbnail_url should be a full URL, or an S3 key.
const resolveImage = async (r) => {
    if (r.image && r.image.startsWith('http')) return r.image;
    if (r.image) {
        try {
            return await s3Service.getPresignedUrl(r.image, 3600 * 24); // 24 hours
        } catch (e) {
            console.error('Presigned URL error for image:', e.message);
        }
    }
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
                c.access_level,
                m.duration as duration,
                (SELECT COUNT(DISTINCT se.season_number) FROM seasons se JOIN series s ON se.series_id = s.series_id WHERE s.content_id = c.content_id) as seasons
            FROM content c
            LEFT JOIN movies m ON c.content_id = m.content_id
            ORDER BY c.release_year DESC
        `);
        
        const mapped = await Promise.all(rows.rows.map(async r => ({
            id: r.id,
            title: r.title,
            type: r.type,
            description: r.description || '',
            year: r.year,
            rating: r.rating || 0,
            image: await resolveImage(r),
            duration: r.duration ? `${Math.floor(r.duration/60)}h ${r.duration%60}m` : null,
            seasons: parseInt(r.seasons) > 0 ? `${r.seasons} Seasons` : null,
            accessLevel: r.access_level
        })));
        
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

        const requestedQuality = req.query.quality || '1080p';
        const requestedAudio = req.query.audio || 'original';
        const requestedSubtitle = req.query.subtitle || 'off';

        // Replace the filename in the objectKey with the requested quality
        const objectKeyDir = objectKey.substring(0, objectKey.lastIndexOf('/') + 1);
        objectKey = `${objectKeyDir}${requestedQuality}.mp4`;

        // Check if the requested video quality exists
        const videoExists = await s3Service.checkFileExists(objectKey);
        if (!videoExists) {
            return res.status(404).json({ message: `Video quality ${requestedQuality} is not available.` });
        }

        const signedUrl = await s3Service.getPresignedUrl(objectKey, 3600);

        let audioUrl = null;
        if (requestedAudio !== 'original') {
            const audioKey = `${objectKeyDir}audio_${requestedAudio}.aac`;
            const audioExists = await s3Service.checkFileExists(audioKey);
            if (!audioExists) {
                return res.status(404).json({ message: `Audio track ${requestedAudio} is not available.` });
            }
            audioUrl = await s3Service.getPresignedUrl(audioKey, 3600);
        }

        let subtitleUrl = null;
        if (requestedSubtitle !== 'off') {
            const subtitleKey = `${objectKeyDir}sub_${requestedSubtitle}.vtt`;
            const subtitleExists = await s3Service.checkFileExists(subtitleKey);
            if (!subtitleExists) {
                return res.status(404).json({ message: `Subtitle track ${requestedSubtitle} is not available.` });
            }
            subtitleUrl = await s3Service.getPresignedUrl(subtitleKey, 3600);
        }

        return res.json({ 
            url: signedUrl, 
            expiresIn: 3600,
            audioUrl,
            subtitleUrl
        });
    } catch (err) {
        console.error('Failed to generate signed video URL:', err);
        return res.status(500).json({ message: 'Failed to generate video stream URL' });
    }
});

// GET /api/videos/:contentId/reviews
router.get('/:contentId/reviews', verifyToken, async (req, res) => {
    const contentId = parsePositiveInt(req.params.contentId);
    if (!contentId) return res.status(404).json({ message: 'Content not found' });

    try {
        const result = await db.query(`
            SELECT r.review_id, r.rating, r.comment, r.created_at, u.name as user_name
            FROM reviews r
            JOIN users u ON r.user_id = u.user_id
            WHERE r.content_id = $1
            ORDER BY r.created_at DESC
        `, [contentId]);

        const avgResult = await db.query(`
            SELECT ROUND(AVG(rating), 1) as avg_rating, COUNT(*) as total_reviews
            FROM reviews
            WHERE content_id = $1
        `, [contentId]);

        return res.json({
            reviews: result.rows,
            avgRating: parseFloat(avgResult.rows[0].avg_rating) || 0,
            totalReviews: parseInt(avgResult.rows[0].total_reviews) || 0
        });
    } catch (err) {
        console.error('Failed to fetch reviews:', err);
        return res.status(500).json({ message: 'Failed to fetch reviews' });
    }
});

// POST /api/videos/:contentId/reviews
router.post('/:contentId/reviews', verifyToken, async (req, res) => {
    const contentId = parsePositiveInt(req.params.contentId);
    const { rating, comment } = req.body;
    
    if (!contentId) return res.status(404).json({ message: 'Content not found' });
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ message: 'Rating must be between 1 and 5' });

    try {
        // Check if user watched the content
        const cw = await db.query(`
            SELECT 1 FROM continue_watching WHERE user_id = $1 AND content_id = $2 AND progress_seconds > 0
        `, [req.user.id, contentId]);

        if (cw.rows.length === 0 && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'You must watch this content before reviewing it.' });
        }

        // Insert or update review
        await db.query(`
            INSERT INTO reviews (user_id, content_id, rating, comment, created_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (user_id, content_id) DO UPDATE SET
                rating = $3, comment = $4, created_at = NOW()
        `, [req.user.id, contentId, rating, comment || null]);

        return res.json({ success: true, message: 'Review submitted' });
    } catch (err) {
        console.error('Failed to submit review:', err);
        return res.status(500).json({ message: 'Failed to submit review' });
    }
});

module.exports = router;