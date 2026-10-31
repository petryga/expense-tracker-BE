import dotenv from 'dotenv';

dotenv.config();

// Everything in here is destroyed and recreated on each run, so it must never be
// able to point at a database that holds real data.
export const TEST_DB_NAME = 'et_test_integration';

export const getAdminConnection = () => {
  const host = process.env.DB_HOST || 'localhost';
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(
      `Refusing to run integration tests against DB_HOST=${host}: they drop and recreate ` +
        `the "${TEST_DB_NAME}" database. Point DB_HOST at a local Postgres.`,
    );
  }
  if (!process.env.DB_USERNAME || !process.env.DB_PASSWORD) {
    throw new Error('DB_USERNAME and DB_PASSWORD must be set (see BE/.env).');
  }
  return {
    host,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    // The server's maintenance database; the test database can't drop itself.
    database: 'postgres',
  };
};
