import { Transaction } from 'sequelize';
import { Currency, Expense } from '../models/Expense.js';
import { MonthlyData, MonthlyDataTypes } from '../models/MonthlyData.js';
import { requireDateParts } from './dates.js';

interface ExpenseBody {
  category: string;
  amount: string;
  account: string;
  description: string;
  datePosted: string;
  id: string;
  currency: Currency | '';
}

export const createExpenseObject = (body: ExpenseBody, userId: string | null) => {
  // Explicit allow-list rather than `...body` — the FE assigns its own uuid
  // client-side for optimistic UI (see EditToolBar.tsx), so `id` is a
  // legitimate field to accept, but nothing else the client sends (e.g. a
  // forged createdAt/updatedAt) should reach the database.
  const { id, category, amount, account, description, datePosted, currency } = body;
  // Throws InvalidDateError for a missing/garbled date. Letting it through used
  // to store year/month as null, which silently dropped the expense from every
  // monthly total and spawned a "null-null" rollup row.
  const { year, month } = requireDateParts(datePosted);
  return {
    id,
    category,
    amount,
    account,
    description,
    datePosted,
    currency,
    year,
    month,
    userId,
  };
};

export const postMonthlyData = async ({
  expense,
  transaction,
}: {
  expense: Expense;
  transaction?: Transaction;
}) => {
  const { amount, year, month, currency, userId } = expense;
  const yearMonth = `${year}-${month}`;
  const parsedAmount = parseFloat(amount);

  const monthlyData = await MonthlyData.findOne({
    where: { yearMonth, type: MonthlyDataTypes.Expense, userId },
    transaction,
  });

  if (monthlyData) {
    if (currency === Currency.CAD) {
      await monthlyData.increment('amountCad', { by: parsedAmount, transaction });
    } else if (currency === Currency.USD) {
      await monthlyData.increment('amountUsd', { by: parsedAmount, transaction });
    }
    return;
  }

  // findOrCreateRow (a savepoint under the hood) rather than create: with the
  // unique (user, type, month) index, two requests racing to make the first
  // row for a month would otherwise make one of them fail and poison its
  // transaction. The loser gets the winner's row back and adds to it instead.
  const [row, created] = await MonthlyData.findOrCreateRow({
    where: { yearMonth, type: MonthlyDataTypes.Expense, userId },
    defaults: {
      amountCad: currency === Currency.CAD ? parsedAmount : 0,
      amountUsd: currency === Currency.USD ? parsedAmount : 0,
    },
    transaction,
  });

  if (!created) {
    if (currency === Currency.CAD) {
      await row.increment('amountCad', { by: parsedAmount, transaction });
    } else if (currency === Currency.USD) {
      await row.increment('amountUsd', { by: parsedAmount, transaction });
    }
  }
};

const roundToCents = (value: number) => Math.round(value * 100) / 100;

type ExpenseMonth = Pick<Expense, 'year' | 'month' | 'userId'>;

export const putMonthlyData = async ({
  expense,
  transaction,
}: {
  expense: ExpenseMonth;
  transaction?: Transaction;
}) => {
  const { year, month, userId } = expense;
  const yearMonth = `${year}-${month}`;

  const monthlyData = await MonthlyData.findOne({
    where: { yearMonth, type: MonthlyDataTypes.Expense, userId },
    transaction,
  });

  const allExpensesThatMonth = await Expense.findAll({
    where: { year, month, userId },
    transaction,
  });

  // Rounded to cents: summing JS floats otherwise stores noise like
  // 60.730000000000004.
  const totalAmountCad = roundToCents(
    allExpensesThatMonth.reduce((acc, entry) => {
      return acc + (entry.currency === Currency.CAD ? parseFloat(entry.amount) : 0);
    }, 0),
  );

  const totalAmountUsd = roundToCents(
    allExpensesThatMonth.reduce((acc, entry) => {
      return acc + (entry.currency === Currency.USD ? parseFloat(entry.amount) : 0);
    }, 0),
  );

  if (monthlyData) {
    if (totalAmountCad === 0 && totalAmountUsd === 0) {
      await monthlyData.destroy({ transaction });
      return;
    }

    await monthlyData.update(
      {
        amountCad: totalAmountCad,
        amountUsd: totalAmountUsd,
      },
      { transaction },
    );
    return;
  }

  // No row yet and nothing to record: don't create an empty one.
  if (totalAmountCad === 0 && totalAmountUsd === 0) return;

  const [row, created] = await MonthlyData.findOrCreateRow({
    where: { yearMonth, type: MonthlyDataTypes.Expense, userId },
    defaults: { amountCad: totalAmountCad, amountUsd: totalAmountUsd },
    transaction,
  });
  if (!created) {
    await row.update({ amountCad: totalAmountCad, amountUsd: totalAmountUsd }, { transaction });
  }
};

// After an expense is edited its date may have moved to a different month.
// putMonthlyData only recomputes the month it is handed, so without also
// recomputing the month the expense *left*, that month's rollup keeps the
// moved amount forever.
export const syncMonthlyDataAfterUpdate = async ({
  previous,
  expense,
  transaction,
}: {
  previous: ExpenseMonth;
  expense: ExpenseMonth;
  transaction?: Transaction;
}) => {
  await putMonthlyData({ expense, transaction });

  const monthChanged = previous.year !== expense.year || previous.month !== expense.month;
  if (monthChanged && previous.year && previous.month) {
    await putMonthlyData({ expense: previous, transaction });
  }
};
