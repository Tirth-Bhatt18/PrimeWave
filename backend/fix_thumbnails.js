const { Client } = require('pg');

const client = new Client({
    connectionString: 'postgres://postgres:tirthisthebest@localhost:5432/PrimeWave'
});

// Correct TMDB poster URLs for every content item
const CORRECT_POSTERS = {
    'Inception': 'https://image.tmdb.org/t/p/w500/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg',
    'Interstellar': 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    'Forrest Gump': 'https://image.tmdb.org/t/p/w500/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg',
    'The Shawshank Redemption': 'https://image.tmdb.org/t/p/w500/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg',
    'Fight Club': 'https://image.tmdb.org/t/p/w500/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
    'Se7en': 'https://image.tmdb.org/t/p/w500/6yoghtyTpznpBik8EngEmJskVUO.jpg',
    'Gone Girl': 'https://image.tmdb.org/t/p/w500/lv5xShBIDPe6d4MIHfnYpMRkFLE.jpg',
    'Shutter Island': 'https://image.tmdb.org/t/p/w500/kve20tXMHZpm4x8mypcBW0YeYfl.jpg',
    'Narcos': 'https://image.tmdb.org/t/p/w500/rTmal9fDbwh5F0waol2hq35U4ah.jpg',
    'Mindhunter': 'https://image.tmdb.org/t/p/w500/zlD76aLhiNGsZSmFnFzRbz3vYqo.jpg',
    'Money Heist': 'https://image.tmdb.org/t/p/w500/reEMJA1OFf0oHFkR6Dz3sHb1v6U.jpg',
    'Dark': 'https://image.tmdb.org/t/p/w500/apbrbWs8M9lyOpJYU5WXrpFbk1Z.jpg',
    'You': 'https://image.tmdb.org/t/p/w500/7ppVAa2OUHLP1F1QT40gSPeq4MN.jpg',
    'Stranger Things': 'https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg',
    'Westworld': 'https://image.tmdb.org/t/p/w500/y55oBgC98sMd85sJfMKAJbMVr3S.jpg',
    'Breaking Bad': 'https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
};

client.connect().then(async () => {
    let updated = 0;
    for (const [title, url] of Object.entries(CORRECT_POSTERS)) {
        const res = await client.query(
            'UPDATE content SET thumbnail_url = $1 WHERE title = $2 RETURNING content_id',
            [url, title]
        );
        if (res.rowCount > 0) {
            console.log(`✅ Updated: ${title}`);
            updated++;
        } else {
            console.log(`⚠️  Not found: ${title}`);
        }
    }
    console.log(`\nDone. Updated ${updated} rows.`);
    client.end();
}).catch(err => {
    console.error('Error:', err);
    client.end();
});
