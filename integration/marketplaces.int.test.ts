import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Expense } from '../models/Expense.js';
import { serveApp, newUser, wipeAll } from './helpers.js';

// All data invented.
const app = await serveApp();
const as = (req: request.Test, user: string) => req.set('x-test-user', user);
const add = (user: string, name: string) =>
  as(request(app).post('/marketplaces'), user).send({ name });

const expense = (description: string) => ({
  id: crypto.randomUUID(),
  category: 'Shopping',
  amount: '20',
  account: 'Card',
  description,
  datePosted: '2026-10-05',
  currency: 'USD',
});

beforeEach(async () => {
  await wipeAll();
  vi.stubEnv('AUTH_DISABLED', 'true');
  vi.stubEnv('AI_CATEGORIZE_ENABLED', '');
});

describe('marketplaces (real database)', () => {
  it('adds, lists, refuses a duplicate in any case, and deletes', async () => {
    const user = newUser();
    expect((await add(user, '  eBay ')).status).toBe(201);
    expect((await add(user, 'Poshmark')).status).toBe(201);
    expect((await add(user, 'AliExpress')).status).toBe(201);
    expect((await add(user, 'EBAY')).status).toBe(409);
    expect((await add(user, '')).status).toBe(400);

    const list = await as(request(app).get('/marketplaces'), user);
    expect(list.body.map((m: { name: string }) => m.name)).toEqual([
      'AliExpress',
      'eBay',
      'Poshmark',
    ]);

    const other = newUser();
    expect((await as(request(app).get('/marketplaces'), other)).body).toEqual([]);
    const ebay = list.body[1].id;
    expect((await as(request(app).delete(`/marketplaces/${ebay}`), other)).status).toBe(404);
    expect((await as(request(app).delete(`/marketplaces/${ebay}`), user)).status).toBe(204);
  });

  it('moves the marketplace of a new typed expense from its name to its merchant', async () => {
    const user = newUser();
    await add(user, 'Vinted');
    await add(user, 'Amazon');
    const one = await as(request(app).post('/expenses'), user).send(
      expense('VINTED - test jacket'),
    );
    expect([one.body.description, one.body.merchant]).toEqual(['Test jacket', 'Vinted']);
    const many = await as(request(app).post('/expenses'), user).send([
      expense('Amazon Test Lamp'),
      expense('Corner Test Cafe'),
    ]);
    expect(
      many.body.map((e: { description: string; merchant: string | null }) => [
        e.description,
        e.merchant,
      ]),
    ).toEqual([
      ['Test Lamp', 'Amazon'],
      ['Corner Test Cafe', null],
    ]);
    // Another user's list doesn't apply.
    const other = await as(request(app).post('/expenses'), newUser()).send(
      expense('Vinted Test Scarf'),
    );
    expect([other.body.description, other.body.merchant]).toEqual(['Vinted Test Scarf', null]);
  });

  it('with Amazon on the list, an import still splits the charge into items', async () => {
    const user = newUser();
    await add(user, 'Amazon');
    await add(user, 'eBay');
    const orders = [
      'Order ID,Order Date,Ship Date,Currency,Total Amount,ASIN,Payment Method Type,Order Status,Product Name,Original Quantity,Shipping Address',
      '"111-0000001-0000001","2026-03-03T10:00:00Z","2026-03-03T12:00:00Z","USD","12.50","B0TEST0001","AmericanExpress - 0001","Closed","Test Garden Hose Nozzle","1","1 Test St"',
      '"111-0000001-0000001","2026-03-03T10:00:00Z","2026-03-03T12:00:00Z","USD","4.99","B0TEST0002","AmericanExpress - 0001","Closed","Test Phone Cable 2m","1","1 Test St"',
    ].join('\n');
    await as(request(app).post('/imports/amazon'), user).send({ csv: orders });
    const statement = [
      'Date,Description,Amount,Reference',
      `"03/04/2026","AMAZON MKTPL*TEST0001 SEATTLE WA","17.49","'5001"`,
      `"03/06/2026","EBAY O*TEST-0002","8.00","'5002"`,
    ].join('\n');
    const { body } = await as(request(app).post('/imports'), user).send({
      fileName: 'activity.csv',
      csv: statement,
    });
    const amazon = body.rows.find((r: { description: string }) => r.description.includes('AMAZON'));
    const ebay = body.rows.find((r: { description: string }) => r.description.includes('EBAY'));
    expect(amazon.amazonStatus).toBe('matched');
    expect(amazon.items).toHaveLength(2);

    const saved = await as(request(app).post(`/imports/${body.id}/confirm`), user).send({
      rows: [
        {
          id: amazon.id,
          action: 'save',
          items: amazon.items.map((i: { id: string }) => ({ id: i.id, category: 'Home' })),
        },
        { id: ebay.id, action: 'save', category: 'Shopping' },
      ],
    });
    expect(saved.status).toBe(200);
    const expenses = await Expense.findAll({
      where: { userId: user },
      order: [['amount', 'DESC']],
    });
    expect(expenses.map((e) => [e.description, e.merchant])).toEqual([
      ['Test Garden Hose Nozzle', 'Amazon'],
      ['ebay o*test-0002', 'eBay'],
      ['Test Phone Cable 2m', 'Amazon'],
    ]);
  });
});
