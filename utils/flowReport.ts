import { col, fn, Op } from 'sequelize';
import { Currency, Expense } from '../models/Expense.js';
import { IncomeEntry } from '../models/IncomeEntry.js';
import { convertAmount } from './fx.js';

// Only these count toward the "income" balance that the savings swing is
// measured on; crypto is deliberately left out.
const FLOW_INCOME_CATEGORIES = ['bankAccounts', 'cash', 'investments'];

export interface IncomeFlowRow {
  yearMonth: string;
  category: string;
  currency: string;
  total: number;
}

export interface ExpenseFlowRow {
  yearMonth: string;
  category: string;
  currency: string;
  total: number;
}

export interface FlowReport {
  availableMonths: string[];
  activeMonth: string | null;
  // All USD. incomeAmount is expenses + savings (what the chart's Income node shows).
  incomeAmount: number;
  expenseTotal: number;
  savings: number;
  cashSavings: number;
  investmentGrowth: number;
  categories: { category: string; value: number }[];
}

const round2 = (value: number) => parseFloat(value.toFixed(2));

const toUsd = (amount: number, currency: string) =>
  currency === Currency.CAD
    ? convertAmount({ amount, from: Currency.CAD, to: Currency.USD })
    : amount;

const emptyReport = (): FlowReport => ({
  availableMonths: [],
  activeMonth: null,
  incomeAmount: 0,
  expenseTotal: 0,
  savings: 0,
  cashSavings: 0,
  investmentGrowth: 0,
  categories: [],
});

// Pure. Compares the chosen month's income balance with the previous eligible
// month's: that difference is "savings", and the month's expenses are split by
// category. A month is eligible when it has expenses and is not the very first
// month with income (there is nothing earlier to compare it to).
export const buildFlowReport = ({
  incomeRows,
  expenseRows,
  selectedMonth,
}: {
  incomeRows: IncomeFlowRow[];
  expenseRows: ExpenseFlowRow[];
  selectedMonth?: string;
}): FlowReport => {
  const totals: Record<string, number> = {};
  const cashTotals: Record<string, number> = {};
  const investTotals: Record<string, number> = {};

  for (const row of incomeRows) {
    if (!FLOW_INCOME_CATEGORIES.includes(row.category)) continue;
    const usd = toUsd(row.total, row.currency);
    totals[row.yearMonth] = (totals[row.yearMonth] ?? 0) + usd;
    const bucket = row.category === 'investments' ? investTotals : cashTotals;
    bucket[row.yearMonth] = (bucket[row.yearMonth] ?? 0) + usd;
  }

  const incomeMonths = Object.keys(totals).sort();
  const expenseMonths = new Set(expenseRows.map((row) => row.yearMonth));
  const availableMonths = incomeMonths.filter(
    (month, index) => index > 0 && expenseMonths.has(month),
  );
  if (!availableMonths.length) return emptyReport();

  const desired = selectedMonth ? availableMonths.indexOf(selectedMonth) : -1;
  const activeIndex = desired >= 0 ? desired : availableMonths.length - 1;
  const activeMonth = availableMonths[activeIndex];
  if (activeIndex === 0) return { ...emptyReport(), availableMonths, activeMonth };

  const previousMonth = availableMonths[activeIndex - 1];
  const savings = Math.abs(round2(totals[activeMonth] - totals[previousMonth]));
  const cashSavings = round2((cashTotals[activeMonth] ?? 0) - (cashTotals[previousMonth] ?? 0));
  const investmentGrowth = round2(
    (investTotals[activeMonth] ?? 0) - (investTotals[previousMonth] ?? 0),
  );

  const byCategory = new Map<string, number>();
  for (const row of expenseRows) {
    if (row.yearMonth !== activeMonth) continue;
    byCategory.set(
      row.category,
      (byCategory.get(row.category) ?? 0) + toUsd(row.total, row.currency),
    );
  }
  const categories = [...byCategory.entries()]
    .map(([category, value]) => ({ category, value: round2(value) }))
    .sort((a, b) => b.value - a.value);
  const expenseTotal = round2([...byCategory.values()].reduce((sum, value) => sum + value, 0));

  return {
    availableMonths,
    activeMonth,
    incomeAmount: round2(expenseTotal + savings),
    expenseTotal,
    savings,
    cashSavings,
    investmentGrowth,
    categories: expenseTotal + savings > 0 ? categories : [],
  };
};

export const getFlowReport = async (
  userId: string | null,
  selectedMonth?: string,
): Promise<FlowReport> => {
  const [income, expenses] = await Promise.all([
    IncomeEntry.findAll({
      attributes: [
        [fn('SUBSTRING', col('date'), 1, 7), 'yearMonth'],
        'category',
        'currency',
        [fn('SUM', col('amount')), 'total'],
      ],
      where: { userId, category: FLOW_INCOME_CATEGORIES },
      group: [fn('SUBSTRING', col('date'), 1, 7), 'category', 'currency'],
      raw: true,
    }) as unknown as Promise<
      { yearMonth: string; category: string; currency: string; total: string | null }[]
    >,
    Expense.findAll({
      attributes: ['year', 'month', 'category', 'currency', [fn('SUM', col('amount')), 'total']],
      where: { userId, amount: { [Op.gt]: 0 }, year: { [Op.ne]: null }, month: { [Op.ne]: null } },
      group: ['year', 'month', 'category', 'currency'],
      raw: true,
    }) as unknown as Promise<
      {
        year: number;
        month: number;
        category: string | null;
        currency: string;
        total: string | null;
      }[]
    >,
  ]);

  return buildFlowReport({
    incomeRows: income
      .filter((row) => /^\d{4}-\d{2}$/.test(row.yearMonth ?? ''))
      .map((row) => ({ ...row, total: parseFloat(row.total ?? '0') || 0 })),
    expenseRows: expenses.map((row) => ({
      yearMonth: `${row.year}-${String(row.month).padStart(2, '0')}`,
      category: row.category?.trim() || 'Uncategorized',
      currency: row.currency,
      total: parseFloat(row.total ?? '0') || 0,
    })),
    selectedMonth,
  });
};
