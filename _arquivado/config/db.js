const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

pool.on('error', (error) => {
  console.error('Erro inesperado no pool PostgreSQL:', error);
});

function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
