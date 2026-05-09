require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { Pool } = require('pg');

const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('[Migrate] ERROR: NEON_DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

const migrations = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    pin_hash VARCHAR(255) NOT NULL,
    language VARCHAR(10) DEFAULT 'english',
    theme VARCHAR(10) DEFAULT 'dark',
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS user_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    trading_style VARCHAR(50) DEFAULT 'all',
    risk_appetite VARCHAR(20) DEFAULT 'moderate',
    min_confidence INTEGER DEFAULT 60,
    focus_sectors TEXT[],
    notifications_enabled BOOLEAN DEFAULT TRUE,
    briefing_auto BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS watchlist (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    ticker VARCHAR(20) NOT NULL,
    company_name VARCHAR(100),
    added_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS chat_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    session_id VARCHAR(50),
    role VARCHAR(10) NOT NULL,
    content TEXT NOT NULL,
    language VARCHAR(10) DEFAULT 'english',
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS predictions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    ticker VARCHAR(20),
    company_name VARCHAR(100),
    verdict VARCHAR(20) NOT NULL,
    confidence INTEGER NOT NULL,
    signal_stack_score INTEGER,
    reasoning TEXT,
    sources TEXT[],
    risk_factors TEXT,
    potential_gain_pct DECIMAL,
    potential_loss_pct DECIMAL,
    predicted_at TIMESTAMP DEFAULT NOW(),
    market_price_at_prediction DECIMAL,
    timeframe VARCHAR(20)
  );

  CREATE TABLE IF NOT EXISTS accuracy_log (
    id SERIAL PRIMARY KEY,
    prediction_id INTEGER REFERENCES predictions(id),
    actual_close_price DECIMAL,
    actual_change_pct DECIMAL,
    was_correct BOOLEAN,
    checked_at TIMESTAMP DEFAULT NOW(),
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS briefings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    content TEXT NOT NULL,
    top_picks TEXT[],
    market_mood VARCHAR(20),
    fii_net_flow DECIMAL,
    generated_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    ticker VARCHAR(20),
    alert_type VARCHAR(30),
    threshold_value DECIMAL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    last_triggered_at TIMESTAMP
  );
`;

async function runMigrations() {
  console.log('[Migrate] Connecting to Neon PostgreSQL...');
  console.log('[Migrate] Host:', connectionString.split('@')[1]?.split('/')[0] || 'unknown');
  try {
    await pool.query(migrations);
    console.log('[Migrate] All 9 tables created/verified successfully.');
  } catch (err) {
    console.error('[Migrate] Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
