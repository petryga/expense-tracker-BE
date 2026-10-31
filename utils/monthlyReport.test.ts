import { afterEach, describe, expect, it, vi } from 'vitest';
import { Expense } from '../models/Expense.js';
import { buildMonthlyReport, getMonthlyReport, getReportMonths } from './monthlyReport.js';

const exp = (
  category: string | null,
  amount: number | string,
  currency = 'CAD',
  description = 'x',
) => ({
  category,
  amount,
  currency,
  description,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildMonthlyReport', () => {
  it('groups by category, sorts biggest first, and totals per currency', () => {
    const report = buildMonthlyReport('2026-10', [
      exp('Food', 10),
      exp('Rent', 1000, 'USD'),
      exp('Food', '5.5', 'CAD', 'lunch'),
      exp('Food', 3, 'USD'),
    ]);

    expect(report.dataByCategory.map((c) => [c.category, c.total])).toEqual([
      ['Rent', 1000],
      ['Food', 18.5],
    ]);
    expect(report.totalSpentCad).toBe(15.5);
    expect(report.totalSpentUsd).toBe(1003);
    expect(report.dataByCategory[1].details.map((d) => d.amount)).toEqual([10, 5.5, 3]);
  });

  it('skips zero, negative and non-numeric amounts', () => {
    const report = buildMonthlyReport('2026-10', [exp('A', 0), exp('A', -5), exp('A', 'abc')]);
    expect(report.dataByCategory).toEqual([]);
    expect(report.totalSpentCad).toBe(0);
  });

  it('lists but does not sum a row in an unknown currency', () => {
    const report = buildMonthlyReport('2026-10', [exp('A', 10, 'EUR')]);
    expect(report.dataByCategory[0]).toMatchObject({ total: 0 });
    expect(report.dataByCategory[0].details).toHaveLength(1);
    expect(report.totalSpentCad).toBe(0);
    expect(report.totalSpentUsd).toBe(0);
  });

  it('files blank categories under Uncategorized', () => {
    const report = buildMonthlyReport('2026-10', [exp(null, 4), exp('  ', 6)]);
    expect(report.dataByCategory).toHaveLength(1);
    expect(report.dataByCategory[0]).toMatchObject({ category: 'Uncategorized', total: 10 });
  });

  it('returns an empty report for no expenses', () => {
    expect(buildMonthlyReport('2026-10', [])).toEqual({
      yearMonth: '2026-10',
      dataByCategory: [],
      totalSpentCad: 0,
      totalSpentUsd: 0,
    });
  });
});

describe('getMonthlyReport', () => {
  it('queries only that user and month using the year/month columns', async () => {
    const findAll = vi.spyOn(Expense, 'findAll').mockResolvedValue([]);

    const report = await getMonthlyReport('u1', 2026, 3);

    expect(findAll).toHaveBeenCalledWith({ where: { userId: 'u1', year: 2026, month: 3 } });
    expect(report.yearMonth).toBe('2026-03');
  });
});

describe('getReportMonths', () => {
  it('returns zero-padded months newest first', async () => {
    vi.spyOn(Expense, 'findAll').mockResolvedValue([
      { year: 2025, month: 12 },
      { year: 2026, month: 2 },
      { year: 2026, month: 10 },
    ] as any);

    expect(await getReportMonths('u1')).toEqual(['2026-10', '2026-02', '2025-12']);
  });
});
