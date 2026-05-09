require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const schema = require('./schema');

// NEON_DATABASE_URL = user's self-managed Neon PostgreSQL (always preferred).
// DATABASE_URL is Replit's managed database — used only as last resort.
const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('[DB] ERROR: NEON_DATABASE_URL is not set. Add it in Replit Secrets.');
  process.exit(1);
}

console.log('[DB] Using:', connectionString.includes('neon.tech') ? 'Neon PostgreSQL (user database)' : 'Replit managed database');

const pool = new Pool({
  connectionString,
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
