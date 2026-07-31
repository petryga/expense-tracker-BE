import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { resetDemoUserData } from './demoData.js';
import { sequelize } from '../config/database.js';
import { Expense } from '../models/Expense.js';
import { IncomeEntry } from '../models/IncomeEntry.js';
import { RecurringExpense } from '../models/RecurringExpense.js';
import { RecurringIncomeEntry } from '../models/RecurringIncomeEntry.js';
import { MonthlyData } from '../models/MonthlyData.js';
import { Account } from '../models/Account.js';
import { Category } from '../models/Category.js';
import { CategoryBudget } from '../models/CategoryBudget.js';

const USER_ID = 'demo-user-123';
// resetDemoUserData runs everything inside sequelize.transaction; the
// callback form only receives the transaction, so a plain marker object
// stands in for it and lets us assert every call was scoped to it.
const FAKE_TRANSACTION = { fake: true } as any;

beforeEach(() => {
  // Fully deterministic: expenseCount becomes 6 (the minimum) every month,
  // randomItem always picks the first template, currency always resolves
  // to USD — none of that matters here since this test is only about the
  // orchestration (what gets wiped and what gets created), not the fake
  // data's content, which is already covered in demoData.test.ts.
  vi.spyOn(Math, 'random').mockReturnValue(0);

  vi.spyOn(sequelize, 'transaction').mockImplementation(((fn: any) =>
    fn(FAKE_TRANSACTION)) as any);

  vi.spyOn(Expense, 'destroy').mockResolvedValue(0);
  vi.spyOn(Expense, 'create').mockImplementation((data: any) => Promise.resolve(data));

  vi.spyOn(IncomeEntry, 'destroy').mockResolvedValue(0);
  vi.spyOn(IncomeEntry, 'create').mockImplementation((data: any) => Promise.resolve(data));

  vi.spyOn(RecurringExpense, 'destroy').mockResolvedValue(0);
  vi.spyOn(RecurringExpense, 'bulkCreate').mockResolvedValue([] as any);

  vi.spyOn(RecurringIncomeEntry, 'destroy').mockResolvedValue(0);
  vi.spyOn(RecurringIncomeEntry, 'bulkCreate').mockResolvedValue([] as any);

  vi.spyOn(MonthlyData, 'destroy').mockResolvedValue(0);
  vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null as any);
  vi.spyOn(MonthlyData, 'create').mockResolvedValue({} as any);

  vi.spyOn(Account, 'destroy').mockResolvedValue(0);
  vi.spyOn(Account, 'bulkCreate').mockResolvedValue([] as any);

  vi.spyOn(Category, 'destroy').mockResolvedValue(0);
  vi.spyOn(CategoryBudget, 'destroy').mockResolvedValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resetDemoUserData', () => {
  it('wipes all eight tables scoped to the given userId before reseeding', async () => {
    await resetDemoUserData(USER_ID);

    expect(Expense.destroy).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      transaction: FAKE_TRANSACTION,
    });
    expect(IncomeEntry.destroy).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      transaction: FAKE_TRANSACTION,
    });
    expect(RecurringExpense.destroy).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      transaction: FAKE_TRANSACTION,
    });
    expect(RecurringIncomeEntry.destroy).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      transaction: FAKE_TRANSACTION,
    });
    expect(MonthlyData.destroy).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      transaction: FAKE_TRANSACTION,
    });
    expect(Account.destroy).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      transaction: FAKE_TRANSACTION,
    });
    expect(CategoryBudget.destroy).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      transaction: FAKE_TRANSACTION,
    });
    expect(Category.destroy).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      transaction: FAKE_TRANSACTION,
    });
  });

  it('does not recreate categories itself - relies on GET /categories to reprovision', async () => {
    const createSpy = vi.spyOn(Category, 'create');

    await resetDemoUserData(USER_ID);

    expect(createSpy).not.toHaveBeenCalled();
  });

  it('creates 6 fake expenses and 2 fake income entries per month across 6 months, all owned by userId', async () => {
    await resetDemoUserData(USER_ID);

    expect(Expense.create).toHaveBeenCalledTimes(36); // 6 months * 6 (minimum expenseCount)
    expect(IncomeEntry.create).toHaveBeenCalledTimes(12); // 6 months * 2 income templates

    const expenseCalls = vi.mocked(Expense.create).mock.calls;
    expect(expenseCalls.every(([data]: any) => data.userId === USER_ID)).toBe(true);

    const incomeCalls = vi.mocked(IncomeEntry.create).mock.calls;
    expect(incomeCalls.every(([data]: any) => data.userId === USER_ID)).toBe(true);
  });

  it('seeds the recurring expense and income templates for userId', async () => {
    await resetDemoUserData(USER_ID);

    expect(RecurringExpense.bulkCreate).toHaveBeenCalledOnce();
    const recurringExpenses = vi.mocked(RecurringExpense.bulkCreate).mock.calls[0][0] as any[];
    expect(recurringExpenses).toHaveLength(3);
    expect(recurringExpenses.every((row) => row.userId === USER_ID)).toBe(true);

    expect(RecurringIncomeEntry.bulkCreate).toHaveBeenCalledOnce();
    const recurringIncome = vi.mocked(RecurringIncomeEntry.bulkCreate).mock.calls[0][0] as any[];
    expect(recurringIncome).toHaveLength(2);
    expect(recurringIncome.every((row) => row.userId === USER_ID)).toBe(true);
  });

  it('seeds the demo accounts for userId', async () => {
    await resetDemoUserData(USER_ID);

    expect(Account.bulkCreate).toHaveBeenCalledOnce();
    const accounts = vi.mocked(Account.bulkCreate).mock.calls[0][0] as any[];
    expect(accounts).toHaveLength(3);
    expect(accounts.every((row) => row.userId === USER_ID)).toBe(true);
    expect(accounts.every((row) => row.isDefault === false)).toBe(true);
    expect(accounts.map((row) => row.name).sort()).toEqual(
      ['Acme Checking', 'Acme Credit Card', 'Globex Savings'].sort()
    );
  });
});
