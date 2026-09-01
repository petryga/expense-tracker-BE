require('dotenv').config();

// Mirrors config/database.ts: Supabase (and most hosted Postgres providers)
// require SSL and reject plain connections; local Postgres has no cert to
// verify, so only enable it once we're clearly not pointed at localhost.
const dbHost = process.env.DB_HOST || 'localhost';
const isLocalDb = dbHost === 'localhost' || dbHost === '127.0.0.1';
const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true';

const common = {
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  host: dbHost,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  dialect: 'postgres',
  seederStorage: 'sequelize',
  seederStorageTableName: 'SequelizeSeedMeta',
  dialectOptions: isLocalDb ? {} : { ssl: { require: true, rejectUnauthorized } },
};

module.exports = {
  development: common,
  test: common,
  production: common,
};
