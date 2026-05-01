const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const db = require('../db');// Apply verifyToken to all library routes
router.use(verifyToken);

// Admin library mock to prevent foreign key errors on users table
router.use((req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        if (req.method === 'GET') {
            if (req.path.startsWith('/status/')) {
                return res.json({ inWatchlist: false, inFavorites: false, continueWatching: null });
            }
            return res.json([]);
        }
        return res.json({ success: true, message: 'Admins do not have library features' });
    }
    next();
});

// Resolve poster image — thumbnail_url should be a full URL, or an S3 key.
const resolveImage = async (id, thumb, title) => {
    if (thumb && thumb.startsWith('http')) return thumb;
    if (thumb) {
        try {
            const s3Service = require('../services/s3Service');
            return await s3Service.getPresignedUrl(thumb, 3600 * 24);
        } catch (e) {
            console.error('Presigned URL error:', e.message);
        }
    }
    return `https://via.placeholder.com/500x750/14141a/ffffff?text=${encodeURIComponent(title)}`;
};

// ── WATCHLIST ──────────────────────────────────────────────
router.get('/watchlist', async (req, res) => {
    const rows = await db.query(`
        SELECT c.content_id as id, c.title, c.content_type as type, c.thumbnail_url as image, c.access_level
        FROM user_watchlist w JOIN content c ON w.content_id = c.content_id
        WHERE w.user_id = $1 ORDER BY w.added_at DESC
    `, [req.user.id]);
    const mapped = await Promise.all(rows.rows.map(async r => ({ ...r, image: await resolveImage(r.id, r.image, r.title), accessLevel: r.access_level })));
    res.json(mapped);
});

router.post('/watchlist/:contentId', async (req, res) => {
    try {
        await db.query('INSERT INTO user_watchlist (user_id, content_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
            [req.user.id, req.params.contentId]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});

router.delete('/watchlist/:contentId', async (req, res) => {
    await db.query('DELETE FROM user_watchlist WHERE user_id=$1 AND content_id=$2', [req.user.id, req.params.contentId]);
    res.json({ success: true });
});

// ── FAVORITES ─────────────────────────────────────────────
router.get('/favorites', async (req, res) => {
    const rows = await db.query(`
        SELECT c.content_id as id, c.title, c.content_type as type, c.thumbnail_url as image, c.access_level
        FROM user_favorites f JOIN content c ON f.content_id = c.content_id
        WHERE f.user_id = $1 ORDER BY f.added_at DESC
    `, [req.user.id]);
    const mapped = await Promise.all(rows.rows.map(async r => ({ ...r, image: await resolveImage(r.id, r.image, r.title), accessLevel: r.access_level })));
    res.json(mapped);
});

router.post('/favorites/:contentId', async (req, res) => {
    try {
        await db.query('INSERT INTO user_favorites (user_id, content_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
            [req.user.id, req.params.contentId]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});

router.delete('/favorites/:contentId', async (req, res) => {
    await db.query('DELETE FROM user_favorites WHERE user_id=$1 AND content_id=$2', [req.user.id, req.params.contentId]);
    res.json({ success: true });
});

// ── CONTINUE WATCHING ──────────────────────────────────────
router.get('/continue', async (req, res) => {
    const rows = await db.query(`
        SELECT c.content_id as id, c.title, c.content_type as type, c.thumbnail_url as image, c.access_level,
               cw.season_number, cw.episode_number, cw.progress_seconds, cw.updated_at
        FROM continue_watching cw JOIN content c ON cw.content_id = c.content_id
        WHERE cw.user_id = $1 ORDER BY cw.updated_at DESC LIMIT 20
    `, [req.user.id]);
    const mapped = await Promise.all(rows.rows.map(async r => ({ ...r, image: await resolveImage(r.id, r.image, r.title), accessLevel: r.access_level })));
    res.json(mapped);
});

router.post('/continue/:contentId', async (req, res) => {
    const { season_number, episode_number, progress_seconds } = req.body;
    await db.query(`
        INSERT INTO continue_watching (user_id, content_id, season_number, episode_number, progress_seconds, updated_at)
        VALUES ($1,$2,$3,$4,$5,NOW())
        ON CONFLICT (user_id, content_id) DO UPDATE SET
            season_number=$3, episode_number=$4, progress_seconds=$5, updated_at=NOW()
    `, [req.user.id, req.params.contentId, season_number || null, episode_number || null, progress_seconds || 0]);
    res.json({ success: true });
});

// ── STATUS CHECK (is content in watchlist/favorites?) ─────
router.get('/status/:contentId', async (req, res) => {
    const [wl, fav, cw] = await Promise.all([
        db.query('SELECT 1 FROM user_watchlist WHERE user_id=$1 AND content_id=$2', [req.user.id, req.params.contentId]),
        db.query('SELECT 1 FROM user_favorites WHERE user_id=$1 AND content_id=$2', [req.user.id, req.params.contentId]),
        db.query('SELECT progress_seconds, season_number, episode_number FROM continue_watching WHERE user_id=$1 AND content_id=$2', [req.user.id, req.params.contentId]),
    ]);
    res.json({
        inWatchlist: wl.rows.length > 0,
        inFavorites: fav.rows.length > 0,
        continueWatching: cw.rows[0] || null,
    });
});

module.exports = router;
