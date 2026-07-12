import { describe, expect, it, vi, afterEach } from 'vitest';
import { postMonthlyData, putMonthlyData } from './expensesUtils';
import { MonthlyData, MonthlyDataTypes } from '../models/MonthlyData';
import { Currency, Expense } from '../models/Expense';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('postMonthlyData', () => {
  it('creates a new CAD row when none exists yet for the month', async () => {
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null as any);
    const createSpy = vi.spyOn(MonthlyData, 'create').mockResolvedValue({} as any);

    const expense = { amount: '100.50', year: 2026, month: 7, currency: Currency.CAD, userId: 'u1' } as Expense;
    await postMonthlyData({ expense });

    expect(createSpy).toHaveBeenCalledWith({
      type: MonthlyDataTypes.Expense,
      amountCad: 100.5,
      amountUsd: 0,
      yearMonth: '2026-7',
      userId: 'u1',
    });
  });

  it('creates a new USD row when none exists yet for the month', async () => {
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null as any);
    const createSpy = vi.spyOn(MonthlyData, 'create').mockResolvedValue({} as any);

    const expense = { amount: '50', year: 2026, month: 7, currency: Currency.USD, userId: 'u1' } as Expense;
    await postMonthlyData({ expense });

    expect(createSpy).toHaveBeenCalledWith({
      type: MonthlyDataTypes.Expense,
      amountCad: 0,
      amountUsd: 50,
      yearMonth: '2026-7',
      userId: 'u1',
    });
  });

  it('increments the CAD total on an existing row instead of creating a new one', async () => {
    const increment = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue({ increment } as any);
    const createSpy = vi.spyOn(MonthlyData, 'create').mockResolvedValue({} as any);

    const expense = { amount: '25', year: 2026, month: 7, currency: Currency.CAD, userId: 'u1' } as Expense;
    await postMonthlyData({ expense });

    expect(increment).toHaveBeenCalledWith('amountCad', { by: 25 });
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('increments the USD total on an existing row', async () => {
    const increment = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue({ increment } as any);

    const expense = { amount: '25', year: 2026, month: 7, currency: Currency.USD, userId: 'u1' } as Expense;
    await postMonthlyData({ expense });

    expect(increment).toHaveBeenCalledWith('amountUsd', { by: 25 });
  });
});

describe('putMonthlyData', () => {
  it('destroys the row when the recalculated totals are both zero', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    const update = vi.fn();
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue({ destroy, update } as any);
    vi.spyOn(Expense, 'findAll').mockResolvedValue([]);

    const expense = { year: 2026, month: 7, userId: 'u1' } as Expense;
    await putMonthlyData({ expense });

    expect(destroy).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
  });

  it('updates the row with recalculated totals summed from the remaining expenses that month', async () => {
    const destroy = vi.fn();
    const update = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue({ destroy, update } as any);
    vi.spyOn(Expense, 'findAll').mockResolvedValue([
      { currency: Currency.CAD, amount: '100' },
      { currency: Currency.CAD, amount: '50' },
      { currency: Currency.USD, amount: '20' },
    ] as Expense[]);

    const expense = { year: 2026, month: 7, userId: 'u1' } as Expense;
    await putMonthlyData({ expense });

    expect(update).toHaveBeenCalledWith({ amountCad: 150, amountUsd: 20 });
    expect(destroy).not.toHaveBeenCalled();
  });

  it('creates a new row when none exists and the remaining expenses are non-zero', async () => {
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null as any);
    const createSpy = vi.spyOn(MonthlyData, 'create').mockResolvedValue({} as any);
    vi.spyOn(Expense, 'findAll').mockResolvedValue([
      { currency: Currency.USD, amount: '30' },
    ] as Expense[]);

    const expense = { year: 2026, month: 7, userId: 'u1' } as Expense;
    await putMonthlyData({ expense });

    expect(createSpy).toHaveBeenCalledWith({
      type: MonthlyDataTypes.Expense,
      amountCad: 0,
      amountUsd: 30,
      yearMonth: '2026-7',
      userId: 'u1',
    });
  });
});
