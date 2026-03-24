const express = require('express');
const { S3Client, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { verifyToken } = require('../middleware/authMiddleware');
const db = require('../db');

const router = express.Router();

const getAwsConfig = () => {
    const region = process.env.AWS_REGION || process.env.REACT_APP_AWS_REGION;
    const bucket = process.env.AWS_BUCKET || process.env.REACT_APP_S3_BUCKET_NAME;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.REACT_APP_AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.REACT_APP_AWS_SECRET_ACCESS_KEY;

    return {
        region,
        bucket,
        accessKeyId,
        secretAccessKey,
    };
};

const parsePositiveInt = (value) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return null;
    }
    return parsed;
};

const getContent = async (contentId) => {
    const contentResult = await db.query(
        'SELECT content_id, title, content_type FROM content WHERE content_id = $1 LIMIT 1',
        [contentId]
    );

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
                contentId: content.content_id,
                title: content.title,
                contentType: 'movie',
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
            contentId: content.content_id,
            title: content.title,
            contentType: 'series',
            seasons: Array.from(seasonsMap.values()),
        });
    } catch (err) {
        console.error('Failed to fetch content catalog:', err);
        return res.status(500).json({ message: 'Failed to fetch content catalog' });
    }
});

// GET /api/videos/:contentId/stream
router.get('/:contentId/stream', verifyToken, async (req, res) => {
    const contentId = parsePositiveInt(req.params.contentId);

    if (!contentId) {
        return res.status(404).json({ message: 'Content not found' });
    }

    const awsConfig = getAwsConfig();

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

        let objectKey = null;

        if (content.content_type === 'movie') {
            const movieResult = await db.query(
                'SELECT video_url FROM movies WHERE content_id = $1 LIMIT 1',
                [contentId]
            );

            if (movieResult.rows.length === 0 || !movieResult.rows[0].video_url) {
                return res.status(404).json({ message: 'Video file not found' });
            }

            objectKey = movieResult.rows[0].video_url;
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

            if (episodeResult.rows.length === 0 || !episodeResult.rows[0].video_url) {
                return res.status(404).json({ message: 'Episode video file not found' });
            }

            objectKey = episodeResult.rows[0].video_url;
        } else {
            return res.status(404).json({ message: 'Content not found' });
        }

        const s3Client = new S3Client({
            region: awsConfig.region,
            credentials: {
                accessKeyId: awsConfig.accessKeyId,
                secretAccessKey: awsConfig.secretAccessKey,
            },
        });

        const command = new GetObjectCommand({
            Bucket: awsConfig.bucket,
            Key: objectKey,
        });

        try {
            await s3Client.send(
                new HeadObjectCommand({
                    Bucket: awsConfig.bucket,
                    Key: objectKey,
                })
            );
        } catch (headErr) {
            const notFound =
                headErr?.name === 'NotFound' ||
                headErr?.$metadata?.httpStatusCode === 404 ||
                headErr?.Code === 'NotFound';

            if (notFound) {
                return res.status(404).json({ message: 'Video file not found in storage' });
            }

            throw headErr;
        }

        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

        return res.json({ url: signedUrl, expiresIn: 3600 });
    } catch (err) {
        console.error('Failed to generate signed video URL:', err);
        return res.status(500).json({ message: 'Failed to generate video stream URL' });
    }
});

module.exports = router;