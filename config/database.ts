import dotenv from 'dotenv';
dotenv.config();
import { Sequelize } from 'sequelize';

if (!process.env.DB_DATABASE || !process.env.DB_USERNAME || !process.env.DB_PASSWORD) {
  console.error('Database configuration environment variables are missing');
  process.exit(1);
}

// Supabase (and most hosted Postgres providers) require SSL and reject plain
// connections; local Postgres has no cert to verify, so only enable it once
// we're clearly not pointed at localhost.
const dbHost = process.env.DB_HOST || 'localhost';
const isLocalDb = dbHost === 'localhost' || dbHost === '127.0.0.1';

export const sequelize = new Sequelize(
  process.env.DB_DATABASE,
  process.env.DB_USERNAME,
  process.env.DB_PASSWORD,
  {
    host: dbHost,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
    dialect: 'postgres',
    logging: false,
    dialectOptions: isLocalDb ? {} : { ssl: { require: true, rejectUnauthorized: false } },
  }
);
