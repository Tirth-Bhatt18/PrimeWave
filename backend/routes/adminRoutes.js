const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');
const db = require('../db');
const s3Service = require('../services/s3Service');

// GET /api/admin/dashboard — full stats
router.get('/dashboard', verifyToken, isAdmin, async (req, res) => {
    try {
        const [users, premiumUsers, content, series, movies, watchTime, recentUsers] = await Promise.all([
            db.query('SELECT COUNT(*) FROM users'),
            db.query('SELECT COUNT(DISTINCT user_id) FROM user_subscriptions WHERE plan_id = 2 AND status = \'ACTIVE\''),
            db.query('SELECT COUNT(*) FROM content'),
            db.query("SELECT COUNT(*) FROM content WHERE content_type='series'"),
            db.query("SELECT COUNT(*) FROM content WHERE content_type='movie'"),
            db.query('SELECT SUM(progress_seconds) as total_seconds FROM continue_watching'),
            db.query('SELECT user_id, name, email, created_at, status FROM users ORDER BY created_at DESC LIMIT 10'),
        ]);
        res.json({
            stats: {
                totalUsers: parseInt(users.rows[0].count),
                premiumUsers: parseInt(premiumUsers.rows[0].count),
                totalContent: parseInt(content.rows[0].count),
                totalMovies: parseInt(movies.rows[0].count),
                totalSeries: parseInt(series.rows[0].count),
                totalWatchTimeHours: watchTime.rows[0].total_seconds ? Math.round(parseInt(watchTime.rows[0].total_seconds) / 3600) : 0,
            },
            recentUsers: recentUsers.rows,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/admin/users — all users with plan info
router.get('/users', verifyToken, isAdmin, async (req, res) => {
    try {
        const rows = await db.query(`
            SELECT u.user_id, u.name, u.email, u.phone, u.status, u.created_at,
                   COALESCE(us.plan_id, 1) as plan_id,
                   sp.plan_name
            FROM users u
            LEFT JOIN user_subscriptions us ON u.user_id = us.user_id
            LEFT JOIN subscription_plans sp ON us.plan_id = sp.plan_id
            ORDER BY u.created_at DESC
        `);
        res.json(rows.rows);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ message: 'Error fetching users' });
    }
});

// PATCH /api/admin/users/:id — update user status (ACTIVE/INACTIVE)
router.patch('/users/:id', verifyToken, isAdmin, async (req, res) => {
    const { status } = req.body;
    const allowed = ['ACTIVE', 'INACTIVE'];
    if (!allowed.includes(status)) return res.status(400).json({ message: 'Invalid status. Use ACTIVE or INACTIVE.' });
    try {
        await db.query('UPDATE users SET status=$1 WHERE user_id=$2', [status, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating user status:', err);
        res.status(500).json({ message: 'Error updating user' });
    }
});

// GET /api/admin/content — all content with metadata
router.get('/content', verifyToken, isAdmin, async (req, res) => {
    try {
        const rows = await db.query(`
            SELECT c.content_id, c.title, c.content_type, c.release_year, c.age_rating, c.access_level,
                   m.video_url, m.duration,
                   (SELECT COUNT(*) FROM episodes e JOIN seasons s ON e.season_id=s.season_id JOIN series sr ON s.series_id=sr.series_id WHERE sr.content_id=c.content_id) as episode_count
            FROM content c
            LEFT JOIN movies m ON c.content_id = m.content_id
            ORDER BY c.content_type, c.title
        `);
        res.json(rows.rows);
    } catch (err) { res.status(500).json({ message: 'Error fetching content' }); }
});


// GET /api/admin/presigned-put — Generate S3 upload URL
router.get('/presigned-put', verifyToken, isAdmin, async (req, res) => {
    const { key, contentType } = req.query;
    if (!key || !contentType) {
        return res.status(400).json({ message: 'Missing key or contentType' });
    }
    try {
        const url = await s3Service.getPresignedPutUrl(key, contentType, 3600);
        res.json({ url });
    } catch (err) {
        console.error('Error generating presigned PUT URL:', err);
        res.status(500).json({ message: 'Failed to generate upload URL' });
    }
});

// ═══════════════════════════════════════════════════════════
// ADMIN CONTENT MANAGEMENT (CRUD)
// ═══════════════════════════════════════════════════════════

// POST /api/admin/content/movie — Add a new movie
router.post('/content/movie', verifyToken, isAdmin, async (req, res) => {
    const { title, description, release_year, age_rating, access_level, thumbnail_url, video_url, duration, audios, subtitles, qualities } = req.body;

    if (!title) return res.status(400).json({ message: 'Title is required' });

    const client = await db.pool ? await db.pool.connect() : null;
    
    try {
        if (client) await client.query('BEGIN');
        
        // Insert into content table
        const contentRes = await db.query(
            `INSERT INTO content (title, description, content_type, release_year, age_rating, access_level, thumbnail_url)
             VALUES ($1, $2, 'movie', $3, $4, $5, $6) RETURNING content_id`,
            [title, description || null, release_year || null, age_rating || null, access_level || 1, thumbnail_url || null]
        );
        const contentId = contentRes.rows[0].content_id;

        // Insert into movies table
        await db.query(
            `INSERT INTO movies (content_id, video_url, duration) VALUES ($1, $2, $3)`,
            [contentId, video_url || null, duration || null]
        );
        
        // Default video_files entry if video_url is provided
        if (video_url) {
            await db.query('INSERT INTO video_files (content_id, quality, file_url) VALUES ($1, $2, $3)', [contentId, '1080p', video_url]);
        }

        // Additional qualities (e.g., '720p:url,480p:url')
        if (qualities) {
            const qs = qualities.split(',').map(s => s.trim()).filter(Boolean);
            for (let q of qs) {
                const [ql, url] = q.split('|');
                if (ql && url) {
                    await db.query('INSERT INTO video_files (content_id, quality, file_url) VALUES ($1, $2, $3)', [contentId, ql.trim(), url.trim()]);
                }
            }
        }

        // Audios (e.g., 'en:url,es:url')
        if (audios) {
            const arr = audios.split(',').map(s => s.trim()).filter(Boolean);
            for (let a of arr) {
                const [lang, url] = a.split('|');
                if (lang && url) {
                    await db.query('INSERT INTO audio_tracks (content_id, language_code, file_url) VALUES ($1, $2, $3)', [contentId, lang.trim(), url.trim()]);
                }
            }
        }

        // Subtitles (e.g., 'en:url,fr:url')
        if (subtitles) {
            const arr = subtitles.split(',').map(s => s.trim()).filter(Boolean);
            for (let a of arr) {
                const [lang, url] = a.split('|');
                if (lang && url) {
                    await db.query('INSERT INTO subtitle_tracks (content_id, language_code, file_url) VALUES ($1, $2, $3)', [contentId, lang.trim(), url.trim()]);
                }
            }
        }

        if (client) await client.query('COMMIT');

        res.status(201).json({
            message: 'Movie added successfully',
            content_id: contentId
        });
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('Error adding movie:', err);
        if (err.code === '23505') return res.status(409).json({ message: 'A movie with this title already exists' });
        res.status(500).json({ message: 'Failed to add movie' });
    } finally {
        if (client) client.release();
    }
});

// POST /api/admin/content/series — Add a new series
router.post('/content/series', verifyToken, isAdmin, async (req, res) => {
    const { title, description, release_year, age_rating, access_level, thumbnail_url } = req.body;

    if (!title) return res.status(400).json({ message: 'Title is required' });

    try {
        const contentRes = await db.query(
            `INSERT INTO content (title, description, content_type, release_year, age_rating, access_level, thumbnail_url)
             VALUES ($1, $2, 'series', $3, $4, $5, $6) RETURNING content_id`,
            [title, description || null, release_year || null, age_rating || null, access_level || 1, thumbnail_url || null]
        );
        const contentId = contentRes.rows[0].content_id;

        // Also create the series record
        const seriesRes = await db.query(
            `INSERT INTO series (content_id) VALUES ($1) RETURNING series_id`,
            [contentId]
        );

        res.status(201).json({
            message: 'Series added successfully',
            content_id: contentId,
            series_id: seriesRes.rows[0].series_id
        });
    } catch (err) {
        console.error('Error adding series:', err);
        if (err.code === '23505') return res.status(409).json({ message: 'A series with this title already exists' });
        res.status(500).json({ message: 'Failed to add series' });
    }
});

// POST /api/admin/content/series/:contentId/season — Add a season to a series
router.post('/content/series/:contentId/season', verifyToken, isAdmin, async (req, res) => {
    const { contentId } = req.params;
    const { season_number } = req.body;

    if (!season_number) return res.status(400).json({ message: 'season_number is required' });

    try {
        // Get the series_id from content_id
        const seriesRes = await db.query('SELECT series_id FROM series WHERE content_id = $1', [contentId]);
        if (seriesRes.rows.length === 0) return res.status(404).json({ message: 'Series not found' });

        const seriesId = seriesRes.rows[0].series_id;
        const seasonRes = await db.query(
            `INSERT INTO seasons (series_id, season_number) VALUES ($1, $2) RETURNING season_id`,
            [seriesId, season_number]
        );

        res.status(201).json({
            message: `Season ${season_number} added`,
            season_id: seasonRes.rows[0].season_id
        });
    } catch (err) {
        console.error('Error adding season:', err);
        if (err.code === '23505') return res.status(409).json({ message: 'This season already exists' });
        res.status(500).json({ message: 'Failed to add season' });
    }
});

// POST /api/admin/content/season/:seasonId/episode — Add an episode to a season
router.post('/content/season/:seasonId/episode', verifyToken, isAdmin, async (req, res) => {
    const { seasonId } = req.params;
    const { episode_number, title, video_url, qualities, audios, subtitles } = req.body;

    if (!episode_number) return res.status(400).json({ message: 'episode_number is required' });

    try {
        const epRes = await db.query(
            `INSERT INTO episodes (season_id, episode_number, title, video_url)
             VALUES ($1, $2, $3, $4) RETURNING episode_id`,
            [seasonId, episode_number, title || `Episode ${episode_number}`, video_url || null]
        );
        const episodeId = epRes.rows[0].episode_id;

        // Get content_id via the season → series → content chain for track tables
        const contentRes = await db.query(`
            SELECT c.content_id FROM content c
            JOIN series sr ON sr.content_id = c.content_id
            JOIN seasons s ON s.series_id = sr.series_id
            WHERE s.season_id = $1
        `, [seasonId]);
        const contentId = contentRes.rows[0]?.content_id;

        if (contentId) {
            if (video_url) {
                await db.query('INSERT INTO video_files (content_id, episode_id, quality, file_url) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
                    [contentId, episodeId, '1080p', video_url]);
            }
            if (qualities) {
                for (const q of qualities.split(',').filter(Boolean)) {
                    const [ql, url] = q.split('|');
                    if (ql && url) await db.query('INSERT INTO video_files (content_id, episode_id, quality, file_url) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
                        [contentId, episodeId, ql.trim(), url.trim()]);
                }
            }
            if (audios) {
                for (const a of audios.split(',').filter(Boolean)) {
                    const [lang, url] = a.split('|');
                    if (lang && url) await db.query('INSERT INTO audio_tracks (content_id, episode_id, language_code, file_url) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
                        [contentId, episodeId, lang.trim(), url.trim()]);
                }
            }
            if (subtitles) {
                for (const s of subtitles.split(',').filter(Boolean)) {
                    const [lang, url] = s.split('|');
                    if (lang && url) await db.query('INSERT INTO subtitle_tracks (content_id, episode_id, language_code, file_url) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
                        [contentId, episodeId, lang.trim(), url.trim()]);
                }
            }
        }

        res.status(201).json({
            message: `Episode ${episode_number} added`,
            episode_id: episodeId
        });
    } catch (err) {
        console.error('Error adding episode:', err);
        if (err.code === '23505') return res.status(409).json({ message: 'This episode already exists in the season' });
        res.status(500).json({ message: 'Failed to add episode' });
    }
});

// DELETE /api/admin/content/:contentId — Delete content (movie or series)
router.delete('/content/:contentId', verifyToken, isAdmin, async (req, res) => {
    const { contentId } = req.params;

    try {
        // Clean up related tables first
        await db.query('DELETE FROM user_watchlist WHERE content_id = $1', [contentId]);
        await db.query('DELETE FROM user_favorites WHERE content_id = $1', [contentId]);
        await db.query('DELETE FROM continue_watching WHERE content_id = $1', [contentId]);

        // Delete movies record if it exists
        await db.query('DELETE FROM movies WHERE content_id = $1', [contentId]);

        // Delete series hierarchy if it exists
        const seriesRes = await db.query('SELECT series_id FROM series WHERE content_id = $1', [contentId]);
        if (seriesRes.rows.length > 0) {
            const seriesId = seriesRes.rows[0].series_id;
            const seasons = await db.query('SELECT season_id FROM seasons WHERE series_id = $1', [seriesId]);
            for (const s of seasons.rows) {
                await db.query('DELETE FROM episodes WHERE season_id = $1', [s.season_id]);
            }
            await db.query('DELETE FROM seasons WHERE series_id = $1', [seriesId]);
            await db.query('DELETE FROM series WHERE series_id = $1', [seriesId]);
        }

        // Finally delete the content record
        const delRes = await db.query('DELETE FROM content WHERE content_id = $1 RETURNING title', [contentId]);
        if (delRes.rowCount === 0) return res.status(404).json({ message: 'Content not found' });

        res.json({ message: `"${delRes.rows[0].title}" deleted successfully` });
    } catch (err) {
        console.error('Error deleting content:', err);
        res.status(500).json({ message: 'Failed to delete content' });
    }
});

module.exports = router;
