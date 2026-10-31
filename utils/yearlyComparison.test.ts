import { afterEach, describe, expect, it, vi } from 'vitest';
import { Currency } from '../models/Expense.js';
import { buildYearlyComparison } from './yearlyComparison.js';
import type { MonthlyTotals } from './monthlyTotals.js';

const row = (yearMonth: string, amountCad = '0.00', amountUsd = '0.00'): MonthlyTotals => ({
  id: `expense-${yearMonth}`,
  type: 'expense',
  yearMonth,
  amountCad,
  amountUsd,
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('buildYearlyComparison', () => {
  it('full-year sums all months and flags years under 12 months as incomplete', () => {
    const result = buildYearlyComparison({
      monthly: [row('2026-01', '100'), row('2026-02', '200')],
      mode: 'full-year',
      baseCurrency: Currency.CAD,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      year: 2026,
      amountCad: 300,
      monthsCount: 2,
      isIncomplete: true,
      cutoffMonth: null,
    });
  });

  it('ytd defaults the cutoff to the latest month present that year', () => {
    const result = buildYearlyComparison({
      monthly: [row('2026-01', '100'), row('2026-03', '100')],
      mode: 'ytd',
      baseCurrency: Currency.CAD,
    });

    expect(result.defaultYtdCutoffByYear[2026]).toBe(3);
    expect(result.rows[0]).toMatchObject({ cutoffMonth: 3, monthsCount: 2 });
  });

  it('ytd respects an explicit cutoff and ignores one that has no data', () => {
    const monthly = [row('2026-01', '100'), row('2026-02', '100'), row('2026-03', '100')];

    const explicit = buildYearlyComparison({
      monthly,
      mode: 'ytd',
      baseCurrency: Currency.CAD,
      cutoffs: { 2026: 2 },
    });
    expect(explicit.rows[0]).toMatchObject({ cutoffMonth: 2, amountCad: 200, monthsCount: 2 });

    const invalid = buildYearlyComparison({
      monthly,
      mode: 'ytd',
      baseCurrency: Currency.CAD,
      cutoffs: { 2026: 7 },
    });
    expect(invalid.rows[0].cutoffMonth).toBe(3);
  });

  it('ytd leaves out a year whose cutoff is null', () => {
    const result = buildYearlyComparison({
      monthly: [row('2026-01', '100')],
      mode: 'ytd',
      baseCurrency: Currency.CAD,
      cutoffs: { 2026: null },
    });
    expect(result.rows).toEqual([]);
  });

  it('converts into the base currency using the configured rate', () => {
    vi.stubEnv('FX_CAD_TO_USD', '0.5');
    const monthly = [row('2026-01', '0', '100'), row('2026-02', '40', '0')];

    const inCad = buildYearlyComparison({
      monthly,
      mode: 'full-year',
      baseCurrency: Currency.CAD,
    });
    // 100 USD / 0.5 = 200 CAD, plus 40 CAD
    expect(inCad.rows[0].convertedTotal).toBe(240);

    const inUsd = buildYearlyComparison({
      monthly,
      mode: 'full-year',
      baseCurrency: Currency.USD,
    });
    // 100 USD + 40 CAD * 0.5
    expect(inUsd.rows[0].convertedTotal).toBe(120);
  });

  it('uses 0.74 when no rate is configured or the configured one is invalid', () => {
    vi.stubEnv('FX_CAD_TO_USD', 'abc');
    const result = buildYearlyComparison({
      monthly: [row('2026-01', '100', '0')],
      mode: 'full-year',
      baseCurrency: Currency.USD,
    });
    expect(result.rows[0].convertedTotal).toBe(74);
  });

  it('ignores income rows and returns an empty result with no expenses', () => {
    const income: MonthlyTotals = { ...row('2026-01', '500'), type: 'income' };
    expect(
      buildYearlyComparison({ monthly: [income], mode: 'full-year', baseCurrency: Currency.CAD }),
    ).toEqual({ rows: [], ytdCutoffOptionsByYear: {}, defaultYtdCutoffByYear: {} });
  });
});
