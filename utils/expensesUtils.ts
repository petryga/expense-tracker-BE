import { getMonth, getYear, parseISO } from 'date-fns';
import { Transaction } from 'sequelize';
import { Currency, Expense } from '../models/Expense.js';
import { MonthlyData, MonthlyDataTypes } from '../models/MonthlyData.js';
import { capitalizeWords } from './common.js';

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
  const { description, datePosted } = body;
  const date = parseISO(datePosted);

  const year = getYear(date) || null;
  const month = getMonth(date) + 1 || null;
  return {
    ...body,
    year,
    month,
    description: capitalizeWords(description),
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

  await MonthlyData.create(
    {
      type: MonthlyDataTypes.Expense,
      amountCad: currency === Currency.CAD ? parsedAmount : 0,
      amountUsd: currency === Currency.USD ? parsedAmount : 0,
      yearMonth,
      userId,
    },
    { transaction }
  );
};

export const putMonthlyData = async ({
  expense,
  transaction,
}: {
  expense: Expense;
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

  const totalAmountCad = allExpensesThatMonth.reduce((acc, entry) => {
    return acc + (entry.currency === Currency.CAD ? parseFloat(entry.amount) : 0);
  }, 0);

  const totalAmountUsd = allExpensesThatMonth.reduce((acc, entry) => {
    return acc + (entry.currency === Currency.USD ? parseFloat(entry.amount) : 0);
  }, 0);

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
      { transaction }
    );
    return;
  }

  await MonthlyData.create(
    {
      type: MonthlyDataTypes.Expense,
      amountCad: totalAmountCad,
      amountUsd: totalAmountUsd,
      yearMonth,
      userId,
    },
    { transaction }
  );
};
