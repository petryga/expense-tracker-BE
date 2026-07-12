import { sequelize } from '../config/database';
import { Currency, Expense } from '../models/Expense';
import { IncomeEntry } from '../models/IncomeEntry';
import { RecurringExpense } from '../models/RecurringExpense';
import { RecurringIncomeEntry } from '../models/RecurringIncomeEntry';
import { MonthlyData } from '../models/MonthlyData';
import { createExpenseObject, postMonthlyData as postExpenseMonthlyData } from './expensesUtils';
import { createIncomeEntryObject, postMonthlyData as postIncomeMonthlyData } from './incomeEntriesUtils';

const ACCOUNTS = ['TD Savings', 'Amex', 'BofA Debit', 'Cash'];

const EXPENSE_TEMPLATES: { category: string; description: string; min: number; max: number }[] = [
  { category: 'Rent', description: 'Monthly Rent', min: 1400, max: 1600 },
  { category: 'Electricity', description: 'Hydro Bill', min: 40, max: 90 },
  { category: 'Internet', description: 'Internet Bill', min: 60, max: 75 },
  { category: 'Mobile Phone', description: 'Phone Bill', min: 50, max: 80 },
  { category: 'Groceries', description: 'Grocery Run', min: 60, max: 180 },
  { category: 'Groceries', description: 'Grocery Run', min: 60, max: 180 },
  { category: 'Eating Out', description: 'Dinner Out', min: 25, max: 90 },
  { category: 'Coffee Shops', description: 'Coffee', min: 4, max: 12 },
  { category: 'Public Transport', description: 'Transit Pass', min: 30, max: 50 },
  { category: 'Subscriptions', description: 'Streaming Subscription', min: 10, max: 20 },
  { category: 'Entertainment', description: 'Movie Night', min: 20, max: 60 },
  { category: 'Clothing', description: 'New Clothes', min: 30, max: 120 },
  { category: 'Medical Expenses', description: 'Pharmacy Visit', min: 15, max: 60 },
  { category: 'Financial Fees', description: 'Account Fee', min: 3, max: 10 },
];

const INCOME_TEMPLATES: { category: string; description: string; min: number; max: number }[] = [
  { category: 'bankAccounts', description: 'Salary', min: 3200, max: 3800 },
  { category: 'investments', description: 'Dividend Payout', min: 40, max: 200 },
];

const RECURRING_EXPENSE_TEMPLATES = [
  { account: 'Amex', description: 'Streaming Subscription', category: 'Subscriptions', currency: 'USD', amount: 15.99, dayOfMonth: 12 },
  { account: 'TD Savings', description: 'Gym Membership', category: 'Entertainment', currency: 'CAD', amount: 45, dayOfMonth: 1 },
  { account: 'TD Savings', description: 'Account Fee', category: 'Financial Fees', currency: 'CAD', amount: 4.95, dayOfMonth: 28 },
];

const RECURRING_INCOME_TEMPLATES = [
  { category: 'bankAccounts', description: 'Salary', currency: 'CAD', amount: 3500 },
  { category: 'investments', description: 'Index Fund', currency: 'USD', amount: 0 },
];

export const randomBetween = (min: number, max: number) => Math.round((Math.random() * (max - min) + min) * 100) / 100;
export const randomItem = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];
export const randomDay = () => Math.floor(Math.random() * 27) + 1;

export const getLastNMonths = (n: number): { year: number; month: number }[] => {
  const months: { year: number; month: number }[] = [];
  const now = new Date();

  for (let i = n - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: date.getFullYear(), month: date.getMonth() + 1 });
  }

  return months;
};

export const formatDemoDate = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export const resetDemoUserData = async (userId: string) => {
  await sequelize.transaction(async (transaction) => {
    await Promise.all([
      Expense.destroy({ where: { userId }, transaction }),
      IncomeEntry.destroy({ where: { userId }, transaction }),
      RecurringExpense.destroy({ where: { userId }, transaction }),
      RecurringIncomeEntry.destroy({ where: { userId }, transaction }),
      MonthlyData.destroy({ where: { userId }, transaction }),
    ]);

    const months = getLastNMonths(6);

    for (const { year, month } of months) {
      const expenseCount = Math.floor(Math.random() * 4) + 6;
      for (let i = 0; i < expenseCount; i++) {
        const template = randomItem(EXPENSE_TEMPLATES);
        const { id: _discardId, ...expenseObject } = createExpenseObject(
          {
            category: template.category,
            amount: String(randomBetween(template.min, template.max)),
            account: randomItem(ACCOUNTS),
            description: template.description,
            datePosted: formatDemoDate(year, month, randomDay()),
            id: '',
            currency: Math.random() > 0.3 ? Currency.CAD : Currency.USD,
          },
          userId
        );

        const expense = await Expense.create(expenseObject, { transaction });
        await postExpenseMonthlyData({ expense, transaction });
      }

      for (const template of INCOME_TEMPLATES) {
        const incomeObject = createIncomeEntryObject(
          {
            date: formatDemoDate(year, month, randomDay()),
            description: template.description,
            category: template.category,
            amount: String(randomBetween(template.min, template.max)),
          },
          userId
        );

        const incomeEntry = await IncomeEntry.create(
          {
            ...incomeObject,
            currency: 'CAD',
          },
          { transaction }
        );
        await postIncomeMonthlyData({ incomeEntry, transaction });
      }
    }

    await RecurringExpense.bulkCreate(
      RECURRING_EXPENSE_TEMPLATES.map((template) => ({ ...template, userId })),
      { transaction }
    );

    await RecurringIncomeEntry.bulkCreate(
      RECURRING_INCOME_TEMPLATES.map((template) => ({ ...template, userId })),
      { transaction }
    );
  });
};
