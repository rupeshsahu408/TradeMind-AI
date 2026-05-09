const { sessions } = require('../db/sessions');

function requireAuth(req, res, next) {
  const token = req.headers['x-session-token'] || req.headers['authorization']?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. No session token provided.' });
  }

  const session = sessions.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Session invalid or expired. Please log in again.' });
  }

  // Refresh session TTL (24 hour sliding window)
  session.lastActive = Date.now();
  req.userId = session.userId;
  req.sessionToken = token;
  next();
}

module.exports = { requireAuth };
