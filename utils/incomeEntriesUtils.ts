import { MonthlyData, MonthlyDataTypes } from '../models/MonthlyData.js';
import { Currency, IncomeEntry } from '../models/IncomeEntry.js';
import { Op, Transaction } from 'sequelize';
import { requireDateParts } from './dates.js';

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
  // Throws InvalidDateError. A date that isn't YYYY-MM-DD(...) would produce a
  // garbage rollup key (e.g. "2026/10/31-undefined") and never be summed.
  requireDateParts(date);
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

  // See postMonthlyData in expensesUtils: findOrCreateRow so a race on the first
  // row of a month resolves to "add to the winner's row" instead of an error.
  const [row, created] = await MonthlyData.findOrCreateRow({
    where: { yearMonth, type: MonthlyDataTypes.Income, userId },
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

  const roundToCents = (value: number) => Math.round(value * 100) / 100;

  const totalAmountCad = roundToCents(
    allIncomeEntriesThatMonth.reduce((acc, entry) => {
      return acc + (entry.currency === Currency.CAD ? parseFloat(entry.amount) : 0);
    }, 0),
  );

  const totalAmountUsd = roundToCents(
    allIncomeEntriesThatMonth.reduce((acc, entry) => {
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
    where: { yearMonth, type: MonthlyDataTypes.Income, userId },
    defaults: { amountCad: totalAmountCad, amountUsd: totalAmountUsd },
    transaction,
  });
  if (!created) {
    await row.update({ amountCad: totalAmountCad, amountUsd: totalAmountUsd }, { transaction });
  }
};

// After an income entry is edited its date may have moved to a different
// month. putMonthlyData only recomputes the month it is handed, so without
// also recomputing the month the entry *left*, that month's rollup keeps the
// moved amount forever.
export const syncMonthlyDataAfterUpdate = async ({
  previousDate,
  incomeEntry,
  transaction,
}: {
  previousDate: string;
  incomeEntry: IncomeEntry;
  transaction?: Transaction;
}) => {
  await putMonthlyData({ incomeEntry, transaction });

  const monthOf = (date: string) => date.split('-').slice(0, 2).join('-');
  if (monthOf(previousDate) !== monthOf(incomeEntry.date)) {
    await putMonthlyData({
      incomeEntry: { date: previousDate, userId: incomeEntry.userId } as IncomeEntry,
      transaction,
    });
  }
};
