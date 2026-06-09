const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },

  // Keep connections alive so the Supabase pooler doesn't drop them mid-import
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,

  // Pool sizing — enough headroom for concurrent requests + background jobs
  max: 10,
  idleTimeoutMillis: 30000,      // release idle clients after 30 s
  connectionTimeoutMillis: 10000, // fail fast if we can't get a connection in 10 s
});

pool.on('connect', () => console.log('Connected to PostgreSQL database'));
// Log pool errors but never let them crash the process
pool.on('error', (err) => console.error('Idle pool client error (non-fatal):', err.message));

module.exports = pool;
