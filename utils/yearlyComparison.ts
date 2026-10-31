import { Currency } from '../models/Expense.js';
import { convertAmount } from './fx.js';
import type { MonthlyTotals } from './monthlyTotals.js';

export type YearlyComparisonMode = 'ytd' | 'full-year';

// year -> cutoff month; null means "leave this year out" (YTD mode only).
export type CutoffsByYear = Record<number, number | null>;

export interface YearlyComparisonRow {
  year: number;
  amountCad: number;
  amountUsd: number;
  convertedTotal: number;
  monthsCount: number;
  cutoffMonth: number | null;
  annualized: number;
  isIncomplete: boolean;
}

export interface YearlyComparisonResult {
  rows: YearlyComparisonRow[];
  ytdCutoffOptionsByYear: Record<number, number[]>;
  defaultYtdCutoffByYear: Record<number, number>;
}

interface MonthEntry {
  year: number;
  month: number;
  amountCad: number;
  amountUsd: number;
}

const round2 = (value: number) => parseFloat(value.toFixed(2));

// Pure. Input is the expense rows from getMonthlyTotals (zero-padded
// `YYYY-MM`, string amounts); months with no spending simply don't exist.
export const buildYearlyComparison = ({
  monthly,
  mode,
  baseCurrency,
  cutoffs = {},
}: {
  monthly: MonthlyTotals[];
  mode: YearlyComparisonMode;
  baseCurrency: Currency;
  cutoffs?: CutoffsByYear;
}): YearlyComparisonResult => {
  const entries: MonthEntry[] = monthly
    .filter((row) => row.type === 'expense')
    .map((row) => {
      const [year, month] = row.yearMonth.split('-').map(Number);
      return {
        year,
        month,
        amountCad: parseFloat(row.amountCad) || 0,
        amountUsd: parseFloat(row.amountUsd) || 0,
      };
    })
    .filter((entry) => entry.month >= 1 && entry.month <= 12);

  const byYear = new Map<number, MonthEntry[]>();
  for (const entry of entries) {
    byYear.set(entry.year, [...(byYear.get(entry.year) ?? []), entry]);
  }

  const ytdCutoffOptionsByYear: Record<number, number[]> = {};
  const defaultYtdCutoffByYear: Record<number, number> = {};
  const resolvedCutoff: Record<number, number | null> = {};

  for (const [year, yearEntries] of byYear) {
    const months = [...new Set(yearEntries.map((entry) => entry.month))].sort((a, b) => a - b);
    const latest = months[months.length - 1];
    const requested = cutoffs[year];

    ytdCutoffOptionsByYear[year] = months;
    defaultYtdCutoffByYear[year] = latest;
    if (requested === null) resolvedCutoff[year] = null;
    else if (typeof requested === 'number' && months.includes(requested)) {
      resolvedCutoff[year] = requested;
    } else resolvedCutoff[year] = latest;
  }

  const rows: YearlyComparisonRow[] = [];
  for (const [year, yearEntries] of byYear) {
    const cutoffMonth = mode === 'ytd' ? resolvedCutoff[year] : null;
    if (mode === 'ytd' && cutoffMonth === null) continue;

    const selected = cutoffMonth ? yearEntries.filter((e) => e.month <= cutoffMonth) : yearEntries;
    if (!selected.length) continue;

    const convertedTotal = selected.reduce(
      (sum, e) =>
        sum +
        convertAmount({
          amount: e.amountCad,
          from: Currency.CAD,
          to: baseCurrency,
          year: e.year,
          month: e.month,
        }) +
        convertAmount({
          amount: e.amountUsd,
          from: Currency.USD,
          to: baseCurrency,
          year: e.year,
          month: e.month,
        }),
      0,
    );

    rows.push({
      year,
      amountCad: round2(selected.reduce((sum, e) => sum + e.amountCad, 0)),
      amountUsd: round2(selected.reduce((sum, e) => sum + e.amountUsd, 0)),
      convertedTotal: round2(convertedTotal),
      monthsCount: selected.length,
      cutoffMonth,
      annualized: round2((convertedTotal / selected.length) * 12),
      isIncomplete: cutoffMonth ? selected.length < cutoffMonth : selected.length < 12,
    });
  }

  rows.sort((a, b) => a.year - b.year);
  return { rows, ytdCutoffOptionsByYear, defaultYtdCutoffByYear };
};
