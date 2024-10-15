import { getMonth, getYear, parseISO } from 'date-fns';
import { Expense } from '../models/Expense';
import { MonthlyData, MonthlyDataTypes } from '../models/MonthlyData';
import { capitalizeWords } from './common';

interface ExpenseBody {
  category: string;
  amount: string;
  account: string;
  description: string;
  datePosted: string;
  id: string;
  currency: string;
}

export const createExpenseObject = (body: ExpenseBody) => {
  const { description, datePosted } = body;
  const date = parseISO(datePosted);

  const year = getYear(date) || null;
  const month = getMonth(date) + 1 || null;
  return {
    ...body,
    year,
    month,
    description: capitalizeWords(description),
  };
};

export const postMonthlyData = async ({ expense }: { expense: Expense }) => {
  const { amount, year, month, currency } = expense;
  const yearMonth = `${year}-${month}`;
  const parsedAmount = parseFloat(amount);

  const monthlyData = await MonthlyData.findOne({
    where: { yearMonth, type: MonthlyDataTypes.Expense },
  });

  if (monthlyData) {
    if (currency === 'CAD') {
      await monthlyData.increment('amountCad', { by: parsedAmount });
    } else if (currency === 'USD') {
      await monthlyData.increment('amountUsd', { by: parsedAmount });
    }
    return;
  }

  await MonthlyData.create({
    type: MonthlyDataTypes.Expense,
    amountCad: currency === 'CAD' ? parsedAmount : 0,
    amountUsd: currency === 'USD' ? parsedAmount : 0,
    yearMonth,
  });
};

export const putMonthlyData = async ({ expense }: { expense: Expense }) => {
  const { year, month } = expense;
  const yearMonth = `${year}-${month}`;

  const monthlyData = await MonthlyData.findOne({
    where: { yearMonth, type: MonthlyDataTypes.Expense },
  });

  const allExpensesThatMonth = await Expense.findAll({
    where: { year, month },
  });

  const totalAmountCad = allExpensesThatMonth.reduce((acc, entry) => {
    return acc + (entry.currency === 'CAD' ? parseFloat(entry.amount) : 0);
  }, 0);

  const totalAmountUsd = allExpensesThatMonth.reduce((acc, entry) => {
    return acc + (entry.currency === 'USD' ? parseFloat(entry.amount) : 0);
  }, 0);

  if (monthlyData) {
    if (totalAmountCad === 0 && totalAmountUsd === 0) {
      await monthlyData.destroy();
      return;
    }

    await monthlyData.update({
      amountCad: totalAmountCad,
      amountUsd: totalAmountUsd,
    });
    return;
  }

  await MonthlyData.create({
    type: MonthlyDataTypes.Expense,
    amountCad: totalAmountCad,
    amountUsd: totalAmountUsd,
    yearMonth,
  });
};
