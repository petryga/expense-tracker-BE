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
  put: (path: string, body: unknown) =>
    request(app)
      .put(path)
      .set('x-test-user', user)
      .send(body as object),
  del: (path: string, body?: unknown) =>
    request(app)
      .delete(path)
      .set('x-test-user', user)
      .send(body as object),
});

// Totals are summed from the expenses/income tables on every read, so they can
// never disagree with the rows - these tests pin that down against a real DB,
// including the exact edits that used to leave the old stored rollup wrong.
const totals = async (api: ReturnType<typeof as>, query = '') => {
  const response = await api.get(`/monthlyData${query}`);
  expect(response.status).toBe(200);
  return Object.fromEntries(
    response.body.map((row: any) => [
      `${row.type}:${row.yearMonth}`,
      [row.amountCad, row.amountUsd],
    ]),
  );
};

beforeEach(wipeAll);

describe('monthly totals follow expense edits', () => {
  it('sums by month and currency', async () => {
    const api = as(newUser());
    await api.post(
      '/expenses',
      expenseBody({ datePosted: '2026-01-10', amount: '10', currency: 'USD' }),
    );
    await api.post(
      '/expenses',
      expenseBody({ datePosted: '2026-01-20', amount: '20', currency: 'CAD' }),
    );
    await api.post(
      '/expenses',
      expenseBody({ datePosted: '2026-02-01', amount: '5.5', currency: 'USD' }),
    );

    expect(await totals(api)).toEqual({
      'expense:2026-01': ['20.00', '10.00'],
      'expense:2026-02': ['0.00', '5.50'],
    });
  });

  it('moves the amount to the new month when an expense date is edited', async () => {
    const api = as(newUser());
    const body = expenseBody({ datePosted: '2026-01-10', amount: '40', currency: 'CAD' });
    await api.post('/expenses', body);

    const moved = await api.put(`/expenses/${body.id}`, { ...body, datePosted: '2026-03-05' });
    expect(moved.status).toBe(200);

    // The old rollup only recomputed the *new* month, leaving January overstated.
    expect(await totals(api)).toEqual({ 'expense:2026-03': ['40.00', '0.00'] });
  });

  it('follows an edit of amount and currency', async () => {
    const api = as(newUser());
    const body = expenseBody({ amount: '10', currency: 'USD' });
    await api.post('/expenses', body);

    await api.put(`/expenses/${body.id}`, { ...body, amount: '12', currency: 'CAD' });

    expect(await totals(api)).toEqual({ 'expense:2026-03': ['12.00', '0.00'] });
  });

  it('drops deleted expenses, one at a time and in bulk', async () => {
    const api = as(newUser());
    const [a, b, c] = [expenseBody(), expenseBody(), expenseBody()];
    await api.post('/expenses', [a, b, c]);
    expect(await totals(api)).toEqual({ 'expense:2026-03': ['0.00', '30.00'] });

    expect((await api.del(`/expenses/${a.id}`)).status).toBe(204);
    expect((await api.del('/expenses', [b.id, c.id])).status).toBe(204);

    expect(await totals(api)).toEqual({});
  });

  it('rejects an invalid date and stores nothing', async () => {
    const api = as(newUser());

    const single = await api.post('/expenses', expenseBody({ datePosted: 'soon' }));
    const bulk = await api.post('/expenses', [
      expenseBody(),
      expenseBody({ datePosted: '2026-13-40' }),
    ]);

    expect(single.status).toBe(400);
    expect(bulk.status).toBe(400);
    expect(await totals(api)).toEqual({});
  });

  it('never loses an amount when many expenses are created at once', async () => {
    const api = as(newUser());

    const responses = await Promise.all(
      Array.from({ length: 25 }, () => api.post('/expenses', expenseBody({ amount: '4' }))),
    );

    responses.forEach((response) => expect(response.status).toBe(201));
    expect(await totals(api)).toEqual({ 'expense:2026-03': ['0.00', '100.00'] });
  });

  it("keeps one user's rows out of another user's totals", async () => {
    const [a, b] = [as(newUser()), as(newUser())];
    await a.post('/expenses', expenseBody({ amount: '99' }));
    await b.post('/expenses', expenseBody({ amount: '1' }));

    expect(await totals(a)).toEqual({ 'expense:2026-03': ['0.00', '99.00'] });
    expect(await totals(b)).toEqual({ 'expense:2026-03': ['0.00', '1.00'] });
  });
});

describe('monthly totals follow income edits', () => {
  it('moves income to the new month when its date is edited', async () => {
    const api = as(newUser());
    const created = await api.post('/income', incomeBody({ date: '2026-01-15', amount: '500' }));
    expect(created.status).toBe(201);

    await api.put(`/income/${created.body.id}`, incomeBody({ date: '2026-04-02', amount: '500' }));

    expect(await totals(api)).toEqual({ 'income:2026-04': ['0.00', '500.00'] });
  });

  it('groups legacy ISO-timestamp dates by their calendar month', async () => {
    const api = as(newUser());
    await api.post('/income', incomeBody({ date: '2024-07-30T07:00:00.000Z', amount: '10' }));
    await api.post('/income', incomeBody({ date: '2024-07-02', amount: '5' }));

    expect(await totals(api)).toEqual({ 'income:2024-07': ['0.00', '15.00'] });
  });

  it('rejects an invalid date', async () => {
    const api = as(newUser());
    expect((await api.post('/income', incomeBody({ date: '2026/10/31' }))).status).toBe(400);
    expect(await totals(api)).toEqual({});
  });
});

describe('monthly totals filters', () => {
  it('narrows by type, category and currency in SQL', async () => {
    const api = as(newUser());
    await api.post('/expenses', expenseBody({ amount: '7' }));
    await api.post(
      '/income',
      incomeBody({ category: 'bankAccounts', currency: 'USD', amount: '100' }),
    );
    await api.post(
      '/income',
      incomeBody({ category: 'bankAccounts', currency: 'CAD', amount: '50' }),
    );
    await api.post('/income', incomeBody({ category: 'cash', currency: 'USD', amount: '25' }));

    expect(await totals(api, '?type=income')).toEqual({ 'income:2026-03': ['50.00', '125.00'] });
    expect(await totals(api, '?type=income&category=bankAccounts')).toEqual({
      'income:2026-03': ['50.00', '100.00'],
    });
    expect(await totals(api, '?type=income&category=bankAccounts&currency=USD')).toEqual({
      'income:2026-03': ['0.00', '100.00'],
    });
    expect(await totals(api, '?type=expense')).toEqual({ 'expense:2026-03': ['0.00', '7.00'] });
  });

  it('treats a category that does not exist as empty, not as "everything"', async () => {
    const api = as(newUser());
    await api.post('/income', incomeBody());

    expect(await totals(api, '?type=income&category=nope')).toEqual({});
  });
});
