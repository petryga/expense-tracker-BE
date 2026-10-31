import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp, expenseBody, incomeBody, newUser, wipeAll } from './helpers.js';

const app = buildApp();
const as = (user: string) => ({
  get: (path: string) => request(app).get(path).set('x-test-user', user),
  post: (path: string, body: unknown) =>
    request(app)
      .post(path)
      .set('x-test-user', user)
      .send(body as object),
});

beforeEach(wipeAll);

describe('GET /reports/yearly-comparison', () => {
  it('totals each year per currency and converts to the base currency', async () => {
    const api = as(newUser());
    await api.post('/expenses', [
      expenseBody({ datePosted: '2025-06-01', amount: '100', currency: 'CAD' }),
      expenseBody({ datePosted: '2026-01-01', amount: '50', currency: 'USD' }),
      expenseBody({ datePosted: '2026-02-01', amount: '100', currency: 'CAD' }),
    ]);

    const response = await api.get('/reports/yearly-comparison?mode=full-year&baseCurrency=USD');

    expect(response.status).toBe(200);
    expect(response.body.rows).toMatchObject([
      { year: 2025, amountCad: 100, amountUsd: 0, convertedTotal: 74, monthsCount: 1 },
      { year: 2026, amountCad: 100, amountUsd: 50, convertedTotal: 124, monthsCount: 2 },
    ]);
  });

  it('applies a YTD cutoff and can leave a year out', async () => {
    const api = as(newUser());
    await api.post('/expenses', [
      expenseBody({ datePosted: '2025-01-01', amount: '10' }),
      expenseBody({ datePosted: '2025-02-01', amount: '10' }),
      expenseBody({ datePosted: '2026-01-01', amount: '10' }),
      expenseBody({ datePosted: '2026-02-01', amount: '10' }),
    ]);

    const response = await api.get('/reports/yearly-comparison?mode=ytd&cutoffs=2025:1,2026:none');

    expect(response.body.rows).toHaveLength(1);
    expect(response.body.rows[0]).toMatchObject({ year: 2025, cutoffMonth: 1, amountUsd: 10 });
    expect(response.body.ytdCutoffOptionsByYear).toEqual({ 2025: [1, 2], 2026: [1, 2] });
  });

  it("only includes the requesting user's expenses", async () => {
    const [a, b] = [as(newUser()), as(newUser())];
    await a.post('/expenses', expenseBody({ amount: '1' }));
    await b.post('/expenses', expenseBody({ amount: '1000' }));

    const response = await a.get('/reports/yearly-comparison');

    expect(response.body.rows[0].amountUsd).toBe(1);
  });
});

describe('GET /reports/months and /reports/monthly', () => {
  it('lists months newest first and breaks one month down by category', async () => {
    const api = as(newUser());
    await api.post('/expenses', [
      expenseBody({
        datePosted: '2026-01-05',
        category: 'Rent',
        amount: '1000',
        description: 'jan rent',
      }),
      expenseBody({
        datePosted: '2026-03-02',
        category: 'Rent',
        amount: '900',
        description: 'rent',
      }),
      expenseBody({
        datePosted: '2026-03-09',
        category: 'Coffee',
        amount: '5',
        description: 'latte',
      }),
      expenseBody({
        datePosted: '2026-03-10',
        category: 'Coffee',
        amount: '7',
        description: 'beans',
        currency: 'CAD',
      }),
      expenseBody({ datePosted: '2026-03-11', category: '', amount: '3', description: 'mystery' }),
      expenseBody({ datePosted: '2026-03-12', category: 'Refund', amount: '-20' }),
    ]);

    const months = await api.get('/reports/months');
    expect(months.body).toEqual(['2026-03', '2026-01']);

    const march = await api.get('/reports/monthly?yearMonth=2026-03');
    expect(march.status).toBe(200);
    expect(march.body.totalSpentUsd).toBe(908);
    expect(march.body.totalSpentCad).toBe(7);
    expect(march.body.dataByCategory.map((c: any) => [c.category, c.total])).toEqual([
      ['Rent', 900],
      ['Coffee', 12],
      ['Uncategorized', 3],
    ]);
    expect(march.body.dataByCategory[1].details.map((d: any) => d.description)).toEqual([
      'beans',
      'latte',
    ]);
  });

  it('returns an empty report for a month with no expenses', async () => {
    const api = as(newUser());
    const response = await api.get('/reports/monthly?yearMonth=2030-01');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      yearMonth: '2030-01',
      dataByCategory: [],
      totalSpentCad: 0,
      totalSpentUsd: 0,
    });
  });

  it('puts an expense in the month it was dated, whatever the server time zone', async () => {
    const api = as(newUser());
    await api.post('/expenses', expenseBody({ datePosted: '2026-01-31', amount: '10' }));
    await api.post('/expenses', expenseBody({ datePosted: '2026-02-01', amount: '20' }));

    expect((await api.get('/reports/monthly?yearMonth=2026-01')).body.totalSpentUsd).toBe(10);
    expect((await api.get('/reports/monthly?yearMonth=2026-02')).body.totalSpentUsd).toBe(20);
  });

  it('rejects a malformed month', async () => {
    const api = as(newUser());
    expect((await api.get('/reports/monthly?yearMonth=2026-13')).status).toBe(400);
    expect((await api.get('/reports/monthly')).status).toBe(400);
  });
});

describe('GET /reports/flow', () => {
  const seed = async (api: ReturnType<typeof as>) => {
    await api.post('/income', [
      incomeBody({ date: '2026-01-10', amount: '1000' }),
      incomeBody({ date: '2026-02-10', amount: '1000' }),
      incomeBody({ date: '2026-03-10', amount: '1200' }),
      incomeBody({ date: '2026-03-10', amount: '9999', category: 'crypto' }),
    ]);
    await api.post('/expenses', [
      expenseBody({ datePosted: '2026-02-15', category: 'Groceries', amount: '500' }),
      expenseBody({ datePosted: '2026-03-15', category: 'Rent', amount: '500' }),
      expenseBody({
        datePosted: '2026-03-16',
        category: 'Groceries',
        amount: '100',
        currency: 'CAD',
      }),
    ]);
  };

  it('compares the latest eligible month with the previous one', async () => {
    const api = as(newUser());
    await seed(api);

    const response = await api.get('/reports/flow');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      availableMonths: ['2026-02', '2026-03'],
      activeMonth: '2026-03',
      expenseTotal: 574, // 500 USD + 100 CAD at 0.74
      savings: 200,
      cashSavings: 200,
      investmentGrowth: 0,
      incomeAmount: 774,
      categories: [
        { category: 'Rent', value: 500 },
        { category: 'Groceries', value: 74 },
      ],
    });
  });

  it('honours an explicit month and falls back when it is not comparable', async () => {
    const api = as(newUser());
    await seed(api);

    expect((await api.get('/reports/flow?month=2026-02')).body.activeMonth).toBe('2026-02');
    expect((await api.get('/reports/flow?month=2020-01')).body.activeMonth).toBe('2026-03');
    expect((await api.get('/reports/flow?month=nope')).status).toBe(400);
  });

  it('is empty for a user with no income', async () => {
    const api = as(newUser());
    const response = await api.get('/reports/flow');

    expect(response.body).toMatchObject({ availableMonths: [], activeMonth: null, categories: [] });
  });
});
