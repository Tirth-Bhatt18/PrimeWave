const pool = require('./db');

const initDb = async () => {
    const createTablesQuery = `
    -- Create users table if it doesn't exist
    CREATE TABLE IF NOT EXISTS users (
      user_id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      phone VARCHAR(20),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      status VARCHAR(20) DEFAULT 'active'
    );

    -- Create admins table if it doesn't exist
    CREATE TABLE IF NOT EXISTS admins (
      admin_id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL
    );
  `;

    try {
        await pool.query(createTablesQuery);
        console.log('Database tables initialized successfully');
    } catch (err) {
        console.error('Error initializing database tables:', err);
    }
};

// If this script is run directly, execute the initialization
if (require.main === module) {
    initDb().then(() => process.exit());
}

module.exports = initDb;
