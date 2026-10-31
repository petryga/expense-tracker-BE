import { defineConfig } from 'vitest/config';
import { TEST_DB_NAME } from './integration/testDb.js';

// Point every worker at the throwaway database *before* config/database.ts is
// imported anywhere (it reads DB_DATABASE at module load).
process.env.DB_DATABASE = TEST_DB_NAME;
process.env.AUTH_DISABLED = 'true';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.int.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    globalSetup: ['./integration/globalSetup.ts'],
    // One shared database, so test files run one after another.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
