require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

async function applyMigrations(client) {
  const directory = path.join(__dirname, '..', 'migrations');
  for (const filename of fs.readdirSync(directory).filter((name) => name.endsWith('.sql')).sort()) {
    await client.query(fs.readFileSync(path.join(directory, filename), 'utf8'));
  }
}

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    await applyMigrations(client);
    await client.query('COMMIT');
    console.log('Atualizações do banco aplicadas com sucesso.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { await client.end(); }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Falha ao atualizar o banco:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { applyMigrations };
