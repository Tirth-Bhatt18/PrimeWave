const express = require('express');
const router = express.Router();
const { verifyToken, isUser } = require('../middleware/authMiddleware');
const db = require('../db');

// GET /api/user/profile (protected by user role)
router.get('/profile', verifyToken, isUser, async (req, res) => {
    try {
        // req.user contains id from the token
        const userRes = await db.query(
            'SELECT user_id, name, email, phone, created_at, status FROM users WHERE user_id = $1',
            [req.user.id]
        );

        if (userRes.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            message: 'User profile retrieved successfully',
            user: userRes.rows[0]
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error retrieving profile' });
    }
});

module.exports = router;
