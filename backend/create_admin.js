const bcrypt = require('bcryptjs');
const { Client } = require('pg');

const client = new Client({
    connectionString: 'postgres://postgres:tirthisthebest@localhost:5432/PrimeWave'
});

client.connect().then(async () => {
    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash('admin123', salt);
        await client.query('INSERT INTO admins (name, email, password) VALUES ($1, $2, $3)', ['Admin User', 'admin@primewave.com', hash]);
        console.log('Admin created: admin@primewave.com / admin123');
    } catch (e) {
        if(e.code === '23505') console.log('Admin already exists');
        else console.error(e);
    } finally {
        client.end();
    }
});
