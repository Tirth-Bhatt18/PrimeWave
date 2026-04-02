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

        const IMAGE_MAP = {
            'departed.jpg': 'https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg',
            'scarface.jpg': 'https://image.tmdb.org/t/p/w500/rAiYTfKGqDCRIIqo664sY9XZIvQ.jpg',
            'gone_girl.jpg': 'https://image.tmdb.org/t/p/w500/fQBzPFHZ8p8n7V9x8A8LMxhMOnU.jpg',
            'shutter_island.jpg': 'https://image.tmdb.org/t/p/w500/52d4oRBRCECoUCAB3JJGhZCAj0.jpg',
            'fight_club.jpg': 'https://image.tmdb.org/t/p/w500/bptfVGEQuv6vDTIMVCHjJ9Dz8PX.jpg',
            'se7en.jpg': 'https://image.tmdb.org/t/p/w500/6yoghtyTpznpBik8EngEmJskVUO.jpg',
            'forrest_gump.jpg': 'https://image.tmdb.org/t/p/w500/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg',
            'shawshank.jpg': 'https://image.tmdb.org/t/p/w500/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg',
            'narcos.jpg': 'https://image.tmdb.org/t/p/w500/rTmal9fDbwh5F0waol2hq35U4ah.jpg',
            'mindhunter.jpg': 'https://image.tmdb.org/t/p/w500/zlD76aLhiNGsZSmFnFzRbz3vYqo.jpg',
            'money_heist.jpg': 'https://image.tmdb.org/t/p/w500/reEMJA1OFf0oHFkR6Dz3sHb1v6U.jpg',
            'dark.jpg': 'https://image.tmdb.org/t/p/w500/apbrbWs8M9lyOpJYU5WXrpFbk1Z.jpg',
            'you.jpg': 'https://image.tmdb.org/t/p/w500/7ppVAa2OUHLP1F1QT40gSPeq4MN.jpg',
            'stranger_things.jpg': 'https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg',
            'westworld.jpg': 'https://image.tmdb.org/t/p/w500/jbFSMqSJ5VKWQzUE7MvJLEWGJBh.jpg',
        };
        const resolve = (r) => {
            if (r.id === 1) return 'https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg';
            if (r.id === 2) return 'https://image.tmdb.org/t/p/w500/rAiYTfKGqDCRIIqo664sY9XZIvQ.jpg';
            if (r.id === 101) return 'https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg';
            if (r.image && IMAGE_MAP[r.image]) return IMAGE_MAP[r.image];
            return `https://via.placeholder.com/500x750/14141a/ffffff?text=${encodeURIComponent(r.title)}`;
        };
        res.json(rows.rows.map(r => ({ ...r, image: resolve(r) })));
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Error fetching recommendations' });
    }
});

module.exports = router;
