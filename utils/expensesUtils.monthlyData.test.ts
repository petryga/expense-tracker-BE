import { describe, expect, it, vi, afterEach } from 'vitest';
import { postMonthlyData, putMonthlyData, syncMonthlyDataAfterUpdate } from './expensesUtils.js';
import { MonthlyData, MonthlyDataTypes } from '../models/MonthlyData.js';
import { Currency, Expense } from '../models/Expense.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('postMonthlyData', () => {
  it('creates a new CAD row when none exists yet for the month', async () => {
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null as any);
    const findOrCreateRow = vi
      .spyOn(MonthlyData, 'findOrCreateRow')
      .mockResolvedValue([{ increment: vi.fn() }, true] as any);

    const expense = {
      amount: '100.50',
      year: 2026,
      month: 7,
      currency: Currency.CAD,
      userId: 'u1',
    } as Expense;
    await postMonthlyData({ expense });

    expect(findOrCreateRow).toHaveBeenCalledWith({
      where: { yearMonth: '2026-7', type: MonthlyDataTypes.Expense, userId: 'u1' },
      defaults: { amountCad: 100.5, amountUsd: 0 },
      transaction: undefined,
    });
  });

  it('creates a new USD row when none exists yet for the month', async () => {
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null as any);
    const findOrCreateRow = vi
      .spyOn(MonthlyData, 'findOrCreateRow')
      .mockResolvedValue([{ increment: vi.fn() }, true] as any);

    const expense = {
      amount: '50',
      year: 2026,
      month: 7,
      currency: Currency.USD,
      userId: 'u1',
    } as Expense;
    await postMonthlyData({ expense });

    expect(findOrCreateRow).toHaveBeenCalledWith({
      where: { yearMonth: '2026-7', type: MonthlyDataTypes.Expense, userId: 'u1' },
      defaults: { amountCad: 0, amountUsd: 50 },
      transaction: undefined,
    });
  });

  it('increments the CAD total on an existing row instead of creating a new one', async () => {
    const increment = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue({ increment } as any);
    const createSpy = vi.spyOn(MonthlyData, 'create').mockResolvedValue({} as any);

    const expense = {
      amount: '25',
      year: 2026,
      month: 7,
      currency: Currency.CAD,
      userId: 'u1',
    } as Expense;
    await postMonthlyData({ expense });

    expect(increment).toHaveBeenCalledWith('amountCad', { by: 25 });
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('increments the USD total on an existing row', async () => {
    const increment = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue({ increment } as any);

    const expense = {
      amount: '25',
      year: 2026,
      month: 7,
      currency: Currency.USD,
      userId: 'u1',
    } as Expense;
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

    expect(update).toHaveBeenCalledWith(
      { amountCad: 150, amountUsd: 20 },
      { transaction: undefined },
    );
    expect(destroy).not.toHaveBeenCalled();
  });

  it('creates a new row when none exists and the remaining expenses are non-zero', async () => {
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null as any);
    const findOrCreateRow = vi
      .spyOn(MonthlyData, 'findOrCreateRow')
      .mockResolvedValue([{}, true] as any);
    vi.spyOn(Expense, 'findAll').mockResolvedValue([
      { currency: Currency.USD, amount: '30' },
    ] as Expense[]);

    const expense = { year: 2026, month: 7, userId: 'u1' } as Expense;
    await putMonthlyData({ expense });

    expect(findOrCreateRow).toHaveBeenCalledWith({
      where: { yearMonth: '2026-7', type: MonthlyDataTypes.Expense, userId: 'u1' },
      defaults: { amountCad: 0, amountUsd: 30 },
      transaction: undefined,
    });
  });
});

