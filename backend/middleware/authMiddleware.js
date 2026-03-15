const jwt = require('jsonwebtoken');
require('dotenv').config();

// Middleware to verify if the token is valid and present
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    // Token usually comes as "Bearer <token>"
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Access Denied: No Token Provided!' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Contains id and role (user/admin)
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or Expired Token' });
    }
};

// Middleware to check for Admin role
const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({ message: 'Access Denied: Admin privileges required!' });
    }
};

// Middleware to check for User role
const isUser = (req, res, next) => {
    if (req.user && req.user.role === 'user') {
        next();
    } else {
        return res.status(403).json({ message: 'Access Denied: User privileges required!' });
    }
};

module.exports = {
    verifyToken,
    isAdmin,
    isUser
};
