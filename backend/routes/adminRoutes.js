const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');
const db = require('../db');

// GET /api/admin/dashboard (protected by admin role)
router.get('/dashboard', verifyToken, isAdmin, async (req, res) => {
    try {
        // For a dashboard, we might want some stats
        const userCount = await db.query('SELECT COUNT(*) FROM users');
        const adminRes = await db.query(
            'SELECT admin_id, name, email FROM admins WHERE admin_id = $1',
            [req.user.id]
        );

        if (adminRes.rows.length === 0) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        res.json({
            message: 'Admin dashboard data retrieved successfully',
            admin: adminRes.rows[0],
            stats: {
                totalUsers: parseInt(userCount.rows[0].count)
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error retrieving dashboard' });
    }
});

module.exports = router;
