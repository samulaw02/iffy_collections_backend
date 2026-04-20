require('dotenv').config();
const pool = require('./db');
const bcrypt = require('bcryptjs');

/**
 * Run once on a fresh production deployment to create the first admin account.
 * Reads credentials from environment variables — never hardcoded.
 *
 * Usage:
 *   ADMIN_NAME="Iffy CEO" ADMIN_EMAIL="ceo@iffycollections.com" ADMIN_PASSWORD="YourStrongPass!" node src/utils/init-admin.js
 *
 * Or set ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD in your .env file and run:
 *   npm run init:admin
 *
 * Safe to run multiple times — skips if the email already exists.
 */

const initAdmin = async () => {
  const name     = process.env.ADMIN_NAME;
  const email    = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!name || !email || !password) {
    console.error('❌  Missing required environment variables.');
    console.error('    Set ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD before running this script.');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('❌  ADMIN_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      console.log(`⚠️   Admin account already exists for ${email} — skipping.`);
      console.log('    To reset the password use the Settings page inside the app.');
      return;
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await client.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin') RETURNING id, name, email`,
      [name, email, hash]
    );

    console.log('✅  Admin account created successfully.');
    console.log(`    Name  : ${result.rows[0].name}`);
    console.log(`    Email : ${result.rows[0].email}`);
    console.log('');
    console.log('    Log in and go to Settings → Change Password to update your password after first login.');
    console.log('    Then use User Management to add Sales Reps and Store Managers.');
  } catch (err) {
    console.error('❌  Failed to create admin:', err.message);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
};

initAdmin();
