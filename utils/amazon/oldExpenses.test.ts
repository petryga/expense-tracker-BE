import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, findSplits, type HistoryItem, type OldExpense } from './oldExpenses.js';

const options = { ...DEFAULT_OPTIONS, cardBrands: { 'Test Card': 'CardBrand' } };
const expense = (o: Partial<OldExpense>): OldExpense => ({
  id: 'e1',
  date: '2026-03-10',
  amountCents: 1500,
  currency: 'USD',
  account: 'Test Card',
  description: 'Amazon stuff',
  ...o,
});
const item = (id: string, totalCents: number, o: Partial<HistoryItem> = {}): HistoryItem => ({
  id,
  orderDate: '2026-03-05',
  shipDate: '2026-03-06',
  currency: 'USD',
  totalCents,
  paymentMethod: 'CardBrand - 0001',
  ...o,
});

describe('findSplits', () => {
  it('splits a row that is exactly one set of items, even across orders', () => {
    const items = [item('a', 1000), item('b', 500), item('c', 333)];
    expect(findSplits([expense({})], items, options)).toEqual([
      { expenseId: 'e1', outcome: 'split', itemIds: ['a', 'b'] },
    ]);
  });

  it('does not guess when two sets fit', () => {
    const items = [item('a', 1000), item('b', 500), item('c', 700), item('d', 800)];
    expect(findSplits([expense({})], items, options)[0].outcome).toBe('several');
  });

  it.each([
    ['another card', { paymentMethod: 'OtherBrand - 0002' }],
    ['another currency', { currency: 'CAD' }],
    ['outside the window', { shipDate: '2026-01-01', orderDate: '2026-01-01' }],
  ])('ignores items paid with %s', (_, override) => {
    const items = [item('a', 1500, override)];
    expect(findSplits([expense({})], items, options)[0].outcome).toBe('none');
  });

  it('uses an item once, for the earliest row', () => {
    const items = [item('a', 1500)];
    const result = findSplits(
      [expense({ id: 'late', date: '2026-03-12' }), expense({ id: 'early' })],
      items,
      options,
    );
    expect(result.map((r) => [r.expenseId, r.outcome])).toEqual([
      ['early', 'split'],
      ['late', 'none'],
    ]);
  });

  it('only looks at Amazon rows, and accounts without a brand take any card', () => {
    const items = [item('a', 1500, { paymentMethod: 'Whatever' })];
    const rows = [
      expense({ id: 'cafe', description: 'Corner cafe' }),
      expense({ id: 'cash', account: 'Cash' }),
    ];
    expect(findSplits(rows, items, options)).toEqual([
      { expenseId: 'cash', outcome: 'split', itemIds: ['a'] },
    ]);
  });

  it('never uses an item ordered well after the expense', () => {
    const items = [
      item('a', 1000),
      item('later', 500, { orderDate: '2026-03-20', shipDate: '2026-03-21' }),
    ];
    expect(findSplits([expense({})], items, options)[0].outcome).toBe('none');
  });
});
