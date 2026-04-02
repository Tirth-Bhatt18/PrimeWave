const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');
const db = require('../db');
const s3Service = require('../services/s3Service');

// GET /api/admin/dashboard — full stats
router.get('/dashboard', verifyToken, isAdmin, async (req, res) => {
    try {
        const [users, content, series, movies, watchlistCount, favCount, cwCount, recentUsers] = await Promise.all([
            db.query('SELECT COUNT(*) FROM users'),
            db.query('SELECT COUNT(*) FROM content'),
            db.query("SELECT COUNT(*) FROM content WHERE content_type='series'"),
            db.query("SELECT COUNT(*) FROM content WHERE content_type='movie'"),
            db.query('SELECT COUNT(*) FROM user_watchlist'),
            db.query('SELECT COUNT(*) FROM user_favorites'),
            db.query('SELECT COUNT(*) FROM continue_watching'),
            db.query('SELECT user_id, name, email, created_at, status FROM users ORDER BY created_at DESC LIMIT 10'),
        ]);
        res.json({
            stats: {
                totalUsers: parseInt(users.rows[0].count),
                totalContent: parseInt(content.rows[0].count),
                totalMovies: parseInt(movies.rows[0].count),
                totalSeries: parseInt(series.rows[0].count),
                totalWatchlistEntries: parseInt(watchlistCount.rows[0].count),
                totalFavorites: parseInt(favCount.rows[0].count),
                totalContinueWatching: parseInt(cwCount.rows[0].count),
            },
            recentUsers: recentUsers.rows,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/admin/users — all users
router.get('/users', verifyToken, isAdmin, async (req, res) => {
    try {
        const rows = await db.query('SELECT user_id, name, email, phone, status, created_at FROM users ORDER BY created_at DESC');
        res.json(rows.rows);
    } catch (err) { res.status(500).json({ message: 'Error fetching users' }); }
});

// PATCH /api/admin/users/:id — update user status
router.patch('/users/:id', verifyToken, isAdmin, async (req, res) => {
    const { status } = req.body;
    try {
        await db.query('UPDATE users SET status=$1 WHERE user_id=$2', [status, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ message: 'Error updating user' }); }
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

// POST /api/admin/content/sync-s3 — re-run the S3→DB sync
router.post('/content/sync-s3', verifyToken, isAdmin, async (req, res) => {
    try {
        const keys = await s3Service.listAllObjects();
        let synced = 0;
        const formatTitle = (slug) => slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

        for (const key of keys) {
            if (key.endsWith('/') || !key.endsWith('.mp4')) continue;
            const parts = key.split('/');

            if (parts[0] === 'movies' && parts.length >= 3) {
                const title = formatTitle(parts[1]);
                let r = await db.query("SELECT content_id FROM content WHERE title ILIKE $1 AND content_type='movie'", [title]);
                if (r.rows.length === 0) r = await db.query("INSERT INTO content (title, content_type) VALUES ($1,'movie') RETURNING content_id", [title]);
                const contentId = r.rows[0].content_id;
                await db.query('INSERT INTO movies (content_id, video_url) VALUES ($1,$2) ON CONFLICT (content_id) DO UPDATE SET video_url=$2', [contentId, key]);
                synced++;
            } else if (parts[0] === 'webseries' && parts.length >= 5) {
                const title = formatTitle(parts[1]);
                const seasonNum = parseInt(parts[2].replace('season-', ''), 10);
                const episodeNum = parseInt(parts[3].replace('episode-', ''), 10);
                if (isNaN(seasonNum) || isNaN(episodeNum)) continue;

                let r = await db.query("SELECT content_id FROM content WHERE title ILIKE $1 AND content_type='series'", [title]);
                if (r.rows.length === 0) r = await db.query("INSERT INTO content (title, content_type) VALUES ($1,'series') RETURNING content_id", [title]);
                const contentId = r.rows[0].content_id;

                r = await db.query('SELECT series_id FROM series WHERE content_id=$1', [contentId]);
                if (r.rows.length === 0) r = await db.query('INSERT INTO series (content_id) VALUES ($1) RETURNING series_id', [contentId]);
                const seriesId = r.rows[0].series_id;

                r = await db.query('SELECT season_id FROM seasons WHERE series_id=$1 AND season_number=$2', [seriesId, seasonNum]);
                if (r.rows.length === 0) r = await db.query('INSERT INTO seasons (series_id, season_number) VALUES ($1,$2) RETURNING season_id', [seriesId, seasonNum]);
                const seasonId = r.rows[0].season_id;

                await db.query(`INSERT INTO episodes (season_id, episode_number, title, video_url) VALUES ($1,$2,$3,$4)
                    ON CONFLICT (season_id, episode_number) DO UPDATE SET video_url=$4`,
                    [seasonId, episodeNum, `Episode ${episodeNum}`, key]);
                synced++;
            }
        }
        res.json({ success: true, synced });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Sync failed', error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
// ADMIN CONTENT MANAGEMENT (CRUD)
// ═══════════════════════════════════════════════════════════

// POST /api/admin/content/movie — Add a new movie
router.post('/content/movie', verifyToken, isAdmin, async (req, res) => {
    const { title, description, release_year, age_rating, access_level, thumbnail_url, video_url, duration } = req.body;

    if (!title) return res.status(400).json({ message: 'Title is required' });

    try {
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

        res.status(201).json({
            message: 'Movie added successfully',
            content_id: contentId
        });
    } catch (err) {
        console.error('Error adding movie:', err);
        if (err.code === '23505') return res.status(409).json({ message: 'A movie with this title already exists' });
        res.status(500).json({ message: 'Failed to add movie' });
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
    const { episode_number, title, video_url } = req.body;

    if (!episode_number) return res.status(400).json({ message: 'episode_number is required' });

    try {
        const epRes = await db.query(
            `INSERT INTO episodes (season_id, episode_number, title, video_url)
             VALUES ($1, $2, $3, $4) RETURNING episode_id`,
            [seasonId, episode_number, title || `Episode ${episode_number}`, video_url || null]
        );

        res.status(201).json({
            message: `Episode ${episode_number} added`,
            episode_id: epRes.rows[0].episode_id
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
