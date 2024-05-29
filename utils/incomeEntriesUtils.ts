import { capitalizeWords } from './common';
import { MonthlyData, MonthlyDataTypes } from '../models/MonthlyData';
import { IncomeEntry } from '../models/IncomeEntry';
import { Op } from 'sequelize';

interface IncomeEntryBody {
  date: string;
  description: string;
  category: string;
  amount: string;
}

export const createIncomeEntryObject = (body: IncomeEntryBody) => {
  const { description } = body;

  return {
    ...body,
    description: capitalizeWords(description),
  };
};

export const updateMonthlyDataPut = async ({ incomeEntry }: { incomeEntry: IncomeEntry }) => {
  const { date } = incomeEntry;
  const year = date.split('-')[0];
  const month = date.split('-')[1];

  const yearMonth = `${year}-${month}`;

  const monthlyData = await MonthlyData.findOne({
    where: { yearMonth, type: MonthlyDataTypes.Income },
  });

  const allIncomeEntriesThatMonth = await IncomeEntry.findAll({
    where: { date: { [Op.startsWith]: yearMonth } },
  });

  const totalAmount = allIncomeEntriesThatMonth.reduce(
    (acc, incomeEntry) => acc + parseFloat(incomeEntry.amount),
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
    type: MonthlyDataTypes.Income,
    amount: totalAmount,
    yearMonth,
  });
};

export const updateMonthlyDataPost = async ({ incomeEntry }: { incomeEntry: IncomeEntry }) => {
  const { amount, date } = incomeEntry;
  const parsedAmount = parseFloat(amount);
  const year = date.split('-')[0];
  const month = date.split('-')[1];

  const yearMonth = `${year}-${month}`;
  const monthlyData = await MonthlyData.findOne({
    where: { yearMonth, type: MonthlyDataTypes.Income },
  });

  if (monthlyData) {
    await monthlyData.increment('amount', { by: parsedAmount });
    return;
  }

  await MonthlyData.create({
    type: MonthlyDataTypes.Income,
    amount: parsedAmount,
    yearMonth,
  });
};
