const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
require('dotenv').config();

// POST /api/auth/register (user)
router.post('/register', async (req, res) => {
    const { name, email, password, phone } = req.body;

    // Simple validation
    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Please provide name, email and password' });
    }

    try {
        // Check if user already exists
        const userExists = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ message: 'User already exists with this email' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert user
        const newUser = await db.query(
            'INSERT INTO users (name, email, password, phone) VALUES ($1, $2, $3, $4) RETURNING user_id, name, email',
            [name, email, hashedPassword, phone]
        );

        res.status(201).json({
            message: 'User registered successfully',
            user: newUser.rows[0]
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error during registration' });
    }
});

// POST /api/auth/admin/register (admin)
router.post('/admin/register', async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Please provide name, email and password' });
    }

    try {
        // Check if admin already exists
        const adminExists = await db.query('SELECT * FROM admins WHERE email = $1', [email]);
        if (adminExists.rows.length > 0) {
            return res.status(400).json({ message: 'Admin already exists with this email' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newAdmin = await db.query(
            'INSERT INTO admins (name, email, password) VALUES ($1, $2, $3) RETURNING admin_id, name, email',
            [name, email, hashedPassword]
        );

        res.status(201).json({
            message: 'Admin registered successfully',
            admin: newAdmin.rows[0]
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error during admin registration' });
    }
});

// POST /api/auth/login (user or admin)
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Please provide email and password' });
    }

    try {
        let person = null;
        let role = '';

        // Search in users table first
        const userRes = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userRes.rows.length > 0) {
            person = userRes.rows[0];
            role = 'user';
        } else {
            // Search in admins table
            const adminRes = await db.query('SELECT * FROM admins WHERE email = $1', [email]);
            if (adminRes.rows.length > 0) {
                person = adminRes.rows[0];
                role = 'admin';
            }
        }

        if (!person) {
            return res.status(401).json({ message: 'Invalid Credentials' });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, person.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid Credentials' });
        }

        // Create JWT
        const payload = {
            id: role === 'user' ? person.user_id : person.admin_id,
            email: person.email,
            role: role
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: process.env.TOKEN_EXPIRES_IN || '24h'
        });

        res.json({
            message: `${role.charAt(0).toUpperCase() + role.slice(1)} login successful`,
            token,
            user: {
                id: payload.id,
                name: person.name,
                email: person.email,
                role: role
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error during login' });
    }
});

module.exports = router;
