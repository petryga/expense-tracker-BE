import { execSync } from 'node:child_process';
import pg from 'pg';
import { getAdminConnection, TEST_DB_NAME } from './testDb.js';

const withAdmin = async (fn: (client: pg.Client) => Promise<void>) => {
  const client = new pg.Client(getAdminConnection());
  await client.connect();
  try {
    await fn(client);
  } finally {
    await client.end();
  }
};

export async function setup() {
  await withAdmin(async (client) => {
    await client.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  });

  // The same migrations that run on every deploy, applied to an empty database.
  execSync('npx sequelize-cli db:migrate --options-path .sequelizerc.cjs', {
    stdio: 'pipe',
    env: { ...process.env, DB_DATABASE: TEST_DB_NAME },
  });
}

export async function teardown() {
  await withAdmin(async (client) => {
    await client.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
  });
}
