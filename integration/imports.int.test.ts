import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import request from 'supertest';
import { Category } from '../models/Category.js';
import { Expense } from '../models/Expense.js';
import { ImportBatch } from '../models/ImportBatch.js';
import { ImportedTransaction } from '../models/ImportedTransaction.js';
import { resetDemoUserData } from '../utils/demoData.js';
import { pairingHooks } from '../utils/imports/pairing.js';
import { SavedStatementRow } from '../models/SavedStatementRow.js';
import { SuggestionOutcome } from '../models/SuggestionOutcome.js';
import { resetDailyLimits } from '../utils/dailyLimit.js';
import { serveApp, newUser, wipeAll } from './helpers.js';

const app = await serveApp();

// Synthetic statements. Each row has a Reference, like the real extended export.
const csv = (rows: [string, string, string, string][]) =>
  ['Date,Description,Amount,Reference', ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join(
    '\n',
  );

const SEPTEMBER = csv([
  ['09/02/2026', 'WHOLE FOODS MKT AUSTIN TX', '82.10', "'1001"],
  ['09/10/2026', 'AMAZON.COM*AB12C', '24.99', "'1002"],
  ['09/12/2026', 'LENSWORKS OPTICAL SPRINGFIELD', '60.00', "'1003"],
  ['09/20/2026', 'AUTOPAY PAYMENT - THANK YOU', '-500.00', "'1004"],
  ['09/21/2026', 'YOUR CASH REWARD/REFUND IS', '-3.00', "'1005"],
]);

// Overlaps September by one row, and refunds the Amazon purchase in full and
// the glasses only in part.
const OCTOBER = csv([
  ['09/12/2026', 'LENSWORKS OPTICAL SPRINGFIELD', '60.00', "'1003"],
  ['10/03/2026', 'AMAZON MARKEPLACE NA PA', '-24.99', "'2001"],
  ['10/04/2026', 'LENSWORKS OPTICAL SPRINGFIELD', '-20.00', "'2002"],
  ['10/05/2026', 'STARBUCKS 0123 AUSTIN TX', '5.25', "'2003"],
]);

// No user = the null user of local no-auth mode.
const as = (req: request.Test, user: string | null) => (user ? req.set('x-test-user', user) : req);

const upload = (user: string | null, body: string, extra: Record<string, unknown> = {}) =>
  as(request(app).post('/imports'), user).send({ fileName: 'activity.csv', csv: body, ...extra });

const confirm = (user: string | null, batchId: string, rows: unknown[]) =>
  as(request(app).post(`/imports/${batchId}/confirm`), user).send({ rows });

type Row = {
  id: string;
  description: string;
  status: string;
  kind: string;
  matched: { id: string } | null;
};
const byDesc = (rows: Row[], text: string, kind = 'charge') =>
  rows.find((r) => r.description.includes(text) && r.kind === kind)!;

beforeEach(async () => {
  await wipeAll();
  // Local mode by default; tests for production rules override these.
  vi.stubEnv('AUTH_DISABLED', 'true');
  vi.stubEnv('STATEMENT_UPLOAD_ENABLED', '');
  vi.stubEnv('DEMO_USER_ID', '');
});
afterEach(() => vi.unstubAllEnvs());

describe('statement import (real database)', () => {
  it('imports drafts, skips payments and rewards, and reconciles to the file', async () => {
    const user = newUser();
    const res = await upload(user, SEPTEMBER);

    expect(res.status).toBe(201);
    expect(res.body.rows).toHaveLength(5);
    expect(res.body.byStatus.draft.count).toBe(3);
    expect(res.body.byStatus.skipped).toEqual({ count: 2, cents: -50300 });
    expect(res.body.reconciliation).toMatchObject({
      fileTotalCents: 16709 - 50300,
      balanced: true,
    });
    expect(await Expense.count({ where: { userId: user } })).toBe(0); // nothing saved without review
  });

  it('does not duplicate rows when an overlapping file is uploaded again', async () => {
    const user = newUser();
    await upload(user, SEPTEMBER);
    const again = await upload(user, SEPTEMBER);
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ id: null, rowCount: 5, duplicateCount: 5 });
    const list = await request(app).get('/imports').set('x-test-user', user);
    expect(list.body.data).toHaveLength(1); // no empty import left behind

    const october = await upload(user, OCTOBER);
    expect(october.body.rows).toHaveLength(3);
    expect(october.body.reconciliation).toMatchObject({
      duplicateCount: 1,
      duplicateTotalCents: 6000,
      balanced: true,
    });
    expect(await ImportedTransaction.count({ where: { userId: user } })).toBe(8);
  });

  it('a refund cancels its draft purchase from an earlier month and upload: neither becomes an expense', async () => {
    const user = newUser();
    const sep = await upload(user, SEPTEMBER);
    const oct = await upload(user, OCTOBER);

    const refund = byDesc(oct.body.rows, 'AMAZON', 'refund');
    expect(refund.status).toBe('returned');
    const septemberNow = await request(app).get(`/imports/${sep.body.id}`).set('x-test-user', user);
    const purchase = byDesc(septemberNow.body.rows, 'AMAZON');
    expect(purchase.status).toBe('returned');
    expect(purchase.matched!.id).toBe(refund.id);

    // A partial refund is not paired; it waits for a decision.
    expect(byDesc(oct.body.rows, 'LENSWORKS', 'refund')).toMatchObject({
      status: 'draft',
      matched: null,
    });

    // A returned purchase can't be saved.
    const attempt = await confirm(user, sep.body.id, [
      { id: purchase.id, action: 'save', category: 'Shopping' },
    ]);
    expect(attempt.status).toBe(400);
  });

  it('a refund for a purchase already saved removes that expense when you choose return', async () => {
    const user = newUser();
    const sep = await upload(user, SEPTEMBER);
    const amazon = byDesc(sep.body.rows, 'AMAZON');
    const groceries = byDesc(sep.body.rows, 'WHOLE FOODS');
    const saved = await confirm(user, sep.body.id, [
      { id: amazon.id, action: 'save', category: 'Shopping' },
      { id: groceries.id, action: 'save', category: 'Groceries', description: 'groceries' },
    ]);
    expect(saved.body).toMatchObject({ saved: 2 });
    expect(await Expense.count({ where: { userId: user } })).toBe(2);

    const oct = await upload(user, OCTOBER);
    const refund = byDesc(oct.body.rows, 'AMAZON', 'refund');
    expect(refund.status).toBe('draft');
    expect(refund.matched).toMatchObject({ status: 'saved' });

    const returned = await confirm(user, oct.body.id, [{ id: refund.id, action: 'return' }]);
    expect(returned.status).toBe(200);
    const left = await Expense.findAll({ where: { userId: user } });
    expect(left.map((e) => [e.description, String(e.amount)])).toEqual([['groceries', '82.1']]);
  });

  it('saves confirmed charges as expenses with the right amount, date, account and currency', async () => {
    const user = newUser();
    const res = await upload(user, SEPTEMBER, { account: 'Amex', currency: 'CAD' });
    const drafts = (res.body.rows as Row[]).filter((r) => r.status === 'draft');
    const body = await confirm(
      user,
      res.body.id,
      drafts.map((r) => ({ id: r.id, action: 'save', category: 'Misc' })),
    );
    expect(body.status).toBe(200);
    expect(body.body.import.draftCount).toBe(0);

    const expenses = await Expense.findAll({
      where: { userId: user },
      order: [['datePosted', 'ASC']],
    });
    expect(
      expenses.map((e) => [e.datePosted, Number(e.amount), e.year, e.month, e.account, e.currency]),
    ).toEqual([
      ['2026-09-02', 82.1, 2026, 9, 'Amex', 'CAD'],
      ['2026-09-10', 24.99, 2026, 9, 'Amex', 'CAD'],
      ['2026-09-12', 60, 2026, 9, 'Amex', 'CAD'],
    ]);
    // Saved expense total equals the saved statement rows, to the cent.
    const savedCents = (body.body.import.byStatus.saved.cents as number) / 100;
    expect(expenses.reduce((s, e) => s + Number(e.amount), 0)).toBeCloseTo(savedCents, 2);

    const twice = await confirm(user, res.body.id, [{ id: drafts[0].id, action: 'skip' }]);
    expect(twice.status).toBe(400);
  });

  it('keeps users apart: no cross-user dedupe, pairing or access', async () => {
    const alice = newUser();
    const bob = newUser();
    const a = await upload(alice, SEPTEMBER);
    const b = await upload(bob, OCTOBER);

    expect(b.body.rows).toHaveLength(4); // the overlapping row is new for Bob
    expect(byDesc(b.body.rows, 'AMAZON', 'refund').status).toBe('draft'); // not paired with Alice's purchase
    expect((await request(app).get(`/imports/${a.body.id}`).set('x-test-user', bob)).status).toBe(
      404,
    );
    expect(
      (await confirm(bob, a.body.id, [{ id: a.body.rows[0].id, action: 'skip' }])).status,
    ).toBe(404);
  });

  it('pairs the same purchase only once when two uploads race', async () => {
    const user = newUser();
    await upload(user, SEPTEMBER);
    // Two files, each with its own refund for the one purchase, uploaded at once.
    // Each upload waits at the pairing step until the other one gets there too
    // (or 1 s passes). Without the per-user lock both arrive, both read the
    // purchase as unpaired, and both claim it. With the lock the second can't
    // reach that step until the first has finished, so the first waits out the
    // 1 s, pairs, commits, and the second then finds the purchase already taken.
    let arrived = 0;
    let releaseAll = () => {};
    const bothThere = new Promise<void>((resolve) => (releaseAll = resolve));
    const original = pairingHooks.beforePairing;
    pairingHooks.beforePairing = async () => {
      arrived += 1;
      if (arrived >= 2) releaseAll();
      await Promise.race([bothThere, new Promise((resolve) => setTimeout(resolve, 1000))]);
    };
    onTestFinished(() => {
      pairingHooks.beforePairing = original;
    });
    const sameRefundTwoFiles = [
      csv([['10/03/2026', 'AMAZON MARKEPLACE NA PA', '-24.99', "'3001"]]),
      csv([['10/04/2026', 'AMAZON MARKEPLACE NA PA', '-24.99', "'3002"]]),
    ];
    const results = await Promise.all(sameRefundTwoFiles.map((body) => upload(user, body)));
    results.forEach((r) => expect(r.status).toBe(201));
    expect(
      await ImportedTransaction.count({
        where: { userId: user, kind: 'refund', status: 'returned' },
      }),
    ).toBe(1);
  });

  it('rejects a malformed file with line numbers', async () => {
    const res = await upload(
      newUser(),
      "Date,Description,Amount,Reference\n99/99/2026,X,1.00,'9\n",
    );
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([
      { line: 2, message: 'Invalid date "99/99/2026" (expected MM/DD/YYYY)' },
    ]);
  });

  it('deleting an import releases the purchases it had paired', async () => {
    const user = newUser();
    const sep = await upload(user, SEPTEMBER);
    const oct = await upload(user, OCTOBER);
    const deleted = await request(app).delete(`/imports/${oct.body.id}`).set('x-test-user', user);
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ deletedExpenses: 0 });
    const septemberNow = await request(app).get(`/imports/${sep.body.id}`).set('x-test-user', user);
    expect(byDesc(septemberNow.body.rows, 'AMAZON')).toMatchObject({
      status: 'draft',
      matched: null,
    });
  });

  it('deleting an import also deletes the expenses it saved that still exist', async () => {
    const user = newUser();
    const other = newUser();
    const sep = await upload(user, SEPTEMBER);
    await upload(other, SEPTEMBER);
    const [groceries, amazon, lenses] = ['WHOLE FOODS', 'AMAZON', 'LENSWORKS'].map((t) =>
      byDesc(sep.body.rows, t),
    );
    await confirm(user, sep.body.id, [
      { id: groceries.id, action: 'save', category: 'Groceries' },
      { id: amazon.id, action: 'save', category: 'Shopping' },
      { id: lenses.id, action: 'skip' },
    ]);
    // One of the two saved expenses was already deleted on the Expenses page.
    const saved = await Expense.findAll({ where: { userId: user } });
    await saved[0].destroy();
    const before = await request(app).get(`/imports/${sep.body.id}`).set('x-test-user', user);
    expect(before.body.savedExpenseCount).toBe(1);

    const deleted = await request(app).delete(`/imports/${sep.body.id}`).set('x-test-user', user);
    expect(deleted.body).toEqual({ deletedExpenses: 1 });
    expect(await Expense.count({ where: { userId: user } })).toBe(0);
    expect(await ImportBatch.count({ where: { userId: user } })).toBe(0);
    expect(await ImportedTransaction.count({ where: { userId: user } })).toBe(0);
    expect(await ImportedTransaction.count({ where: { userId: other } })).toBe(5);

    // The same file can be imported again afterwards.
    expect((await upload(user, SEPTEMBER)).status).toBe(201);
  });

  it('saves a row confirmed as a gift with its real category and the gift flag', async () => {
    const user = newUser();
    const sep = await upload(user, SEPTEMBER);
    const groceries = byDesc(sep.body.rows, 'WHOLE FOODS');
    const res = await confirm(user, sep.body.id, [
      { id: groceries.id, action: 'save', category: 'Groceries', isGift: true },
    ]);
    expect(res.status).toBe(200);
    const [expense] = await Expense.findAll({ where: { userId: user } });
    expect(expense).toMatchObject({ category: 'Groceries', isGift: true });
    // A non-boolean isGift is rejected rather than guessed.
    const bad = await confirm(user, sep.body.id, [
      {
        id: byDesc(sep.body.rows, 'LENSWORKS').id,
        action: 'save',
        category: 'Eyewear',
        isGift: 'yes',
      },
    ]);
    expect(bad.status).toBe(400);
  });

  it('puts skipped rows back into review, and only skipped rows', async () => {
    const user = newUser();
    const sep = await upload(user, SEPTEMBER);
    const [groceries, lenses] = ['WHOLE FOODS', 'LENSWORKS'].map((t) => byDesc(sep.body.rows, t));
    const payment = byDesc(sep.body.rows, 'AUTOPAY', 'payment');
    await confirm(user, sep.body.id, [
      { id: groceries.id, action: 'save', category: 'Groceries' },
      { id: lenses.id, action: 'skip' },
    ]);
    const reopen = (rowIds: string[], who: string = user) =>
      as(request(app).post(`/imports/${sep.body.id}/reopen`), who).send({ rowIds });

    const res = await reopen([lenses.id, payment.id]);
    expect(res.status).toBe(200);
    expect(res.body.reopened).toBe(2);
    expect(byDesc(res.body.import.rows, 'LENSWORKS').status).toBe('draft');
    expect(byDesc(res.body.import.rows, 'AUTOPAY', 'payment').status).toBe('draft');

    // A saved row can't be reopened this way, and nothing changes.
    expect((await reopen([groceries.id])).status).toBe(400);
    expect((await reopen([lenses.id], newUser())).status).toBe(404);

    // Back in review, it can be saved like any draft.
    const saved = await confirm(user, sep.body.id, [
      { id: lenses.id, action: 'save', category: 'Health' },
    ]);
    expect(saved.body.saved).toBe(1);
  });

  it('a reopened purchase whose full refund is already imported comes back as returned', async () => {
    const user = newUser();
    const sep = await upload(user, SEPTEMBER);
    const amazon = byDesc(sep.body.rows, 'AMAZON');
    await confirm(user, sep.body.id, [{ id: amazon.id, action: 'save', category: 'Shopping' }]);
    const oct = await upload(user, OCTOBER);
    const refund = byDesc(oct.body.rows, 'AMAZON', 'refund');
    // Keep the purchase, skip the refund: the pair is broken.
    await confirm(user, oct.body.id, [{ id: refund.id, action: 'skip' }]);

    // Reopening the refund pairs it with the saved purchase again.
    const res = await as(request(app).post(`/imports/${oct.body.id}/reopen`), user).send({
      rowIds: [refund.id],
    });
    expect(byDesc(res.body.import.rows, 'AMAZON', 'refund')).toMatchObject({
      status: 'draft',
      matched: { status: 'saved' },
    });
  });

  it('can delete an import and keep the expenses it saved', async () => {
    const user = newUser();
    const sep = await upload(user, SEPTEMBER);
    const groceries = byDesc(sep.body.rows, 'WHOLE FOODS');
    await confirm(user, sep.body.id, [{ id: groceries.id, action: 'save', category: 'Groceries' }]);

    const deleted = await request(app)
      .delete(`/imports/${sep.body.id}?keepExpenses=true`)
      .set('x-test-user', user);
    expect(deleted.body).toEqual({ deletedExpenses: 0 });
    expect(await Expense.count({ where: { userId: user } })).toBe(1);
    expect(await ImportBatch.count({ where: { userId: user } })).toBe(0);
  });

  it("cannot delete another user's import", async () => {
    const owner = newUser();
    const sep = await upload(owner, SEPTEMBER);
    const res = await request(app).delete(`/imports/${sep.body.id}`).set('x-test-user', newUser());
    expect(res.status).toBe(404);
    expect(await ImportBatch.count({ where: { userId: owner } })).toBe(1);
  });

  it('works end to end for the null user of local no-auth mode', async () => {
    const sep = await upload(null, SEPTEMBER);
    expect(sep.status).toBe(201);
    const again = await upload(null, SEPTEMBER);
    expect(again.body).toEqual({ id: null, rowCount: 5, duplicateCount: 5 });

    const oct = await upload(null, OCTOBER);
    expect(byDesc(oct.body.rows, 'AMAZON', 'refund').status).toBe('returned');

    const groceries = byDesc(sep.body.rows, 'WHOLE FOODS');
    const saved = await confirm(null, sep.body.id, [
      { id: groceries.id, action: 'save', category: 'Groceries' },
    ]);
    expect(saved.status).toBe(200);
    expect(await Expense.count({ where: { userId: null } })).toBe(1);

    // A real user sees none of it.
    const someone = newUser();
    expect((await as(request(app).get('/imports'), someone)).body.data).toEqual([]);
    expect((await as(request(app).get(`/imports/${sep.body.id}`), someone)).status).toBe(404);
  });
});

