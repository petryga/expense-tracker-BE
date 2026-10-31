import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Integration tests need a real Postgres; run them with `npm run test:integration`.
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.int.test.ts'],
  },
});
