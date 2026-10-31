import { describe, expect, it, vi, afterEach } from 'vitest';
import { buildMonthlyTotals, getMonthlyTotals, type MonthlyTotalRow } from './monthlyTotals.js';
import { Expense } from '../models/Expense.js';
import { IncomeEntry } from '../models/IncomeEntry.js';

afterEach(() => {
  vi.restoreAllMocks();
});

const row = (overrides: Partial<MonthlyTotalRow>): MonthlyTotalRow => ({
  type: 'expense',
  yearMonth: '2026-07',
  currency: 'USD',
  total: '10',
  ...overrides,
});

describe('buildMonthlyTotals', () => {
  it('folds CAD and USD sums for the same month into one row', () => {
    const result = buildMonthlyTotals([
      row({ currency: 'CAD', total: '60.73' }),
      row({ currency: 'USD', total: '418.38' }),
    ]);
    expect(result).toEqual([
      {
        id: 'expense-2026-07',
        type: 'expense',
        yearMonth: '2026-07',
        amountCad: '60.73',
        amountUsd: '418.38',
      },
    ]);
  });

  it('keeps expense and income separate for the same month', () => {
    const result = buildMonthlyTotals([row({}), row({ type: 'income', total: '99' })]);
    expect(result.map((r) => [r.type, r.amountUsd])).toEqual([
      ['expense', '10.00'],
      ['income', '99.00'],
    ]);
  });

  it('sorts chronologically across years', () => {
    const result = buildMonthlyTotals([
      row({ yearMonth: '2026-02' }),
      row({ yearMonth: '2025-12' }),
      row({ yearMonth: '2026-10' }),
    ]);
    expect(result.map((r) => r.yearMonth)).toEqual(['2025-12', '2026-02', '2026-10']);
  });

  it('formats totals to cents with no float noise', () => {
    const result = buildMonthlyTotals([row({ currency: 'CAD', total: 60.730000000000004 })]);
    expect(result[0].amountCad).toBe('60.73');
  });

  it('ignores unknown currencies, malformed months, and months that sum to zero', () => {
    const result = buildMonthlyTotals([
      row({ currency: '' }),
      row({ currency: 'EUR' }),
      row({ yearMonth: 'null-null' }),
      row({ yearMonth: '2026/10/31' }),
      row({ yearMonth: '2026-08', total: '0' }),
      row({ yearMonth: '2026-09', total: null }),
    ]);
    expect(result).toEqual([]);
  });

  it('returns nothing for no data', () => {
    expect(buildMonthlyTotals([])).toEqual([]);
  });
});

describe('getMonthlyTotals', () => {
  it('pads expense months, keeps income months, and scopes both queries to the user', async () => {
    const expenseFindAll = vi
      .spyOn(Expense, 'findAll')
      .mockResolvedValue([{ year: 2026, month: 7, currency: 'USD', total: '418.38' }] as any);
    const incomeFindAll = vi
      .spyOn(IncomeEntry, 'findAll')
      .mockResolvedValue([{ yearMonth: '2026-07', currency: 'CAD', total: 3500 }] as any);

    const result = await getMonthlyTotals('u1');

    expect(result).toEqual([
      {
        id: 'expense-2026-07',
        type: 'expense',
        yearMonth: '2026-07',
        amountCad: '0.00',
        amountUsd: '418.38',
      },
      {
        id: 'income-2026-07',
        type: 'income',
        yearMonth: '2026-07',
        amountCad: '3500.00',
        amountUsd: '0.00',
      },
    ]);
    expect((expenseFindAll.mock.calls[0][0] as any).where.userId).toBe('u1');
    expect((incomeFindAll.mock.calls[0][0] as any).where.userId).toBe('u1');
  });

  it('works for the no-auth single tenant (null userId)', async () => {
    const expenseFindAll = vi.spyOn(Expense, 'findAll').mockResolvedValue([] as any);
    vi.spyOn(IncomeEntry, 'findAll').mockResolvedValue([] as any);

    await expect(getMonthlyTotals(null)).resolves.toEqual([]);
    expect((expenseFindAll.mock.calls[0][0] as any).where.userId).toBeNull();
  });
});
