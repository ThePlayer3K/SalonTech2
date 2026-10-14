const session = require('express-session');

const maxAgeHours = Number(process.env.SESSION_MAX_AGE_HOURS) || 8;

// TODO: no Render, trocar o MemoryStore por um store persistente (por exemplo,
// connect-pg-simple). A dependência não será instalada neste commit.
module.exports = session({
  secret: process.env.SESSION_SECRET || 'desenvolvimento-troque-este-segredo',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: maxAgeHours * 60 * 60 * 1000
  }
});
