require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  await client.connect();
  try {
    const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
    await client.query(schema);
    console.log('Schema PostgreSQL aplicado com sucesso.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Falha ao aplicar o schema:', error.message);
  process.exitCode = 1;
});
