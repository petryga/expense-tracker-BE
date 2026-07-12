import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { resetDemoUserData } from './demoData';
import { Expense } from '../models/Expense';
import { IncomeEntry } from '../models/IncomeEntry';
import { RecurringExpense } from '../models/RecurringExpense';
import { RecurringIncomeEntry } from '../models/RecurringIncomeEntry';
import { MonthlyData } from '../models/MonthlyData';

const USER_ID = 'demo-user-123';

beforeEach(() => {
  // Fully deterministic: expenseCount becomes 6 (the minimum) every month,
  // randomItem always picks the first template, currency always resolves
  // to USD — none of that matters here since this test is only about the
  // orchestration (what gets wiped and what gets created), not the fake
  // data's content, which is already covered in demoData.test.ts.
  vi.spyOn(Math, 'random').mockReturnValue(0);

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
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resetDemoUserData', () => {
  it('wipes all five tables scoped to the given userId before reseeding', async () => {
    await resetDemoUserData(USER_ID);

    expect(Expense.destroy).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    expect(IncomeEntry.destroy).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    expect(RecurringExpense.destroy).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    expect(RecurringIncomeEntry.destroy).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    expect(MonthlyData.destroy).toHaveBeenCalledWith({ where: { userId: USER_ID } });
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
});
