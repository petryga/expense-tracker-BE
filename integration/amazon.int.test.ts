import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Category } from '../models/Category.js';
import { Expense } from '../models/Expense.js';
import { ImportedItem } from '../models/ImportedItem.js';
import { pastItemChoices } from '../utils/imports/itemExamples.js';
import { buildApp, newUser, wipeAll } from './helpers.js';

const app = buildApp();

// Invented statement and order history (PLANS.md, Phase D).
const statement = (rows: [string, string, string, string][]) =>
  ['Date,Description,Amount,Reference', ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join(
    '\n',
  );
const STATEMENT = statement([
  ['03/04/2026', 'AMAZON MKTPL*TEST0001 SEATTLE WA', '17.49', "'5001"], // one order, two items
  ['03/10/2026', 'AMAZON.COM*TEST0002 SEATTLE WA', '10.00', "'5002"], // two orders fit
  ['03/12/2026', 'AMAZON MKTPL*TEST0003 SEATTLE WA', '99.99', "'5003"], // no order
  ['03/13/2026', 'CORNER CAFE TESTTOWN', '4.50', "'5004"],
]);

const ORDER_HEADER =
  'Order ID,Order Date,Ship Date,Currency,Total Amount,ASIN,Payment Method Type,Order Status,Product Name,Original Quantity,Shipping Address';
const order = (
  id: string,
  date: string,
  total: string,
  asin: string,
  name: string,
  pay = 'AmericanExpress - 0001',
) =>
  [
    id,
    `${date}T10:00:00Z`,
    `${date}T12:00:00Z`,
    'USD',
    total,
    asin,
    pay,
    'Closed',
    name,
    '1',
    '1 Test St',
  ]
    .map((v) => `"${v}"`)
    .join(',');
const ORDERS = [
  ORDER_HEADER,
  order(
    '111-0000001-0000001',
    '2026-03-03',
    '12.50',
    'B0TEST0001',
    'Test Garden Hose Nozzle, Brass',
  ),
  order('111-0000001-0000001', '2026-03-03', '4.99', 'B0TEST0002', 'Test Phone Cable 2m'),
  order('111-0000002-0000002', '2026-03-09', '10.00', 'B0TEST0003', 'Test Notebook A5'),
  order('111-0000003-0000003', '2026-03-09', '10.00', 'B0TEST0004', 'Test Sticky Notes'),
  order(
    '111-0000004-0000004',
    '2026-03-09',
    '10.00',
    'B0TEST0005',
    'Paid Another Way',
    'Visa - 0002',
  ),
].join('\n');

const as = (req: request.Test, user: string) => req.set('x-test-user', user);
type Item = { id: string; description: string; amountCents: number };
type Row = {
  id: string;
  description: string;
  amountCents: number;
  amazonStatus: string | null;
  items: Item[];
  amazonCandidates: { key: string; items: Item[] }[];
};
const rowOf = (body: { rows: Row[] }, ref: string) =>
  body.rows.find((r) => r.description.includes(ref))!;

const uploadStatement = (user: string) =>
  as(request(app).post('/imports'), user).send({ fileName: 'activity.csv', csv: STATEMENT });
const uploadOrders = (user: string) =>
  as(request(app).post('/imports/amazon'), user).send({ csv: ORDERS });
const getImport = (user: string, id: string) => as(request(app).get(`/imports/${id}`), user);

beforeEach(async () => {
  await wipeAll();
  vi.stubEnv('AUTH_DISABLED', 'true');
  vi.stubEnv('AI_CATEGORIZE_ENABLED', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Amazon orders in statement import (real database)', () => {
  it('splits a charge into its items when the order history comes first', async () => {
    const user = newUser();
    const orders = await uploadOrders(user);
    expect(orders.status).toBe(201);
    expect(orders.body).toEqual({ kind: 'orders', itemCount: 5, newItemCount: 5, matchedCount: 0 });

    const res = await uploadStatement(user);
    const split = rowOf(res.body, 'TEST0001');
    expect(split.amazonStatus).toBe('matched');
    expect(split.items.map((i) => [i.description, i.amountCents])).toEqual([
      ['Test Garden Hose Nozzle, Brass', 1250],
      ['Test Phone Cable 2m', 499],
    ]);
    // Visa-paid order excluded: two candidates, not three.
    const several = rowOf(res.body, 'TEST0002');
    expect(several.amazonStatus).toBe('ambiguous');
    expect(several.amazonCandidates.map((c) => c.key).sort()).toEqual([
      '111-0000002-0000002',
      '111-0000003-0000003',
    ]);
    expect(rowOf(res.body, 'TEST0003').amazonStatus).toBeNull();
    expect(rowOf(res.body, 'CORNER CAFE').amazonStatus).toBeNull();
  });

  it('matches open charges when the order history comes after the statement, once', async () => {
    const user = newUser();
    const { body } = await uploadStatement(user);
    expect(rowOf(body, 'TEST0001').items).toEqual([]);
    expect((await uploadOrders(user)).body).toMatchObject({ newItemCount: 5, matchedCount: 1 });
    // Uploading the same export again adds and matches nothing.
    expect((await uploadOrders(user)).body).toEqual({
      kind: 'orders',
      itemCount: 5,
      newItemCount: 0,
      matchedCount: 0,
    });
    const after = await getImport(user, body.id);
    expect(rowOf(after.body, 'TEST0001').items).toHaveLength(2);
  });

  it('saves one expense per item, adding up to the charge', async () => {
    const user = newUser();
    await uploadOrders(user);
    const { body } = await uploadStatement(user);
    const split = rowOf(body, 'TEST0001');
    const confirm = (items: unknown) =>
      as(request(app).post(`/imports/${body.id}/confirm`), user).send({
        rows: [{ id: split.id, action: 'save', items }],
      });
    // Every item needs a category.
    expect((await confirm([{ id: split.items[0].id, category: 'Garden' }])).status).toBe(400);

    const res = await confirm([
      { id: split.items[0].id, category: 'Garden', isGift: true },
      { id: split.items[1].id, category: 'Electronics', description: 'Cable' },
    ]);
    expect(res.status).toBe(200);
    const expenses = await Expense.findAll({
      where: { userId: user },
      order: [['amount', 'DESC']],
    });
    expect(
      expenses.map((e) => [e.description, e.category, String(e.amount), e.isGift, e.datePosted]),
    ).toEqual([
      ['Test Garden Hose Nozzle, Brass', 'Garden', '12.5', true, '2026-03-04'],
      ['Cable', 'Electronics', '4.99', false, '2026-03-04'],
    ]);

    // Deleting the import deletes both item expenses.
    const del = await as(request(app).delete(`/imports/${body.id}`), user);
    expect(del.body).toEqual({ deletedExpenses: 2 });
    expect(await ImportedItem.count({ where: { userId: user } })).toBe(0);
  });

  it('lets the user pick one of several orders, or keep the charge whole', async () => {
    const user = newUser();
    await uploadOrders(user);
    const { body } = await uploadStatement(user);
    const several = rowOf(body, 'TEST0002');
    const choose = (orderKey: string | null, rowId = several.id) =>
      as(request(app).post(`/imports/${body.id}/rows/${rowId}/amazon`), user).send({ orderKey });

    expect((await choose('not-a-candidate')).status).toBe(400);
    const picked = await choose('111-0000003-0000003');
    expect(picked.status).toBe(200);
    expect(rowOf(picked.body, 'TEST0002').items.map((i) => i.description)).toEqual([
      'Test Sticky Notes',
    ]);

    const declined = await choose(null, rowOf(body, 'TEST0001').id);
    expect(rowOf(declined.body, 'TEST0001')).toMatchObject({ amazonStatus: 'declined', items: [] });
    // Kept whole, it saves as one ordinary expense.
    const save = await as(request(app).post(`/imports/${body.id}/confirm`), user).send({
      rows: [{ id: rowOf(body, 'TEST0001').id, action: 'save', category: 'Shopping' }],
    });
    expect(save.status).toBe(200);
    expect(await Expense.count({ where: { userId: user } })).toBe(1);
  });

  it("keeps users' order histories apart", async () => {
    const owner = newUser();
    await uploadOrders(owner);
    const { body } = await uploadStatement(newUser());
    expect(rowOf(body, 'TEST0001').amazonStatus).toBeNull();
  });

  it('rejects a file that is not the order history, and the demo user', async () => {
    const user = newUser();
    const bad = await as(request(app).post('/imports/amazon'), user).send({ csv: STATEMENT });
    expect(bad.status).toBe(400);
    vi.stubEnv('AUTH_DISABLED', '');
    vi.stubEnv('DEMO_USER_ID', user);
    expect((await uploadOrders(user)).status).toBe(403);
  });

  it('asks the AI service about each item by product name, not about the charge', async () => {
    const user = newUser();
    const parent = await Category.create({ name: 'Home', userId: user, isDefault: false });
    await Category.create({
      name: 'Garden',
      userId: user,
      parentCategoryId: parent.id,
      isDefault: false,
    });
    vi.stubEnv('AI_CATEGORIZE_ENABLED', 'true');
    vi.stubEnv('AI_SERVICE_URL', 'http://ai.test');
    vi.stubEnv('AI_SHARED_SECRET', 'test');
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/examples')) return new Response('{}');
      const { rows } = JSON.parse(init.body as string) as { rows: { id: string; text: string }[] };
      return new Response(
        JSON.stringify({
          suggestions: rows.map((r) => ({
            id: r.id,
            category: r.text.includes('Hose') ? 'Garden' : null,
            source: r.text.includes('Hose') ? 'model' : 'none',
          })),
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    await uploadOrders(user);
    const { body } = await uploadStatement(user);

    for (let i = 0; i < 100; i++) {
      const res = await getImport(user, body.id);
      const items = rowOf(res.body, 'TEST0001').items as (Item & {
        suggestionStatus: string;
        suggestedCategory: string | null;
      })[];
      if (items.every((item) => item.suggestionStatus !== 'pending')) {
        expect(items.map((item) => item.suggestedCategory)).toEqual(['Garden', null]);
        const bodies = fetchMock.mock.calls.map(([url, init]) => ({
          url,
          ...JSON.parse(init.body as string),
        }));
        const asked = bodies.find((b) => b.url.endsWith('/categorize'));
        const sent = asked.rows as { text: string; kind?: string }[];
        expect(sent.map((r) => r.text)).toContain('Test Phone Cable 2m');
        expect(sent.map((r) => r.text)).not.toContain('AMAZON MKTPL*TEST0001 SEATTLE WA');
        // Items (not statement rows) are marked as items, and asked for
        // this user after the service got their past choices (none yet).
        expect(sent.map((r) => r.kind === 'item')).toEqual(
          sent.map((r) => r.text.startsWith('Test ')),
        );
        expect(asked.userId).toBe(user);
        expect(bodies[0]).toMatchObject({ userId: user, examples: [] });
        expect(bodies[0].url.endsWith('/examples')).toBe(true);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('suggestions never settled');
  });

  it('offers saved items as past choices, following later edits and deletions', async () => {
    const user = newUser();
    await uploadOrders(user);
    const { body } = await uploadStatement(user);
    const split = rowOf(body, 'TEST0001');
    expect(await pastItemChoices(user)).toEqual([]);

    await as(request(app).post(`/imports/${body.id}/confirm`), user).send({
      rows: [
        {
          id: split.id,
          action: 'save',
          items: [
            { id: split.items[0].id, category: 'Garden', description: 'Nozzle' },
            { id: split.items[1].id, category: 'Electronics' },
          ],
        },
      ],
    });
    const choices = async () =>
      (await pastItemChoices(user)).map(({ text, category }) => ({ text, category }));
    // The product name, not the shortened description the expense got.
    expect(await choices()).toEqual(
      expect.arrayContaining([
        { text: 'Test Garden Hose Nozzle, Brass', category: 'Garden' },
        { text: 'Test Phone Cable 2m', category: 'Electronics' },
      ]),
    );
    expect((await pastItemChoices(user))[0].source).toMatch(/^[0-9a-f-]{36}$/);
    // Someone else never sees them.
    expect(await pastItemChoices(newUser())).toEqual([]);

    // Recategorized later in the app: the new category is the choice.
    await Expense.update({ category: 'Home' }, { where: { userId: user, category: 'Garden' } });
    // Deleted later: no longer a choice.
    await Expense.destroy({ where: { userId: user, category: 'Electronics' } });
    expect(await choices()).toEqual([{ text: 'Test Garden Hose Nozzle, Brass', category: 'Home' }]);
  });

  describe('refunds of single items', () => {
    const REFUND = statement([['03/20/2026', 'AMAZON MARKETPLACE NA TESTREF', '-4.99', "'6001"]]);
    const uploadRefund = (user: string) =>
      as(request(app).post('/imports'), user).send({ fileName: 'later.csv', csv: REFUND });
    type FullRow = Row & {
      status: string;
      items: (Item & { status: string | null })[];
      matchedItem: { description: string } | null;
    };

    it('returns an item not saved yet together with its refund: neither becomes an expense', async () => {
      const user = newUser();
      await uploadOrders(user);
      const { body } = await uploadStatement(user);
      const refundImport = await uploadRefund(user);
      const refund = refundImport.body.rows[0] as FullRow;
      expect(refund.status).toBe('returned');
      expect(refund.matchedItem?.description).toBe('Test Phone Cable 2m');

      const split = rowOf((await getImport(user, body.id)).body, 'TEST0001') as FullRow;
      expect(split.items.map((i) => i.status)).toEqual([null, 'returned']);
      // Only the item kept needs a category.
      const save = await as(request(app).post(`/imports/${body.id}/confirm`), user).send({
        rows: [
          { id: split.id, action: 'save', items: [{ id: split.items[0].id, category: 'Garden' }] },
        ],
      });
      expect(save.status).toBe(200);
      const expenses = await Expense.findAll({ where: { userId: user } });
      expect(expenses.map((e) => e.description)).toEqual(['Test Garden Hose Nozzle, Brass']);

      // Deleting the refund's import puts the item back.
      await as(request(app).delete(`/imports/${refundImport.body.id}`), user);
      const after = rowOf((await getImport(user, body.id)).body, 'TEST0001') as FullRow;
      expect(after.items.map((i) => i.status)).toEqual([null, null]);
    });

    it("a refund for a saved item removes only that item's expense on return", async () => {
      const user = newUser();
      await uploadOrders(user);
      const { body } = await uploadStatement(user);
      const split = rowOf(body, 'TEST0001') as FullRow;
      await as(request(app).post(`/imports/${body.id}/confirm`), user).send({
        rows: [
          {
            id: split.id,
            action: 'save',
            items: split.items.map((i) => ({ id: i.id, category: 'Home' })),
          },
        ],
      });
      const refundImport = await uploadRefund(user);
      const refund = refundImport.body.rows[0] as FullRow;
      expect(refund.status).toBe('draft');
      expect(refund.matchedItem?.description).toBe('Test Phone Cable 2m');

      const res = await as(
        request(app).post(`/imports/${refundImport.body.id}/confirm`),
        user,
      ).send({
        rows: [{ id: refund.id, action: 'return' }],
      });
      expect(res.body.returned).toBe(1);
      const expenses = await Expense.findAll({ where: { userId: user } });
      expect(expenses.map((e) => e.description)).toEqual(['Test Garden Hose Nozzle, Brass']);
    });

    it("uses Amazon's refund list when same-price items are in different orders", async () => {
      const user = newUser();
      const orders = [
        ORDER_HEADER,
        order('222-0000001-0000001', '2026-04-01', '3.00', 'B0TEST0011', 'Test Pen Set'),
        order('222-0000001-0000001', '2026-04-01', '6.00', 'B0TEST0012', 'Test Ruler'),
        order('222-0000002-0000002', '2026-04-02', '3.00', 'B0TEST0013', 'Test Eraser Pack'),
        order('222-0000002-0000002', '2026-04-02', '8.00', 'B0TEST0014', 'Test Stapler'),
      ].join('\n');
      await as(request(app).post('/imports/amazon'), user).send({ csv: orders });
      const { body } = await as(request(app).post('/imports'), user).send({
        fileName: 'april.csv',
        csv: statement([
          ['04/02/2026', 'AMAZON MKTPL*TEST0011 SEATTLE WA', '9.00', "'7001"],
          ['04/03/2026', 'AMAZON MKTPL*TEST0012 SEATTLE WA', '11.00', "'7002"],
          ['04/15/2026', 'AMAZON MARKETPLACE NA TESTREF', '-3.00', "'7003"],
        ]),
      });
      const refundRow = () =>
        getImport(user, body.id).then((r) =>
          (r.body.rows as FullRow[]).find((x) => x.description.includes('TESTREF'))!,
        );
      expect((await refundRow()).matchedItem).toBeNull();

      const refunds = await as(request(app).post('/imports/amazon'), user).send({
        csv: 'Order ID,Refund Amount,Refund Date,Currency\n"222-0000002-0000002","3.00","2026-04-14T10:00:00Z","USD"',
      });
      expect(refunds.body).toEqual({
        kind: 'refunds',
        refundCount: 1,
        newRefundCount: 1,
        pairedCount: 1,
      });
      expect((await refundRow()).matchedItem?.description).toBe('Test Eraser Pack');
    });
  });

  it('splits a charge paid partly with a gift card across its items once the user picks the order', async () => {
    const user = newUser();
    const gift = 'AmericanExpress - 0001 and Gift Certificate/Card';
    await as(request(app).post('/imports/amazon'), user).send({
      csv: [
        ORDER_HEADER,
        order('333-0000001-0000001', '2026-05-01', '30.00', 'B0TEST0021', 'Test Desk Lamp', gift),
        order('333-0000001-0000001', '2026-05-01', '10.00', 'B0TEST0022', 'Test Bulb', gift),
      ].join('\n'),
    });
    const { body } = await as(request(app).post('/imports'), user).send({
      fileName: 'may.csv',
      csv: statement([['05/02/2026', 'AMAZON MKTPL*TEST0021 SEATTLE WA', '25.00', "'8001"]]),
    });
    const row = rowOf(body, 'TEST0021') as Row & {
      amazonCandidates: { key: string; partial: boolean }[];
    };
    expect(row.amazonStatus).toBe('ambiguous');
    expect(row.amazonCandidates.map((c) => [c.key, c.partial])).toEqual([
      ['333-0000001-0000001', true],
    ]);

    const picked = await as(
      request(app).post(`/imports/${body.id}/rows/${row.id}/amazon`),
      user,
    ).send({
      orderKey: '333-0000001-0000001',
    });
    expect(rowOf(picked.body, 'TEST0021').items.map((i) => [i.description, i.amountCents])).toEqual(
      [
        ['Test Bulb', 625],
        ['Test Desk Lamp', 1875],
      ],
    );
  });
});
