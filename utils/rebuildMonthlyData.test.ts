import { describe, expect, it } from 'vitest';
import {
  diffExpenseRollups,
  diffIncomeRollups,
  type ExpenseRow,
  type RollupRow,
} from './rebuildMonthlyData.js';

const expense = (overrides: Partial<ExpenseRow>): ExpenseRow => ({
  year: 2026,
  month: 7,
  amount: '10',
  currency: 'USD',
  userId: null,
  ...overrides,
});

const rollup = (overrides: Partial<RollupRow>): RollupRow => ({
  id: 'r1',
  yearMonth: '2026-7',
  amountCad: '0',
  amountUsd: '10',
  userId: null,
  ...overrides,
});

describe('diffExpenseRollups', () => {
  it('returns nothing when rollups already match', () => {
    const expenses = [expense({ amount: '4.5' }), expense({ amount: '5.5' })];
    expect(diffExpenseRollups(expenses, [rollup({})])).toEqual([]);
  });

  it('updates an inflated rollup down to the real total', () => {
    const changes = diffExpenseRollups(
      [expense({ amount: '418.38' })],
      [rollup({ amountUsd: '505.88' })],
    );
    expect(changes).toEqual([
      {
        action: 'update',
        id: 'r1',
        userId: null,
        yearMonth: '2026-7',
        from: { amountCad: 0, amountUsd: 505.88 },
        to: { amountCad: 0, amountUsd: 418.38 },
      },
    ]);
  });

  it('splits sums by currency', () => {
    const changes = diffExpenseRollups(
      [expense({ currency: 'CAD', amount: '3' }), expense({ currency: 'USD', amount: '7' })],
      [],
    );
    expect(changes).toEqual([
      { action: 'create', userId: null, yearMonth: '2026-7', amountCad: 3, amountUsd: 7 },
    ]);
  });

  it('creates a missing rollup row', () => {
    const changes = diffExpenseRollups([expense({ month: 10 })], []);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ action: 'create', yearMonth: '2026-10' });
  });

  it('deletes a rollup for a month with no expenses', () => {
    const changes = diffExpenseRollups([], [rollup({})]);
    expect(changes).toEqual([
      {
        action: 'delete',
        id: 'r1',
        userId: null,
        yearMonth: '2026-7',
        reason: 'no entries in this month',
      },
    ]);
  });

  it('deletes duplicate rows for the same user and month, keeping the first', () => {
    const changes = diffExpenseRollups([expense({})], [rollup({}), rollup({ id: 'r2' })]);
    expect(changes).toEqual([
      { action: 'delete', id: 'r2', userId: null, yearMonth: '2026-7', reason: 'duplicate row' },
    ]);
  });

  it('keeps users separate', () => {
    const changes = diffExpenseRollups(
      [expense({ userId: 'a', amount: '1' }), expense({ userId: 'b', amount: '2' })],
      [rollup({ id: 'ra', userId: 'a', amountUsd: '1' })],
    );
    expect(changes).toEqual([
      { action: 'create', userId: 'b', yearMonth: '2026-7', amountCad: 0, amountUsd: 2 },
    ]);
  });

  it('ignores expenses with no year/month', () => {
    expect(diffExpenseRollups([expense({ year: null, month: null })], [])).toEqual([]);
  });
});

describe('diffIncomeRollups', () => {
  const entry = (date: string, amount: string, currency = 'USD') => ({
    date,
    amount,
    currency,
    userId: null,
  });

  it('keys by the zero-padded year-month of the date and sums per currency', () => {
    const changes = diffIncomeRollups(
      [entry('2026-07-01', '100'), entry('2026-07-20', '50.5'), entry('2026-07-05', '9', 'CAD')],
      [],
    );
    expect(changes).toEqual([
      { action: 'create', userId: null, yearMonth: '2026-07', amountCad: 9, amountUsd: 150.5 },
    ]);
  });

  it('corrects a month that kept an entry which moved away', () => {
    const changes = diffIncomeRollups(
      [entry('2026-08-02', '100')],
      [
        rollup({ id: 'a', yearMonth: '2026-07', amountUsd: '100' }),
        rollup({ id: 'b', yearMonth: '2026-08', amountUsd: '100' }),
      ],
    );
    expect(changes).toEqual([
      {
        action: 'delete',
        id: 'a',
        userId: null,
        yearMonth: '2026-07',
        reason: 'no entries in this month',
      },
    ]);
  });
});
