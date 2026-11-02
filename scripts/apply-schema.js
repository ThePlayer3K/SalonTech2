require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { applyMigrations } = require('./apply-migrations');

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  await client.connect();
  try {
    await client.query('BEGIN');
    const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
    await client.query(schema);
    await applyMigrations(client);
    await client.query('COMMIT');
    console.log('Schema PostgreSQL aplicado com sucesso.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Falha ao aplicar o schema:', error.message);
  process.exitCode = 1;
});
