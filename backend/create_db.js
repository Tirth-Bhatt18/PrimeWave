const { Client } = require('pg');
require('dotenv').config();

const createDb = async () => {
    // Extract base connection string (user, pass, host, port) without the database name
    // Standard format: postgres://user:pass@host:port/dbname
    const url = process.env.DATABASE_URL;
    const baseUrl = url.substring(0, url.lastIndexOf('/')) + '/postgres';

    const client = new Client({
        connectionString: baseUrl,
    });

    try {
        await client.connect();
        console.log('Connected to default postgres database');

        // Check if primewave exists
        const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'primewave'");
        if (res.rowCount === 0) {
            console.log('Creating database "primewave"...');
            await client.query('CREATE DATABASE primewave');
            console.log('Database "primewave" created successfully');
        } else {
            console.log('Database "primewave" already exists');
        }
    } catch (err) {
        console.error('Error creating database:', err);
    } finally {
        await client.end();
    }
};

createDb();
