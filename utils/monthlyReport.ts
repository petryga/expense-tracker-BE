import { Op } from 'sequelize';
import { Currency, Expense } from '../models/Expense.js';

export interface ReportExpense {
  category: string | null;
  description: string;
  amount: number | string;
  currency: string;
}

export interface CategoryBreakdown {
  category: string;
  total: number;
  details: { description: string; amount: number; currency: string }[];
}

export interface MonthlyReport {
  yearMonth: string;
  dataByCategory: CategoryBreakdown[];
  totalSpentCad: number;
  totalSpentUsd: number;
}

const round2 = (value: number) => parseFloat(value.toFixed(2));

// Pure: one month's expenses -> per-category breakdown, biggest first.
// Zero/negative amounts are skipped; only CAD/USD rows count toward totals
// (a row in any other currency is listed in details but not summed).
export const buildMonthlyReport = (yearMonth: string, expenses: ReportExpense[]): MonthlyReport => {
  const byCategory = new Map<string, CategoryBreakdown>();
  let totalCad = 0;
  let totalUsd = 0;

  for (const expense of expenses) {
    const amount = Number(expense.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const category = expense.category?.trim() || 'Uncategorized';
    const entry = byCategory.get(category) ?? { category, total: 0, details: [] };

    if (expense.currency === Currency.CAD) {
      totalCad += amount;
      entry.total += amount;
    } else if (expense.currency === Currency.USD) {
      totalUsd += amount;
      entry.total += amount;
    }

    entry.details.push({ description: expense.description, amount, currency: expense.currency });
    byCategory.set(category, entry);
  }

  const dataByCategory = [...byCategory.values()]
    .map((entry) => ({
      ...entry,
      total: round2(entry.total),
      details: entry.details.sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => b.total - a.total);

  return {
    yearMonth,
    dataByCategory,
    totalSpentCad: round2(totalCad),
    totalSpentUsd: round2(totalUsd),
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
