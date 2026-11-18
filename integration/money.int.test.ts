import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { serveApp, expenseBody, newUser, sequelize, wipeAll } from './helpers.js';

// Money is stored exactly, to the cent (numeric(12,2)), and the API still
// sends amounts as numbers. All data invented.
const app = await serveApp();

beforeEach(wipeAll);

describe('money columns (real database)', () => {
  it('are exact decimals to the cent after the migrations', async () => {
    const [rows] = await sequelize.query(`
      SELECT table_name, column_name, data_type, numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (table_name, column_name) IN (
          ('expenses', 'amount'), ('income_entries', 'amount'),
          ('recurring_expenses', 'amount'), ('recurring_income_entries', 'amount'),
          ('category_budgets', 'budget'))
      ORDER BY table_name`);
    expect(rows).toEqual(
      [
        'category_budgets',
        'expenses',
        'income_entries',
        'recurring_expenses',
        'recurring_income_entries',
      ].map((table) => ({
        table_name: table,
        column_name: table === 'category_budgets' ? 'budget' : 'amount',
        data_type: 'numeric',
        numeric_precision: 12,
        numeric_scale: 2,
      })),
    );
  });

  it('keeps cents exact through saving, listing and totals', async () => {
    const user = newUser();
    const post = (amount: string) =>
      request(app)
        .post('/expenses')
        .set('x-test-user', user)
        .send(expenseBody({ amount, datePosted: '2026-03-15' }));
    // Ten dimes add up to 0.9999999999999999 in floating point.
    for (let i = 0; i < 10; i += 1) await post('0.1');
    await post('19.99');

    const month = await request(app).get('/expenses?yearMonth=2026-03').set('x-test-user', user);
    const amounts = month.body.data.map((e: { amount: unknown }) => e.amount);
    expect(amounts).toContain(19.99);
    expect(amounts.every((a: unknown) => typeof a === 'number')).toBe(true);
    expect(month.body.expensesTotal.totalAmountThisMonthUsd).toBe('20.99');

    const report = await request(app)
      .get('/reports/monthly?yearMonth=2026-03')
      .set('x-test-user', user);
    expect(report.body.totalSpentUsd).toBe(20.99);
  });

  it('rounds a third decimal to the cent when storing', async () => {
    const user = newUser();
    const res = await request(app)
      .post('/expenses')
      .set('x-test-user', user)
      .send(expenseBody({ amount: '12.345' }));
    expect(res.status).toBe(201);
    const [rows] = await sequelize.query(`SELECT amount::text AS amount FROM expenses`);
    expect(rows).toEqual([{ amount: '12.35' }]);
  });
});
