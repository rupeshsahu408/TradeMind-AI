const { pgTable, serial, varchar, integer, boolean, timestamp, text, decimal } = require('drizzle-orm/pg-core');

const users = pgTable('users', {
  id: serial('id').primaryKey(),
  pin_hash: varchar('pin_hash', { length: 255 }).notNull(),
  language: varchar('language', { length: 10 }).default('english'),
  theme: varchar('theme', { length: 10 }).default('dark'),
  created_at: timestamp('created_at').defaultNow(),
});

const user_preferences = pgTable('user_preferences', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').references(() => users.id),
  trading_style: varchar('trading_style', { length: 50 }).default('all'),
  risk_appetite: varchar('risk_appetite', { length: 20 }).default('moderate'),
  min_confidence: integer('min_confidence').default(60),
  focus_sectors: text('focus_sectors').array(),
  notifications_enabled: boolean('notifications_enabled').default(true),
  briefing_auto: boolean('briefing_auto').default(false),
  updated_at: timestamp('updated_at').defaultNow(),
});

const watchlist = pgTable('watchlist', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').references(() => users.id),
  ticker: varchar('ticker', { length: 20 }).notNull(),
  company_name: varchar('company_name', { length: 100 }),
  added_at: timestamp('added_at').defaultNow(),
});

const chat_history = pgTable('chat_history', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').references(() => users.id),
  session_id: varchar('session_id', { length: 50 }),
  role: varchar('role', { length: 10 }).notNull(),
  content: text('content').notNull(),
  language: varchar('language', { length: 10 }).default('english'),
  created_at: timestamp('created_at').defaultNow(),
});

const predictions = pgTable('predictions', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').references(() => users.id),
  ticker: varchar('ticker', { length: 20 }),
  company_name: varchar('company_name', { length: 100 }),
  verdict: varchar('verdict', { length: 20 }).notNull(),
  confidence: integer('confidence').notNull(),
  signal_stack_score: integer('signal_stack_score'),
  reasoning: text('reasoning'),
  sources: text('sources').array(),
  risk_factors: text('risk_factors'),
  potential_gain_pct: decimal('potential_gain_pct'),
  potential_loss_pct: decimal('potential_loss_pct'),
  predicted_at: timestamp('predicted_at').defaultNow(),
  market_price_at_prediction: decimal('market_price_at_prediction'),
  timeframe: varchar('timeframe', { length: 20 }),
});

const accuracy_log = pgTable('accuracy_log', {
  id: serial('id').primaryKey(),
  prediction_id: integer('prediction_id').references(() => predictions.id),
  actual_close_price: decimal('actual_close_price'),
  actual_change_pct: decimal('actual_change_pct'),
  was_correct: boolean('was_correct'),
  checked_at: timestamp('checked_at').defaultNow(),
  notes: text('notes'),
});

const briefings = pgTable('briefings', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').references(() => users.id),
  content: text('content').notNull(),
  top_picks: text('top_picks').array(),
  market_mood: varchar('market_mood', { length: 20 }),
  fii_net_flow: decimal('fii_net_flow'),
  generated_at: timestamp('generated_at').defaultNow(),
});

const push_subscriptions = pgTable('push_subscriptions', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').references(() => users.id),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  created_at: timestamp('created_at').defaultNow(),
});

const alerts = pgTable('alerts', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').references(() => users.id),
  ticker: varchar('ticker', { length: 20 }),
  alert_type: varchar('alert_type', { length: 30 }),
  threshold_value: decimal('threshold_value'),
  is_active: boolean('is_active').default(true),
  created_at: timestamp('created_at').defaultNow(),
  last_triggered_at: timestamp('last_triggered_at'),
});

module.exports = {
  users,
  user_preferences,
  watchlist,
  chat_history,
  predictions,
  accuracy_log,
  briefings,
  push_subscriptions,
  alerts,
};
