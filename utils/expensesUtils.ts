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

export const updateMonthlyDataPut = async ({ expense }: { expense: Expense }) => {
  const { year, month } = expense;
  const yearMonth = `${year}-${month}`;

  const monthlyData = await MonthlyData.findOne({
    where: { yearMonth, type: MonthlyDataTypes.Expense },
  });

  const allExpensesThatMonth = await Expense.findAll({
    where: { year, month },
  });

  const totalAmount = allExpensesThatMonth.reduce(
    (acc, expense) => acc + parseFloat(expense.amount),
    0
  );

  if (monthlyData) {
    if (totalAmount === 0) {
      await monthlyData.destroy();
      return;
    }

    await monthlyData.update({ amount: totalAmount });
    return;
  }

  await MonthlyData.create({
    type: MonthlyDataTypes.Expense,
    amount: totalAmount,
    yearMonth,
  });
};

export const updateMonthlyDataPost = async ({ expense }: { expense: Expense }) => {
  const { amount, year, month } = expense;
  const yearMonth = `${year}-${month}`;
  const parsedAmount = parseFloat(amount);

  const monthlyData = await MonthlyData.findOne({
    where: { yearMonth, type: MonthlyDataTypes.Expense },
  });

  if (monthlyData) {
    await monthlyData.increment('amount', { by: parsedAmount });
    return;
  }

  await MonthlyData.create({
    type: MonthlyDataTypes.Expense,
    amount: parsedAmount,
    yearMonth,
  });
};
