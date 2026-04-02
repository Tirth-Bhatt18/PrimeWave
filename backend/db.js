const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set in environment variables');
}

// Create a new pool instance to manage PostgreSQL connections
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
  // For production environments like Heroku, you might need:
  // ssl: {
  //   rejectUnauthorized: false
  // }
});

// Test the connection
pool.on('connect', () => {
  console.log('Connected to the PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

const checkConnection = async () => {
  const result = await pool.query('SELECT current_database() AS db, NOW() AS connected_at');
  return result.rows[0];
};

const checkAuthTables = async () => {
  const result = await pool.query(
    `SELECT to_regclass('public.users') AS users_table, to_regclass('public.admins') AS admins_table`
  );

  const { users_table: usersTable, admins_table: adminsTable } = result.rows[0];
  
  // Extend schema for Phase 2, 3, 4
  try {
    await pool.query(`ALTER TABLE content ADD COLUMN IF NOT EXISTS access_level INT DEFAULT 1`);
    await pool.query(`ALTER TABLE content ADD COLUMN IF NOT EXISTS audio_tracks JSONB DEFAULT '[]'::jsonb`);
    await pool.query(`ALTER TABLE content ADD COLUMN IF NOT EXISTS subtitle_tracks JSONB DEFAULT '[]'::jsonb`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_watchlist (
        id SERIAL PRIMARY KEY, user_id INT NOT NULL, content_id INT NOT NULL,
        added_at TIMESTAMP DEFAULT NOW(), UNIQUE(user_id, content_id)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_favorites (
        id SERIAL PRIMARY KEY, user_id INT NOT NULL, content_id INT NOT NULL,
        added_at TIMESTAMP DEFAULT NOW(), UNIQUE(user_id, content_id)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS continue_watching (
        id SERIAL PRIMARY KEY, user_id INT NOT NULL, content_id INT NOT NULL,
        season_number INT, episode_number INT, progress_seconds INT DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW(), UNIQUE(user_id, content_id)
      )
    `);
  } catch(e) {
    console.warn("Schema extension warning:", e.message);
  }

  return {
    usersTableExists: Boolean(usersTable),
    adminsTableExists: Boolean(adminsTable),
  };
};

module.exports = {
  query: (text, params) => pool.query(text, params),
  checkConnection,
  checkAuthTables,
};
