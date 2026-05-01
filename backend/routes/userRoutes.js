const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const db = require('../db');

// GET /api/user/profile
router.get('/profile', verifyToken, async (req, res) => {
    try {
        const r = await db.query(
            'SELECT user_id, name, email, phone, created_at, status FROM users WHERE user_id=$1',
            [req.user.id]
        );
        if (!r.rows.length) return res.status(404).json({ message: 'User not found' });
        res.json({ user: r.rows[0] });
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
});

// GET /api/user/recommendations — based on genre of watched content
router.get('/recommendations', verifyToken, async (req, res) => {
    try {
        // Find genres of content user has in their continue_watching / favorites
        // Then return other content matching those genres
        // Simple strategy: return content NOT in user's watchlist/favorites, ordered by release_year DESC
        const rows = await db.query(`
            SELECT c.content_id as id, c.title, c.content_type as type,
                   c.thumbnail_url as image, c.release_year as year, c.age_rating as rating
            FROM content c
            WHERE c.content_id NOT IN (
                SELECT content_id FROM user_watchlist WHERE user_id=$1
                UNION
                SELECT content_id FROM user_favorites WHERE user_id=$1
            )
            ORDER BY RANDOM() LIMIT 12
        `, [req.user.id]);

        const resolveImage = async (r) => {
            if (r.image && r.image.startsWith('http')) return r.image;
            if (r.image) {
                try {
                    const s3Service = require('../services/s3Service');
                    return await s3Service.getPresignedUrl(r.image, 3600 * 24);
                } catch (e) {
                    console.error('Presigned URL error:', e.message);
                }
            }
            return `https://via.placeholder.com/500x750/14141a/ffffff?text=${encodeURIComponent(r.title)}`;
        };
        const mapped = await Promise.all(rows.rows.map(async r => ({ ...r, image: await resolveImage(r) })));
        res.json(mapped);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Error fetching recommendations' });
    }
});

module.exports = router;

// POST /api/user/pay — Dummy payment flow
router.post('/pay', verifyToken, async (req, res) => {
    const { plan_id, amount } = req.body;
    try {
        const userId = req.user.id;
        // Mock successful transaction
        const transactionId = 'MOCK_' + Math.random().toString(36).substr(2, 9);
        
        const client = await db.pool ? await db.pool.connect() : null;
        if (client) await client.query('BEGIN');
        
        await db.query(
            'UPDATE user_subscriptions SET plan_id = $1, status = $2 WHERE user_id = $3',
            [plan_id, 'ACTIVE', userId]
        );
        
        await db.query(
            'INSERT INTO payments (user_id, amount, payment_method, payment_status, transaction_id, provider) VALUES ($1, $2, $3, $4, $5, $6)',
            [userId, amount, 'Credit Card', 'SUCCESS', transactionId, 'DUMMY']
        );
        
        if (client) {
            await client.query('COMMIT');
            client.release();
        }
        
        res.json({ message: 'Payment successful', transactionId });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Payment failed' });
    }
});
