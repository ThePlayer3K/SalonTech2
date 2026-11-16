const { Pool } = require('pg');
const { getDatabaseConfig } = require('./database');

const pool = new Pool(getDatabaseConfig());

pool.on('error', (error) => {
  console.error('Erro inesperado no pool PostgreSQL:', error);
});

function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
