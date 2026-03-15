const { Pool } = require('pg');
require('dotenv').config();

// Create a new pool instance to manage PostgreSQL connections
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};
