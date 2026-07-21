import { MonthlyData, MonthlyDataTypes } from '../models/MonthlyData.js';
import { Currency, IncomeEntry } from '../models/IncomeEntry.js';
import { Op, Transaction } from 'sequelize';

interface IncomeEntryBody {
  id?: string;
  date: string;
  description: string;
  category: string;
  amount: string;
  currency?: Currency | '';
}

export const createIncomeEntryObject = (body: IncomeEntryBody, userId: string | null) => {
  // Explicit allow-list rather than `...body` — the FE assigns its own uuid
  // client-side for optimistic UI, so `id` is a legitimate field to accept,
  // but nothing else the client sends (e.g. a forged createdAt/updatedAt)
  // should reach the database.
  const { id, date, description, category, amount, currency } = body;
  return {
    id,
    date,
    description,
    category,
    amount,
    currency,
    userId,
  };
};

export const postMonthlyData = async ({
  incomeEntry,
  transaction,
}: {
  incomeEntry: IncomeEntry;
  transaction?: Transaction;
}) => {
  const { amount, date, currency, userId } = incomeEntry;
  const parsedAmount = parseFloat(amount);
  const year = date.split('-')[0];
  const month = date.split('-')[1];

  const yearMonth = `${year}-${month}`;
  const monthlyData = await MonthlyData.findOne({
    where: { yearMonth, type: MonthlyDataTypes.Income, userId },
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
      type: MonthlyDataTypes.Income,
      amountCad: currency === Currency.CAD ? parsedAmount : 0,
      amountUsd: currency === Currency.USD ? parsedAmount : 0,
      yearMonth,
      userId,
    },
    { transaction }
  );
};

export const putMonthlyData = async ({
  incomeEntry,
  transaction,
}: {
  incomeEntry: IncomeEntry;
  transaction?: Transaction;
}) => {
  const { date, userId } = incomeEntry;
  const year = date.split('-')[0];
  const month = date.split('-')[1];

  const yearMonth = `${year}-${month}`;

  const monthlyData = await MonthlyData.findOne({
    where: { yearMonth, type: MonthlyDataTypes.Income, userId },
    transaction,
  });

  const allIncomeEntriesThatMonth = await IncomeEntry.findAll({
    where: { date: { [Op.startsWith]: yearMonth }, userId },
    transaction,
  });

  const totalAmountCad = allIncomeEntriesThatMonth.reduce((acc, entry) => {
    return acc + (entry.currency === Currency.CAD ? parseFloat(entry.amount) : 0);
  }, 0);

  const totalAmountUsd = allIncomeEntriesThatMonth.reduce((acc, entry) => {
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
      type: MonthlyDataTypes.Income,
      amountCad: totalAmountCad,
      amountUsd: totalAmountUsd,
      yearMonth,
      userId,
    },
    { transaction }
  );
};