describe('category suggestions: memory now, the AI service in the background', () => {
  // The AI service is faked at the network: BE's real client, validation,
  // background job and storage run against a real database.
  const giveCategories = async (userId: string) => {
    const food = await Category.create({ name: 'Food', userId, isDefault: false });
    for (const name of ['Groceries', 'Eyewear'])
      await Category.create({ name, userId, parentCategoryId: food.id, isDefault: false });
  };
  // Answers Groceries for the grocery row, nothing for the rest. `gate` holds
  // the answer back until the test lets it through.
  const fakeAi = (gate: Promise<void> = Promise.resolve(), category = 'Groceries') =>
    vi.fn(async (_url: string, init: RequestInit) => {
      await gate;
      const { rows } = JSON.parse(init.body as string) as { rows: { id: string; text: string }[] };
      return new Response(
        JSON.stringify({
          suggestions: rows.map((r) => ({
            id: r.id,
            category: r.text.includes('WHOLE FOODS') ? category : null,
            source: r.text.includes('WHOLE FOODS') ? 'model' : 'none',
          })),
        }),
      );
    });
  const sentRows = (fetchMock: ReturnType<typeof vi.fn>) =>
    JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).rows as {
      text: string;
      bankCategory?: string;
    }[];
  // Waits until no row of the import is pending any more.
  const settled = async (user: string, batchId: string) => {
    for (let i = 0; i < 100; i++) {
      const res = await as(request(app).get(`/imports/${batchId}`), user);
      if (
        !(res.body.rows as Row[]).some(
          (r: Row & { suggestionStatus?: string }) => r.suggestionStatus === 'pending',
        )
      )
        return res.body;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('suggestions never settled');
  };

  beforeEach(() => {
    vi.stubEnv('AI_CATEGORIZE_ENABLED', 'true');
    vi.stubEnv('AI_SERVICE_URL', 'http://ai.test');
    vi.stubEnv('AI_SHARED_SECRET', 'test');
    vi.stubEnv('AI_TIMEOUT_MS', '2000');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('responds before the AI answers, then fills the suggestion in', async () => {
    const user = newUser();
    await giveCategories(user);
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const fetchMock = fakeAi(gate);
    vi.stubGlobal('fetch', fetchMock);

    const res = await upload(user, SEPTEMBER);
    expect(res.status).toBe(201);
    // The AI has not answered yet: the purchases are pending, the rest untouched.
    const charges = (res.body.rows as (Row & { suggestionStatus: string })[]).filter(
      (r) => r.kind === 'charge',
    );
    expect(charges.map((r) => r.suggestionStatus)).toEqual(['pending', 'pending', 'pending']);

    release();
    const after = await settled(user, res.body.id);
    expect(byDesc(after.rows, 'WHOLE FOODS')).toMatchObject({
      suggestedCategory: 'Groceries',
      suggestionSource: 'model',
      suggestionStatus: 'done',
    });
    // No answer for a row is a settled "no suggestion".
    expect(byDesc(after.rows, 'LENSWORKS')).toMatchObject({
      suggestedCategory: null,
      suggestionStatus: 'none',
    });
    // The user's categories are offered as they are.
    const sent = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect([...sent.categories].sort()).toEqual(['Eyewear', 'Groceries']);
  });

  it('remembers the category saved for a shop and does not ask the AI about it again', async () => {
    const user = newUser();
    await giveCategories(user);
    vi.stubEnv('AI_CATEGORIZE_ENABLED', 'false');
    const sep = await upload(user, SEPTEMBER);
    await confirm(user, sep.body.id, [
      { id: byDesc(sep.body.rows, 'LENSWORKS').id, action: 'save', category: 'Eyewear' },
    ]);

    vi.stubEnv('AI_CATEGORIZE_ENABLED', 'true');
    const fetchMock = fakeAi();
    vi.stubGlobal('fetch', fetchMock);
    const next = csv([
      ['11/02/2026', 'AplPay LENSWORKS OPTICAL SPRINGFIELD', '45.00', "'4001"],
      ['11/03/2026', 'WHOLE FOODS MKT AUSTIN TX', '30.00', "'4002"],
    ]);
    const res = await upload(user, next);
    // Memory answered before the response, already settled.
    expect(byDesc(res.body.rows, 'LENSWORKS')).toMatchObject({
      suggestedCategory: 'Eyewear',
      suggestionSource: 'memory',
      suggestionStatus: 'done',
    });
    await settled(user, res.body.id);
    expect(sentRows(fetchMock).map((r) => r.text)).toEqual(['WHOLE FOODS MKT AUSTIN TX']);
  });

  it("sends the bank's own category along as a hint", async () => {
    const user = newUser();
    await giveCategories(user);
    const fetchMock = fakeAi();
    vi.stubGlobal('fetch', fetchMock);
    const withCategory = [
      'Date,Description,Amount,Reference,Category',
      `11/04/2026,"WHOLE FOODS MKT AUSTIN TX",30.00,'5001,Merchandise & Supplies-Groceries`,
    ].join('\n');
    const res = await upload(user, withCategory);
    await settled(user, res.body.id);
    expect(sentRows(fetchMock)).toEqual([
      expect.objectContaining({ bankCategory: 'Merchandise & Supplies-Groceries' }),
    ]);
  });

  it('follows a later recategorization of the expense, and forgets deleted ones', async () => {
    const user = newUser();
    await giveCategories(user);
    vi.stubEnv('AI_CATEGORIZE_ENABLED', 'false');
    const sep = await upload(user, SEPTEMBER);
    await confirm(user, sep.body.id, [
      { id: byDesc(sep.body.rows, 'LENSWORKS').id, action: 'save', category: 'Groceries' },
      { id: byDesc(sep.body.rows, 'WHOLE FOODS').id, action: 'save', category: 'Groceries' },
    ]);
    // Later, in the expenses grid: one fixed to a new category, one deleted.
    await Expense.update({ category: 'Eyewear' }, { where: { userId: user, amount: 60 } });
    await Expense.destroy({ where: { userId: user, amount: 82.1 } });

    const res = await upload(
      user,
      csv([
        ['11/02/2026', 'LENSWORKS OPTICAL SPRINGFIELD', '45.00', "'4101"],
        ['11/03/2026', 'WHOLE FOODS MKT AUSTIN TX', '30.00', "'4102"],
      ]),
    );
    expect(byDesc(res.body.rows, 'LENSWORKS')).toMatchObject({
      suggestedCategory: 'Eyewear',
      suggestionSource: 'memory',
    });
    expect(byDesc(res.body.rows, 'WHOLE FOODS')).toMatchObject({ suggestedCategory: null });
  });

  it('keeps what it learned, and offers nothing saved, after an import is deleted', async () => {
    const user = newUser();
    await giveCategories(user);
    vi.stubEnv('AI_CATEGORIZE_ENABLED', 'false');
    const sep = await upload(user, SEPTEMBER);
    await confirm(user, sep.body.id, [
      { id: byDesc(sep.body.rows, 'LENSWORKS').id, action: 'save', category: 'Eyewear' },
    ]);
    await as(request(app).delete(`/imports/${sep.body.id}?keepExpenses=true`), user);

    // The same file again: the saved row is not offered; the rest are.
    const again = await upload(user, SEPTEMBER);
    expect(again.body.reconciliation).toMatchObject({ duplicateCount: 1, balanced: true });
    expect(again.body.rows.some((r: Row) => r.description.includes('LENSWORKS'))).toBe(false);
    expect(await Expense.count({ where: { userId: user } })).toBe(1);

    // And memory still knows the shop.
    const next = await upload(
      user,
      csv([['11/02/2026', 'LENSWORKS OPTICAL SPRINGFIELD', '45.00', "'4201"]]),
    );
    expect(next.body.rows[0]).toMatchObject({
      suggestedCategory: 'Eyewear',
      suggestionSource: 'memory',
    });
  });

  it('forgets rows whose import was deleted with its expenses', async () => {
    const user = newUser();
    await giveCategories(user);
    vi.stubEnv('AI_CATEGORIZE_ENABLED', 'false');
    const sep = await upload(user, SEPTEMBER);
    await confirm(user, sep.body.id, [
      { id: byDesc(sep.body.rows, 'LENSWORKS').id, action: 'save', category: 'Eyewear' },
    ]);
    await as(request(app).delete(`/imports/${sep.body.id}`), user);

    const again = await upload(user, SEPTEMBER);
    expect(again.body.reconciliation.duplicateCount).toBe(0);
    expect(byDesc(again.body.rows, 'LENSWORKS')).toMatchObject({ suggestedCategory: null });
  });

  it('never remembers a general marketplace', async () => {
    const user = newUser();
    await giveCategories(user);
    vi.stubEnv('AI_CATEGORIZE_ENABLED', 'false');
    const sep = await upload(user, SEPTEMBER);
    await confirm(user, sep.body.id, [
      { id: byDesc(sep.body.rows, 'AMAZON').id, action: 'save', category: 'Groceries' },
    ]);
    const next = await upload(user, csv([['11/02/2026', 'AMAZON.COM*ZZ99Q', '9.99', "'4301"]]));
    expect(next.body.rows[0]).toMatchObject({ suggestedCategory: null });
  });

  it('forgets a purchase returned by a later refund, so it can be imported again', async () => {
    const user = newUser();
    await giveCategories(user);
    vi.stubEnv('AI_CATEGORIZE_ENABLED', 'false');
    const sep = await upload(user, SEPTEMBER);
    await confirm(user, sep.body.id, [
      { id: byDesc(sep.body.rows, 'WHOLE FOODS').id, action: 'save', category: 'Groceries' },
    ]);
    const refund = await upload(
      user,
      csv([['09/25/2026', 'WHOLE FOODS MKT AUSTIN TX', '-82.10', "'4401"]]),
    );
    await confirm(user, refund.body.id, [{ id: refund.body.rows[0].id, action: 'return' }]);
    expect(await SavedStatementRow.count({ where: { userId: user } })).toBe(0);
  });

  it('uses rows loaded from the labelled set, which never count as duplicates', async () => {
    await giveCategories(null as unknown as string);
    vi.stubEnv('AI_CATEGORIZE_ENABLED', 'false');
    await SavedStatementRow.create({
      userId: null,
      fingerprint: 'label:1003',
      description: 'LENSWORKS OPTICAL SPRINGFIELD',
      kind: 'charge',
      category: 'Eyewear',
      source: 'label',
      chosenAt: new Date('2026-09-12'),
    });
    const sep = await upload(null, SEPTEMBER);
    expect(sep.body.reconciliation.duplicateCount).toBe(0);
    expect(byDesc(sep.body.rows, 'LENSWORKS')).toMatchObject({
      suggestedCategory: 'Eyewear',
      suggestionSource: 'memory',
    });
    // Another user learns nothing from it.
    const other = newUser();
    await giveCategories(other);
    const theirs = await upload(other, SEPTEMBER);
    expect(byDesc(theirs.body.rows, 'LENSWORKS')).toMatchObject({ suggestedCategory: null });
  });

  it('records what was suggested for each saved charge, kept after the import is deleted', async () => {
    await giveCategories(null as unknown as string);
    vi.stubEnv('AI_CATEGORIZE_ENABLED', 'false');
    const sep = await upload(null, SEPTEMBER);
    await confirm(null, sep.body.id, [
      { id: byDesc(sep.body.rows, 'LENSWORKS').id, action: 'save', category: 'Eyewear' },
    ]);
    const next = await upload(
      null,
      csv([
        ['11/02/2026', 'LENSWORKS OPTICAL SPRINGFIELD', '45.00', "'4501"],
        ['11/03/2026', 'WHOLE FOODS MKT AUSTIN TX', '30.00', "'4502"],
        ['11/04/2026', 'STARBUCKS 0123 AUSTIN TX', '5.25', "'4503"],
      ]),
    );
    await confirm(null, next.body.id, [
      // Memory suggested Eyewear and it was kept.
      { id: byDesc(next.body.rows, 'LENSWORKS').id, action: 'save', category: 'Eyewear' },
      // No suggestion; saved anyway.
      { id: byDesc(next.body.rows, 'WHOLE FOODS').id, action: 'save', category: 'Groceries' },
      // Skipped: not a purchase the report counts.
      { id: byDesc(next.body.rows, 'STARBUCKS').id, action: 'skip' },
    ]);
    const outcomes = await SuggestionOutcome.findAll({
      where: { userId: null },
      order: [['postedDate', 'ASC']],
    });
    expect(
      outcomes.map((o) => [o.kind, o.postedDate, o.suggestedCategory, o.suggestionSource]),
    ).toEqual([
      ['statement', '2026-09-12', null, null],
      ['statement', '2026-11-02', 'Eyewear', 'memory'],
      ['statement', '2026-11-03', null, null],
    ]);
    expect(outcomes.every((o) => o.expenseId)).toBe(true);

    // Deleting an import keeps the record; deleting its expenses is what drops it
    // from the report (the report needs the expense's category).
    await as(request(app).delete(`/imports/${next.body.id}?keepExpenses=true`), null);
    expect(await SuggestionOutcome.count({ where: { userId: null } })).toBe(3);
  });

  it("learns a gift's real category: a gift is a checkbox, not a category", async () => {
    const user = newUser();
    await giveCategories(user);
    vi.stubEnv('AI_CATEGORIZE_ENABLED', 'false');
    const sep = await upload(user, SEPTEMBER);
    await confirm(user, sep.body.id, [
      {
        id: byDesc(sep.body.rows, 'LENSWORKS').id,
        action: 'save',
        category: 'Eyewear',
        isGift: true,
      },
    ]);
    const res = await upload(
      user,
      csv([['11/02/2026', 'LENSWORKS OPTICAL SPRINGFIELD', '45.00', "'4003"]]),
    );
    expect(res.body.rows[0]).toMatchObject({
      suggestedCategory: 'Eyewear',
      suggestionSource: 'memory',
    });
  });

  it('settles every pending row as no suggestion when the AI service is down', async () => {
    const user = newUser();
    await giveCategories(user);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('fetch failed'))),
    );
    const res = await upload(user, SEPTEMBER);
    expect(res.status).toBe(201);
    const after = await settled(user, res.body.id);
    const charges = (
      after.rows as (Row & { suggestionStatus: string; suggestedCategory: unknown })[]
    ).filter((r) => r.kind === 'charge');
    expect(
      charges.every((r) => r.suggestionStatus === 'none' && r.suggestedCategory === null),
    ).toBe(true);
    expect(after.reconciliation.balanced).toBe(true);
  });

  it('stops sending rows to the AI service at the daily row limit', async () => {
    const user = newUser();
    await giveCategories(user);
    vi.stubEnv('AI_CATEGORIZE_DAILY_ROWS', '4');
    const fetchMock = fakeAi();
    vi.stubGlobal('fetch', fetchMock);
    // September has 3 charges to ask about: within the limit.
    const first = await upload(user, SEPTEMBER);
    await settled(user, first.body.id);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Two more would make 5, over the limit of 4: none of them are sent.
    const next = await upload(
      user,
      csv([
        ['11/02/2026', 'MAPLE HARDWARE SPRINGFIELD', '45.00', "'4601"],
        ['11/03/2026', 'CORNER BAKERY SPRINGFIELD', '9.00', "'4602"],
      ]),
    );
    const after = await settled(user, next.body.id);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      (after.rows as (Row & { suggestionStatus: string })[]).map((r) => r.suggestionStatus),
    ).toEqual(['none', 'none']);
    resetDailyLimits();
  });

  it('ignores a suggested category the user does not have', async () => {
    const user = newUser();
    await giveCategories(user);
    vi.stubGlobal('fetch', fakeAi(Promise.resolve(), 'Yachts'));
    const res = await upload(user, SEPTEMBER);
    const after = await settled(user, res.body.id);
    expect(byDesc(after.rows, 'WHOLE FOODS')).toMatchObject({ suggestedCategory: null });
  });

  it('does not call the AI service when the feature is off, or for the demo user', async () => {
    const fetchMock = fakeAi();
    vi.stubGlobal('fetch', fetchMock);
    const user = newUser();
    await giveCategories(user);

    vi.stubEnv('AI_CATEGORIZE_ENABLED', 'false');
    const off = await upload(user, SEPTEMBER);
    expect(
      off.body.rows.every((r: { suggestionStatus: string }) => r.suggestionStatus === 'none'),
    ).toBe(true);

    vi.stubEnv('AI_CATEGORIZE_ENABLED', 'true');
    vi.stubEnv('AUTH_DISABLED', '');
    vi.stubEnv('STATEMENT_UPLOAD_ENABLED', 'true');
    vi.stubEnv('DEMO_USER_ID', user);
    await as(request(app).post('/imports/sample'), user);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('statement import in production (demo and feature flag)', () => {
  const demo = newUser();
  beforeEach(() => {
    vi.stubEnv('AUTH_DISABLED', '');
    vi.stubEnv('DEMO_USER_ID', demo);
  });

  it('never lets the demo user upload a file, and offers the sample instead', async () => {
    expect((await upload(demo, SEPTEMBER)).status).toBe(403);
    const list = await as(request(app).get('/imports'), demo);
    expect(list.body).toMatchObject({ uploadAllowed: false, sampleAvailable: true });

    const sample = await as(request(app).post('/imports/sample'), demo);
    expect(sample.status).toBe(201);
    expect(sample.body.reconciliation.balanced).toBe(true);
    const statuses = (sample.body.rows as Row[]).map((r) => `${r.kind}:${r.status}`);
    expect(statuses.filter((s) => s === 'charge:returned')).toHaveLength(1);
    expect(statuses.filter((s) => s === 'refund:draft')).toHaveLength(1); // the partial refund
    expect(statuses).toContain('payment:skipped');
    expect(statuses).toContain('reward:skipped');
  });

  it('shows the precomputed suggestions on the sample, with no AI service', async () => {
    // The demo user's starter categories, as the app's first page load provides them.
    await as(request(app).get('/categories'), demo);
    const sample = await as(request(app).post('/imports/sample'), demo);
    const byText = (text: string) =>
      (
        sample.body.rows as (Row & {
          suggestedCategory: string | null;
          suggestionSource: string | null;
          suggestionStatus: string | null;
        })[]
      ).find((r) => r.kind === 'charge' && r.description.includes(text))!;
    expect(byText('CONTOSO PHARMACY')).toMatchObject({
      suggestedCategory: 'Pharmacy',
      suggestionSource: 'model',
      suggestionStatus: 'done',
    });
    // The marketplace charge: no suggestion, settled.
    expect(byText('AMAZON')).toMatchObject({ suggestedCategory: null, suggestionStatus: 'none' });
  });

  it('keeps upload off for other accounts unless the feature flag is on', async () => {
    const someone = newUser();
    expect((await upload(someone, SEPTEMBER)).status).toBe(403);
    expect((await as(request(app).post('/imports/sample'), someone)).status).toBe(403);
    vi.stubEnv('STATEMENT_UPLOAD_ENABLED', 'true');
    expect((await upload(someone, SEPTEMBER)).status).toBe(201);
  });

  it('demo reset wipes the demo imports and leaves everyone else alone', async () => {
    await as(request(app).post('/imports/sample'), demo);
    vi.stubEnv('STATEMENT_UPLOAD_ENABLED', 'true');
    const other = newUser();
    await upload(other, SEPTEMBER);

    await resetDemoUserData(demo);

    expect(await ImportBatch.count({ where: { userId: demo } })).toBe(0);
    expect(await ImportedTransaction.count({ where: { userId: demo } })).toBe(0);
    expect(await ImportedTransaction.count({ where: { userId: other } })).toBe(5);
    // And the sample can be loaded again right after.
    expect((await as(request(app).post('/imports/sample'), demo)).status).toBe(201);
  });

  it('after a reset, the sample offers every row again, even ones saved before', async () => {
    const first = await as(request(app).post('/imports/sample'), demo);
    const charge = (first.body.rows as Row[]).find(
      (r) => r.kind === 'charge' && r.status === 'draft',
    )!;
    await confirm(demo, first.body.id, [{ id: charge.id, action: 'save', category: 'Groceries' }]);

    await resetDemoUserData(demo);

    // Nothing from the previous visitor is left behind.
    expect(await SavedStatementRow.count({ where: { userId: demo } })).toBe(0);
    expect(await SuggestionOutcome.count({ where: { userId: demo } })).toBe(0);
    const again = await as(request(app).post('/imports/sample'), demo);
    expect(again.status).toBe(201);
    expect(again.body.reconciliation.duplicateCount).toBe(0);
    expect((again.body.rows as Row[]).map((r) => r.id).length).toBe(
      (first.body.rows as Row[]).length,
    );
  });
});
