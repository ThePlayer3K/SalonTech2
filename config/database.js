function getDatabaseConfig() {
  return {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  };
}

module.exports = { getDatabaseConfig };
