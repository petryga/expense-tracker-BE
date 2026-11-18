import express, { type Express } from 'express';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { afterAll } from 'vitest';
import { listenLocal, stopServer } from '../testing/localServer.js';
import expensesRouter from '../services/expenses.js';
import incomeRouter from '../services/incomeEntries.js';
import monthlyData from '../services/monthlyData.js';
import reports from '../services/reports.js';
import categories from '../services/categories.js';
import imports from '../services/imports.js';
import marketplaces from '../services/marketplaces.js';
import { sequelize } from '../config/database.js';

// The real routers on a real database, minus auth/CORS/rate limiting. A request
// picks its user with an `x-test-user` header (absent = the no-auth null user),
// which lets one test exercise several users side by side.
const buildApp = (): Express => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const header = req.header('x-test-user');
    req.userId = header ?? null;
    next();
  });
  app.use('/expenses', expensesRouter);
  app.use('/income', incomeRouter);
  app.use('/monthlyData', monthlyData);
  app.use('/reports', reports);
  app.use('/categories', categories);
  app.use('/imports', imports);
  app.use('/marketplaces', marketplaces);
  return app;
};

// The app on one 127.0.0.1 server per test file (see testing/localServer.ts).
export const serveApp = async (): Promise<Server> => {
  const server = await listenLocal(buildApp());
  afterAll(() => stopServer(server));
  return server;
};

export const newUser = () => randomUUID();

export const expenseBody = (overrides: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  category: 'Groceries',
  amount: '10',
  account: 'Cash',
  description: 'test',
  datePosted: '2026-03-15',
  currency: 'USD',
  ...overrides,
});

export const incomeBody = (overrides: Record<string, unknown> = {}) => ({
  date: '2026-03-15',
  description: 'test',
  category: 'bankAccounts',
  amount: '100',
  currency: 'USD',
  ...overrides,
});

export const wipeAll = async () => {
  await sequelize.query(
    'TRUNCATE expenses, income_entries, categories, category_budgets, accounts, import_batches, imported_transactions, imported_items, amazon_order_items, amazon_refunds, saved_statement_rows, suggestion_outcomes, marketplaces RESTART IDENTITY',
  );
};

export { sequelize };
