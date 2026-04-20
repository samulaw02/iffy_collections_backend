require('dotenv').config();
const pool = require('./db');

/**
 * Wipes all transactional and seeded data from the database.
 * Schema (tables, indexes, constraints) is preserved.
 * Run this before going live to start with a clean slate.
 *
 *   npm run db:clear
 */

const clearDb = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Order matters — delete dependents before parents
    await client.query('DELETE FROM sale_items');
    await client.query('DELETE FROM stock_adjustments');
    await client.query('DELETE FROM sale_returns');
    await client.query('DELETE FROM sales');
    await client.query('DELETE FROM products');
    await client.query('DELETE FROM customers');
    await client.query('DELETE FROM audit_log');
    await client.query('DELETE FROM categories');
    await client.query('DELETE FROM users');

    // Clear uploaded avatar files record (actual files on disk can be removed separately)
    await client.query(`UPDATE users SET avatar_url = NULL WHERE TRUE`);

    await client.query('COMMIT');

    console.log('✅  Database cleared successfully. All tables are empty.');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Run  npm run init:admin  to create the production admin account.');
    console.log('  2. Log in as admin and add categories, then import products via Bulk Import.');
    console.log('  3. Use User Management to add Sales Reps and Store Managers.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌  Clear failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
};

clearDb();
