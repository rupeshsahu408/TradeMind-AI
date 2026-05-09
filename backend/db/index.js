// Load .env file if present (local dev). On Replit/Vercel, secrets are injected automatically.
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const schema = require('./schema');

if (!process.env.DATABASE_URL) {
  console.error('[DB] ERROR: DATABASE_URL is not set. Check your .env file.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

const db = drizzle(pool, { schema });

async function testConnection() {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('[DB] Connected to Neon PostgreSQL successfully.');
    return true;
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    return false;
  }
}

module.exports = { db, pool, testConnection };
