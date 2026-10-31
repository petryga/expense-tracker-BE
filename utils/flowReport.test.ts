import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildFlowReport, type ExpenseFlowRow, type IncomeFlowRow } from './flowReport.js';

const inc = (
  yearMonth: string,
  total: number,
  category = 'bankAccounts',
  currency = 'USD',
): IncomeFlowRow => ({
  yearMonth,
  category,
  currency,
  total,
});
const exp = (
  yearMonth: string,
  category: string,
  total: number,
  currency = 'USD',
): ExpenseFlowRow => ({
  yearMonth,
  category,
  currency,
  total,
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('buildFlowReport', () => {
  it('returns an empty report with no income', () => {
    expect(
      buildFlowReport({ incomeRows: [], expenseRows: [exp('2026-01', 'A', 5)] }),
    ).toMatchObject({
      availableMonths: [],
      activeMonth: null,
      categories: [],
    });
  });

  it('ignores crypto income', () => {
    const report = buildFlowReport({
      incomeRows: [inc('2026-01', 1000), inc('2026-02', 5000, 'crypto'), inc('2026-03', 1000)],
      expenseRows: [exp('2026-02', 'A', 10), exp('2026-03', 'A', 10)],
    });
    // Feb has no eligible income (crypto only), so Mar is the first eligible month after Jan.
    expect(report.availableMonths).toEqual(['2026-03']);
  });

  it('excludes the first income month and months without expenses', () => {
    const report = buildFlowReport({
      incomeRows: [inc('2026-01', 1000), inc('2026-02', 1000), inc('2026-03', 1000)],
      expenseRows: [exp('2026-01', 'A', 5), exp('2026-03', 'A', 5)],
    });
    expect(report.availableMonths).toEqual(['2026-03']);
  });

  it('compares the active month with the previous eligible month', () => {
    const report = buildFlowReport({
      incomeRows: [inc('2026-01', 1000), inc('2026-02', 1000), inc('2026-03', 1200)],
      expenseRows: [
        exp('2026-01', 'Groceries', 50),
        exp('2026-02', 'Groceries', 500),
        exp('2026-03', 'Rent', 500),
        exp('2026-03', 'Groceries', 300),
      ],
    });

    expect(report).toMatchObject({
      activeMonth: '2026-03',
      availableMonths: ['2026-02', '2026-03'],
      expenseTotal: 800,
      savings: 200,
      incomeAmount: 1000,
      cashSavings: 200,
      investmentGrowth: 0,
    });
    expect(report.categories).toEqual([
      { category: 'Rent', value: 500 },
      { category: 'Groceries', value: 300 },
    ]);
  });

  it('honours selectedMonth and falls back to the latest when it is not eligible', () => {
    const base = {
      incomeRows: [inc('2026-01', 1000), inc('2026-02', 1000), inc('2026-03', 1100)],
      expenseRows: [exp('2026-02', 'A', 1), exp('2026-03', 'A', 1)],
    };
    expect(buildFlowReport({ ...base, selectedMonth: '2026-02' }).activeMonth).toBe('2026-02');
    expect(buildFlowReport({ ...base, selectedMonth: '2020-01' }).activeMonth).toBe('2026-03');
  });

  it('returns no comparison for the earliest eligible month', () => {
    const report = buildFlowReport({
      incomeRows: [inc('2026-01', 1000), inc('2026-02', 1000)],
      expenseRows: [exp('2026-02', 'A', 50)],
    });
    expect(report).toMatchObject({ activeMonth: '2026-02', expenseTotal: 0, categories: [] });
  });

  it('splits the swing into cash savings and investment growth', () => {
    const report = buildFlowReport({
      incomeRows: [
        inc('2026-01', 900),
        inc('2026-02', 1000),
        inc('2026-02', 500, 'investments'),
        inc('2026-03', 1100),
        inc('2026-03', 450, 'investments'),
      ],
      expenseRows: [exp('2026-02', 'A', 10), exp('2026-03', 'A', 10)],
    });
    expect(report.activeMonth).toBe('2026-03');
    expect(report.cashSavings).toBe(100);
    expect(report.investmentGrowth).toBe(-50);
    expect(report.savings).toBe(50); // |1550 - 1500|
  });

  it('converts CAD to USD with the configured rate', () => {
    vi.stubEnv('FX_CAD_TO_USD', '0.5');
    const report = buildFlowReport({
      incomeRows: [
        inc('2026-01', 900),
        inc('2026-02', 1000),
        inc('2026-03', 2000, 'bankAccounts', 'CAD'),
      ],
      expenseRows: [exp('2026-02', 'A', 1), exp('2026-03', 'A', 100, 'CAD')],
    });
    expect(report.expenseTotal).toBe(50);
    expect(report.savings).toBe(0); // 2000 CAD * 0.5 = 1000 USD, unchanged
  });

  it('drops categories when nothing flows (no expenses value and no savings)', () => {
    const report = buildFlowReport({
      incomeRows: [inc('2026-01', 1000), inc('2026-02', 1000)],
      expenseRows: [exp('2026-02', 'A', 0.001)],
    });
    expect(report.incomeAmount).toBe(0);
    expect(report.categories).toEqual([]);
  });
});
