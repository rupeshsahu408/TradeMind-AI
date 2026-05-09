// In-memory session store — simple and sufficient for single-user personal app
// Sessions expire after 7 days of inactivity
const sessions = new Map();
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Clean up expired sessions every hour
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (now - session.lastActive > SESSION_TTL_MS) {
      sessions.delete(token);
    }
  }
}, 60 * 60 * 1000);

module.exports = { sessions, SESSION_TTL_MS };
