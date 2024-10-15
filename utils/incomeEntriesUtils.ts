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

export const postMonthlyData = async ({ incomeEntry }: { incomeEntry: IncomeEntry }) => {
  const { amount, date, currency } = incomeEntry;
  const parsedAmount = parseFloat(amount);
  const year = date.split('-')[0];
  const month = date.split('-')[1];

  const yearMonth = `${year}-${month}`;
  const monthlyData = await MonthlyData.findOne({
    where: { yearMonth, type: MonthlyDataTypes.Income },
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
    type: MonthlyDataTypes.Income,
    amountCad: currency === 'CAD' ? parsedAmount : 0,
    amountUsd: currency === 'USD' ? parsedAmount : 0,
    yearMonth,
  });
};

export const putMonthlyData = async ({ incomeEntry }: { incomeEntry: IncomeEntry }) => {
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

  const totalAmountCad = allIncomeEntriesThatMonth.reduce((acc, entry) => {
    return acc + (entry.currency === 'CAD' ? parseFloat(entry.amount) : 0);
  }, 0);

  const totalAmountUsd = allIncomeEntriesThatMonth.reduce((acc, entry) => {
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
    type: MonthlyDataTypes.Income,
    amountCad: totalAmountCad,
    amountUsd: totalAmountUsd,
    yearMonth,
  });
};
