import { Transaction } from 'sequelize';
import { sequelize } from '../config/database.js';
import { Currency, Expense } from '../models/Expense.js';
import { IncomeEntry } from '../models/IncomeEntry.js';
import { MonthlyData, MonthlyDataTypes } from '../models/MonthlyData.js';

export interface ExpenseRow {
  year: number | null;
  month: number | null;
  amount: string | number;
  currency: string;
  userId: string | null;
}

export interface IncomeRow {
  date: string;
  amount: string | number;
  currency: string;
  userId: string | null;
}

interface RollupSource {
  yearMonth: string;
  amount: string | number;
  currency: string;
  userId: string | null;
}

export interface RollupRow {
  id: string;
  yearMonth: string;
  amountCad: string | number;
  amountUsd: string | number;
  userId: string | null;
}

export type RollupChange =
  | {
      action: 'create';
      userId: string | null;
      yearMonth: string;
      amountCad: number;
      amountUsd: number;
    }
  | {
      action: 'update';
      id: string;
      userId: string | null;
      yearMonth: string;
      from: { amountCad: number; amountUsd: number };
      to: { amountCad: number; amountUsd: number };
    }
  | { action: 'delete'; id: string; userId: string | null; yearMonth: string; reason: string };

const round2 = (n: number) => Math.round(n * 100) / 100;
const keyOf = (userId: string | null, yearMonth: string) => `${userId ?? 'null'}|${yearMonth}`;
const EPSILON = 0.005;

// Pure: given every source row and every rollup row of that type, work out what has to
// change so each (user, month) rollup equals the real sum. Rollup keys are
// `${year}-${month}` with an unpadded month, matching postMonthlyData.
const diffRollups = (sources: RollupSource[], rollups: RollupRow[]): RollupChange[] => {
  const expected = new Map<
    string,
    { userId: string | null; yearMonth: string; cad: number; usd: number }
  >();

  for (const source of sources) {
    const key = keyOf(source.userId, source.yearMonth);
    const entry = expected.get(key) ?? {
      userId: source.userId,
      yearMonth: source.yearMonth,
      cad: 0,
      usd: 0,
    };
    const amount = parseFloat(String(source.amount)) || 0;
    if (source.currency === Currency.CAD) entry.cad += amount;
    else if (source.currency === Currency.USD) entry.usd += amount;
    expected.set(key, entry);
  }

  const changes: RollupChange[] = [];
  const seen = new Set<string>();

  for (const rollup of rollups) {
    const key = keyOf(rollup.userId, rollup.yearMonth);
    const target = expected.get(key);

    // No expenses left for that month, or a duplicate row for a month we
    // already handled: either way this row should not exist.
    if (!target || seen.has(key)) {
      changes.push({
        action: 'delete',
        id: rollup.id,
        userId: rollup.userId,
        yearMonth: rollup.yearMonth,
        reason: target ? 'duplicate row' : 'no entries in this month',
      });
      continue;
    }
    seen.add(key);

    const from = {
      amountCad: round2(parseFloat(String(rollup.amountCad)) || 0),
      amountUsd: round2(parseFloat(String(rollup.amountUsd)) || 0),
    };
    const to = { amountCad: round2(target.cad), amountUsd: round2(target.usd) };
    if (
      Math.abs(from.amountCad - to.amountCad) > EPSILON ||
      Math.abs(from.amountUsd - to.amountUsd) > EPSILON
    ) {
      changes.push({
        action: 'update',
        id: rollup.id,
        userId: rollup.userId,
        yearMonth: rollup.yearMonth,
        from,
        to,
      });
    }
  }

  for (const [key, target] of expected) {
    if (seen.has(key)) continue;
    changes.push({
      action: 'create',
      userId: target.userId,
      yearMonth: target.yearMonth,
      amountCad: round2(target.cad),
      amountUsd: round2(target.usd),
    });
  }

  return changes;
};

// Expense rollup keys are `${year}-${month}` with an unpadded month, matching
// postMonthlyData in expensesUtils.
export const diffExpenseRollups = (expenses: ExpenseRow[], rollups: RollupRow[]) =>
  diffRollups(
    expenses
      .filter((expense) => expense.year && expense.month)
      .map((expense) => ({
        yearMonth: `${expense.year}-${expense.month}`,
        amount: expense.amount,
        currency: expense.currency,
        userId: expense.userId,
      })),
    rollups,
  );

// Income rollup keys are the zero-padded `YYYY-MM` prefix of the entry's date.
export const diffIncomeRollups = (entries: IncomeRow[], rollups: RollupRow[]) =>
  diffRollups(
    entries
      .filter((entry) => /^\d{4}-\d{2}/.test(entry.date))
      .map((entry) => ({
        yearMonth: entry.date.slice(0, 7),
        amount: entry.amount,
        currency: entry.currency,
        userId: entry.userId,
      })),
    rollups,
  );

export const planExpenseRollupRebuild = async (): Promise<RollupChange[]> => {
  const expenses = await Expense.findAll({
    attributes: ['year', 'month', 'amount', 'currency', 'userId'],
    raw: true,
  });
  const rollups = await MonthlyData.findAll({
    where: { type: MonthlyDataTypes.Expense },
    order: [['createdAt', 'ASC']],
    raw: true,
  });
  return diffExpenseRollups(expenses as unknown as ExpenseRow[], rollups as unknown as RollupRow[]);
};

export const planIncomeRollupRebuild = async (): Promise<RollupChange[]> => {
  const entries = await IncomeEntry.findAll({
    attributes: ['date', 'amount', 'currency', 'userId'],
    raw: true,
  });
  const rollups = await MonthlyData.findAll({
    where: { type: MonthlyDataTypes.Income },
    order: [['createdAt', 'ASC']],
    raw: true,
  });
  return diffIncomeRollups(entries as unknown as IncomeRow[], rollups as unknown as RollupRow[]);
};

export const applyRollupChanges = async (type: MonthlyDataTypes, changes: RollupChange[]) => {
  await sequelize.transaction(async (transaction: Transaction) => {
    for (const change of changes) {
      if (change.action === 'create') {
        await MonthlyData.create(
          {
            type,
            amountCad: change.amountCad,
            amountUsd: change.amountUsd,
            yearMonth: change.yearMonth,
            userId: change.userId,
          },
          { transaction },
        );
      } else if (change.action === 'update') {
        await MonthlyData.update(
          { amountCad: change.to.amountCad, amountUsd: change.to.amountUsd },
          { where: { id: change.id }, transaction },
        );
      } else {
        await MonthlyData.destroy({ where: { id: change.id }, transaction });
      }
    }
  });
};
