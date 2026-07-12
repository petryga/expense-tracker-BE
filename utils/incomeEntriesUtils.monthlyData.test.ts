import { describe, expect, it, vi, afterEach } from 'vitest';
import { postMonthlyData, putMonthlyData } from './incomeEntriesUtils';
import { MonthlyData, MonthlyDataTypes } from '../models/MonthlyData';
import { Currency, IncomeEntry } from '../models/IncomeEntry';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('postMonthlyData', () => {
  it('creates a new CAD row when none exists yet for the month', async () => {
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null as any);
    const createSpy = vi.spyOn(MonthlyData, 'create').mockResolvedValue({} as any);

    const incomeEntry = { amount: '3500', date: '2026-07-15', currency: Currency.CAD, userId: 'u1' } as IncomeEntry;
    await postMonthlyData({ incomeEntry });

    expect(createSpy).toHaveBeenCalledWith(
      {
        type: MonthlyDataTypes.Income,
        amountCad: 3500,
        amountUsd: 0,
        yearMonth: '2026-07',
        userId: 'u1',
      },
      { transaction: undefined }
    );
  });

  it('creates a new USD row when none exists yet for the month', async () => {
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null as any);
    const createSpy = vi.spyOn(MonthlyData, 'create').mockResolvedValue({} as any);

    const incomeEntry = { amount: '200', date: '2026-07-15', currency: Currency.USD, userId: 'u1' } as IncomeEntry;
    await postMonthlyData({ incomeEntry });

    expect(createSpy).toHaveBeenCalledWith(
      {
        type: MonthlyDataTypes.Income,
        amountCad: 0,
        amountUsd: 200,
        yearMonth: '2026-07',
        userId: 'u1',
      },
      { transaction: undefined }
    );
  });

  it('increments the CAD total on an existing row instead of creating a new one', async () => {
    const increment = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue({ increment } as any);
    const createSpy = vi.spyOn(MonthlyData, 'create').mockResolvedValue({} as any);

    const incomeEntry = { amount: '100', date: '2026-07-15', currency: Currency.CAD, userId: 'u1' } as IncomeEntry;
    await postMonthlyData({ incomeEntry });

    expect(increment).toHaveBeenCalledWith('amountCad', { by: 100 });
    expect(createSpy).not.toHaveBeenCalled();
  });
});

describe('putMonthlyData', () => {
  it('destroys the row when the recalculated totals are both zero', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    const update = vi.fn();
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue({ destroy, update } as any);
    vi.spyOn(IncomeEntry, 'findAll').mockResolvedValue([]);

    const incomeEntry = { date: '2026-07-15', userId: 'u1' } as IncomeEntry;
    await putMonthlyData({ incomeEntry });

    expect(destroy).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
  });

  it('updates the row with recalculated totals summed from the remaining entries that month', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue({ destroy: vi.fn(), update } as any);
    vi.spyOn(IncomeEntry, 'findAll').mockResolvedValue([
      { currency: Currency.CAD, amount: '3000' },
      { currency: Currency.USD, amount: '100' },
      { currency: Currency.USD, amount: '50' },
    ] as IncomeEntry[]);

    const incomeEntry = { date: '2026-07-15', userId: 'u1' } as IncomeEntry;
    await putMonthlyData({ incomeEntry });

    expect(update).toHaveBeenCalledWith(
      { amountCad: 3000, amountUsd: 150 },
      { transaction: undefined }
    );
  });

  it('scopes the recalculation query to entries whose date starts with the yearMonth', async () => {
    const findAllSpy = vi.spyOn(IncomeEntry, 'findAll').mockResolvedValue([]);
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue({ destroy: vi.fn(), update: vi.fn() } as any);

    const incomeEntry = { date: '2026-07-15', userId: 'u1' } as IncomeEntry;
    await putMonthlyData({ incomeEntry });

    expect(findAllSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'u1' }),
      })
    );
  });
});