describe('syncMonthlyDataAfterUpdate', () => {
  const setup = () => {
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null as any);
    vi.spyOn(Expense, 'findAll').mockResolvedValue([] as any);
    return vi.spyOn(MonthlyData, 'create').mockResolvedValue({} as any);
  };

  it('recomputes both the old and the new month when the date moves months', async () => {
    const findAll = vi.spyOn(Expense, 'findAll').mockResolvedValue([] as any);
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null as any);
    vi.spyOn(MonthlyData, 'create').mockResolvedValue({} as any);

    await syncMonthlyDataAfterUpdate({
      previous: { year: 2026, month: 7, userId: 'u1' },
      expense: { year: 2026, month: 8, userId: 'u1' },
    });

    const months = findAll.mock.calls.map(([options]) => (options as any).where.month);
    expect(months).toEqual([8, 7]);
  });

  it('recomputes only once when the month is unchanged', async () => {
    setup();
    const findAll = vi.spyOn(Expense, 'findAll');

    await syncMonthlyDataAfterUpdate({
      previous: { year: 2026, month: 7, userId: 'u1' },
      expense: { year: 2026, month: 7, userId: 'u1' },
    });

    expect(findAll).toHaveBeenCalledTimes(1);
  });

  it('treats the same month in a different year as a move', async () => {
    setup();
    const findAll = vi.spyOn(Expense, 'findAll');

    await syncMonthlyDataAfterUpdate({
      previous: { year: 2025, month: 7, userId: 'u1' },
      expense: { year: 2026, month: 7, userId: 'u1' },
    });

    expect(findAll).toHaveBeenCalledTimes(2);
  });
});

describe('expense rollup hardening', () => {
  it('rounds recalculated totals to cents instead of storing float noise', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue({ destroy: vi.fn(), update } as any);
    vi.spyOn(Expense, 'findAll').mockResolvedValue([
      { currency: Currency.CAD, amount: '0.1' },
      { currency: Currency.CAD, amount: '0.2' },
      { currency: Currency.USD, amount: '60.73' },
      { currency: Currency.USD, amount: '0.01' },
    ] as Expense[]);

    await putMonthlyData({ expense: { year: 2026, month: 7, userId: 'u1' } as Expense });

    // 0.1 + 0.2 === 0.30000000000000004 in floating point.
    expect(update).toHaveBeenCalledWith(
      { amountCad: 0.3, amountUsd: 60.74 },
      { transaction: undefined },
    );
  });

  it('does not create an empty row when there is no row and nothing to record', async () => {
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null as any);
    vi.spyOn(Expense, 'findAll').mockResolvedValue([]);
    const findOrCreateRow = vi.spyOn(MonthlyData, 'findOrCreateRow');

    await putMonthlyData({ expense: { year: 2026, month: 7, userId: 'u1' } as Expense });

    expect(findOrCreateRow).not.toHaveBeenCalled();
  });

  it('adds to the winning row when a concurrent request created the month first (post)', async () => {
    // findOne saw nothing, but by the time findOrCreateRow ran another request had
    // inserted the row: created === false. The amount must still be counted.
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null as any);
    const increment = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(MonthlyData, 'findOrCreateRow').mockResolvedValue([{ increment }, false] as any);

    await postMonthlyData({
      expense: {
        amount: '25',
        year: 2026,
        month: 7,
        currency: Currency.CAD,
        userId: 'u1',
      } as Expense,
    });

    expect(increment).toHaveBeenCalledWith('amountCad', { by: 25, transaction: undefined });
  });

  it('does not double count when findOrCreateRow created the row with the amount already in it', async () => {
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null as any);
    const increment = vi.fn();
    vi.spyOn(MonthlyData, 'findOrCreateRow').mockResolvedValue([{ increment }, true] as any);

    await postMonthlyData({
      expense: {
        amount: '25',
        year: 2026,
        month: 7,
        currency: Currency.CAD,
        userId: 'u1',
      } as Expense,
    });

    expect(increment).not.toHaveBeenCalled();
  });

  it('updates the winning row when a concurrent request created the month first (put)', async () => {
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null as any);
    vi.spyOn(Expense, 'findAll').mockResolvedValue([
      { currency: Currency.CAD, amount: '40' },
    ] as Expense[]);
    const update = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(MonthlyData, 'findOrCreateRow').mockResolvedValue([{ update }, false] as any);

    await putMonthlyData({ expense: { year: 2026, month: 7, userId: 'u1' } as Expense });

    expect(update).toHaveBeenCalledWith(
      { amountCad: 40, amountUsd: 0 },
      { transaction: undefined },
    );
  });
});
