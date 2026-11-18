import { Op } from 'sequelize';
import { Currency, Expense } from '../models/Expense.js';
import { fromCents, toCents } from './money.js';
import { reportCategory } from './gifts.js';

export interface ReportExpense {
  category: string | null;
  isGift?: boolean | null;
  description: string;
  amount: number | string;
  currency: string;
  merchant?: string | null;
}

export interface CategoryBreakdown {
  category: string;
  total: number;
  details: { description: string; amount: number; currency: string; merchant?: string }[];
}

export interface MonthlyReport {
  yearMonth: string;
  dataByCategory: CategoryBreakdown[];
  totalSpentCad: number;
  totalSpentUsd: number;
}

// Pure: one month's expenses -> per-category breakdown, biggest first.
// Zero/negative amounts are skipped; only CAD/USD rows count toward totals
// (a row in any other currency is listed in details but not summed).
export const buildMonthlyReport = (yearMonth: string, expenses: ReportExpense[]): MonthlyReport => {
  // Totals are added in whole cents (utils/money.ts), so they are exact.
  const byCategory = new Map<string, CategoryBreakdown & { cents: number }>();
  let totalCad = 0;
  let totalUsd = 0;

  for (const expense of expenses) {
    const amount = Number(expense.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const cents = toCents(amount);

    const category = reportCategory(expense.category, expense.isGift);
    const entry = byCategory.get(category) ?? { category, total: 0, cents: 0, details: [] };

    if (expense.currency === Currency.CAD) {
      totalCad += cents;
      entry.cents += cents;
    } else if (expense.currency === Currency.USD) {
      totalUsd += cents;
      entry.cents += cents;
    }

    entry.details.push({
      description: expense.description,
      amount,
      currency: expense.currency,
      ...(expense.merchant ? { merchant: expense.merchant } : {}),
    });
    byCategory.set(category, entry);
  }

  const dataByCategory = [...byCategory.values()]
    .map(({ cents, ...entry }) => ({
      ...entry,
      total: fromCents(cents),
      details: entry.details.sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => b.total - a.total);

  return {
    yearMonth,
    dataByCategory,
    totalSpentCad: fromCents(totalCad),
    totalSpentUsd: fromCents(totalUsd),
  };
};

export const getMonthlyReport = async (
  userId: string | null,
  year: number,
  month: number,
): Promise<MonthlyReport> => {
  const expenses = await Expense.findAll({ where: { userId, year, month } });
  return buildMonthlyReport(`${year}-${String(month).padStart(2, '0')}`, expenses);
};

// Months that have at least one expense, newest first.
export const getReportMonths = async (userId: string | null): Promise<string[]> => {
  const rows = (await Expense.findAll({
    attributes: ['year', 'month'],
    where: { userId, year: { [Op.ne]: null }, month: { [Op.ne]: null } },
    group: ['year', 'month'],
    raw: true,
  })) as unknown as { year: number; month: number }[];

  return rows
    .map((row) => `${row.year}-${String(row.month).padStart(2, '0')}`)
    .sort()
    .reverse();
};
