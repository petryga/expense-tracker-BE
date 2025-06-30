import dotenv from 'dotenv';
dotenv.config();
import { Sequelize } from 'sequelize';

if (!process.env.DB_DATABASE || !process.env.DB_USERNAME || !process.env.DB_PASSWORD) {
  console.error('Database configuration environment variables are missing');
  process.exit(1);
}

export const sequelize = new Sequelize(
  process.env.DB_DATABASE,
  process.env.DB_USERNAME,
  process.env.DB_PASSWORD,
  {
    host: 'localhost',
    dialect: 'postgres',
    logging: false,
  }
);
