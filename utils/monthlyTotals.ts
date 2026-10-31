import { col, fn, Op } from 'sequelize';
import { Currency, Expense } from '../models/Expense.js';
import { IncomeEntry } from '../models/IncomeEntry.js';

export type MonthlyTotalsType = 'expense' | 'income';

export interface MonthlyTotalRow {
  type: MonthlyTotalsType;
  yearMonth: string;
  currency: string;
  total: string | number | null;
}

// Same shape the old stored rollup returned, so the FE needs no changes.
export interface MonthlyTotals {
  id: string;
  type: MonthlyTotalsType;
  yearMonth: string;
  amountCad: string;
  amountUsd: string;
}

const YEAR_MONTH = /^\d{4}-\d{2}$/;

// Pure: folds per-(month, currency) sums into one row per (type, month).
// Output months are zero-padded `YYYY-MM`; the FE parses both padded and
// unpadded, and padding makes plain string sorting chronological.
export const buildMonthlyTotals = (rows: MonthlyTotalRow[]): MonthlyTotals[] => {
  const byKey = new Map<
    string,
    { type: MonthlyTotalsType; yearMonth: string; cad: number; usd: number }
  >();

  for (const row of rows) {
    if (!YEAR_MONTH.test(row.yearMonth)) continue;
    const total = parseFloat(String(row.total ?? 0)) || 0;
    const key = `${row.type}|${row.yearMonth}`;
    const entry = byKey.get(key) ?? { type: row.type, yearMonth: row.yearMonth, cad: 0, usd: 0 };
    if (row.currency === Currency.CAD) entry.cad += total;
    else if (row.currency === Currency.USD) entry.usd += total;
    byKey.set(key, entry);
  }

  return [...byKey.values()]
    .filter((entry) => entry.cad !== 0 || entry.usd !== 0)
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth) || a.type.localeCompare(b.type))
    .map((entry) => ({
      id: `${entry.type}-${entry.yearMonth}`,
      type: entry.type,
      yearMonth: entry.yearMonth,
      amountCad: entry.cad.toFixed(2),
      amountUsd: entry.usd.toFixed(2),
    }));
};

// The expenses/income tables are the only source of truth: totals are summed
// from them on every read instead of being kept in a second table that has to
// be synced on each write (which is where all the drift bugs came from).
export interface MonthlyTotalsFilters {
  type?: MonthlyTotalsType;
  category?: string;
  currency?: Currency;
}

export const getMonthlyTotals = async (
  userId: string | null,
  { type, category, currency }: MonthlyTotalsFilters = {},
): Promise<MonthlyTotals[]> => {
  // category/currency narrow both tables the same way; `type` skips the
  // table that wasn't asked for.
  const narrow = {
    ...(category ? { category } : {}),
    ...(currency ? { currency } : {}),
  };

  const [expenseRows, incomeRows] = await Promise.all([
    type === 'income'
      ? Promise.resolve([])
      : (Expense.findAll({
          attributes: ['year', 'month', 'currency', [fn('SUM', col('amount')), 'total']],
          where: { userId, year: { [Op.ne]: null }, month: { [Op.ne]: null }, ...narrow },
          group: ['year', 'month', 'currency'],
          raw: true,
        }) as unknown as Promise<
          { year: number; month: number; currency: string; total: string | null }[]
        >),
    type === 'expense'
      ? Promise.resolve([])
      : (IncomeEntry.findAll({
          attributes: [
            [fn('SUBSTRING', col('date'), 1, 7), 'yearMonth'],
            'currency',
            [fn('SUM', col('amount')), 'total'],
          ],
          where: { userId, ...narrow },
          group: [fn('SUBSTRING', col('date'), 1, 7), 'currency'],
          raw: true,
        }) as unknown as Promise<{ yearMonth: string; currency: string; total: string | null }[]>),
  ]);

  return buildMonthlyTotals([
    ...expenseRows.map((row) => ({
      type: 'expense' as const,
      yearMonth: `${row.year}-${String(row.month).padStart(2, '0')}`,
      currency: row.currency,
      total: row.total,
    })),
    ...incomeRows.map((row) => ({
      type: 'income' as const,
      yearMonth: row.yearMonth,
      currency: row.currency,
      total: row.total,
    })),
  ]);
};
