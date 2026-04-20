require('dotenv').config();
const pool = require('./db');

const run = async () => {
  try {
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
    `);
    console.log('✅ avatar_url column added to users');
  } catch (err) {
    console.error('❌ Failed:', err.message);
  } finally {
    pool.end();
  }
};

run();
