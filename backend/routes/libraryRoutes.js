const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const db = require('../db');




// Resolve poster image — thumbnail_url should be a full URL; fallback to placeholder
const resolveImage = (id, thumb, title) => {
    if (thumb && thumb.startsWith('http')) return thumb;
    return `https://via.placeholder.com/500x750/14141a/ffffff?text=${encodeURIComponent(title)}`;
};

// ── WATCHLIST ──────────────────────────────────────────────
router.get('/watchlist', verifyToken, async (req, res) => {
    const rows = await db.query(`
        SELECT c.content_id as id, c.title, c.content_type as type, c.thumbnail_url as image
        FROM user_watchlist w JOIN content c ON w.content_id = c.content_id
        WHERE w.user_id = $1 ORDER BY w.added_at DESC
    `, [req.user.id]);
    res.json(rows.rows.map(r => ({ ...r, image: resolveImage(r.id, r.image, r.title) })));
});

router.post('/watchlist/:contentId', verifyToken, async (req, res) => {
    try {
        await db.query('INSERT INTO user_watchlist (user_id, content_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
            [req.user.id, req.params.contentId]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});

router.delete('/watchlist/:contentId', verifyToken, async (req, res) => {
    await db.query('DELETE FROM user_watchlist WHERE user_id=$1 AND content_id=$2', [req.user.id, req.params.contentId]);
    res.json({ success: true });
});

// ── FAVORITES ─────────────────────────────────────────────
router.get('/favorites', verifyToken, async (req, res) => {
    const rows = await db.query(`
        SELECT c.content_id as id, c.title, c.content_type as type, c.thumbnail_url as image
        FROM user_favorites f JOIN content c ON f.content_id = c.content_id
        WHERE f.user_id = $1 ORDER BY f.added_at DESC
    `, [req.user.id]);
    res.json(rows.rows.map(r => ({ ...r, image: resolveImage(r.id, r.image, r.title) })));
});

router.post('/favorites/:contentId', verifyToken, async (req, res) => {
    try {
        await db.query('INSERT INTO user_favorites (user_id, content_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
            [req.user.id, req.params.contentId]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: 'Error' }); }
});

router.delete('/favorites/:contentId', verifyToken, async (req, res) => {
    await db.query('DELETE FROM user_favorites WHERE user_id=$1 AND content_id=$2', [req.user.id, req.params.contentId]);
    res.json({ success: true });
});

// ── CONTINUE WATCHING ──────────────────────────────────────
router.get('/continue', verifyToken, async (req, res) => {
    const rows = await db.query(`
        SELECT c.content_id as id, c.title, c.content_type as type, c.thumbnail_url as image,
               cw.season_number, cw.episode_number, cw.progress_seconds, cw.updated_at
        FROM continue_watching cw JOIN content c ON cw.content_id = c.content_id
        WHERE cw.user_id = $1 ORDER BY cw.updated_at DESC LIMIT 20
    `, [req.user.id]);
    res.json(rows.rows.map(r => ({ ...r, image: resolveImage(r.id, r.image, r.title) })));
});

router.post('/continue/:contentId', verifyToken, async (req, res) => {
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
router.get('/status/:contentId', verifyToken, async (req, res) => {
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
