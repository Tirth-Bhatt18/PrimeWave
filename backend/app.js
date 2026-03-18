const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const db = require('./db');

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();

// Middleware
app.use(cors()); // Enable CORS for the frontend to connect
app.use(express.json()); // Parse incoming JSON requests

// Health check route
app.get('/', (req, res) => {
    res.send('PrimeWave Authorization API is running...');
});

// Route Mounting
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : {}
    });
});

// Port configuration
const PORT = process.env.PORT || 5000;

const startServer = async () => {
    try {
        const connectionInfo = await db.checkConnection();
        console.log(`Database connection verified: ${connectionInfo.db}`);

        const tableInfo = await db.checkAuthTables();
        if (!tableInfo.usersTableExists || !tableInfo.adminsTableExists) {
            throw new Error('Required tables are missing. Ensure users and admins tables exist.');
        }

        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    } catch (err) {
        console.error('Failed to start backend due to database configuration issue:', err.message);
        process.exit(1);
    }
};

startServer();

module.exports = app;
