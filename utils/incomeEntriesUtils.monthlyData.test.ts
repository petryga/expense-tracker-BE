import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  postMonthlyData,
  putMonthlyData,
  syncMonthlyDataAfterUpdate,
} from './incomeEntriesUtils.js';
import { MonthlyData, MonthlyDataTypes } from '../models/MonthlyData.js';
import { Currency, IncomeEntry } from '../models/IncomeEntry.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('postMonthlyData', () => {
  it('creates a new CAD row when none exists yet for the month', async () => {
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null as any);
    const findOrCreateRow = vi
      .spyOn(MonthlyData, 'findOrCreateRow')
      .mockResolvedValue([{ increment: vi.fn() }, true] as any);

    const incomeEntry = {
      amount: '3500',
      date: '2026-07-15',
      currency: Currency.CAD,
      userId: 'u1',
    } as IncomeEntry;
    await postMonthlyData({ incomeEntry });

    expect(findOrCreateRow).toHaveBeenCalledWith({
      where: { yearMonth: '2026-07', type: MonthlyDataTypes.Income, userId: 'u1' },
      defaults: { amountCad: 3500, amountUsd: 0 },
      transaction: undefined,
    });
  });

  it('creates a new USD row when none exists yet for the month', async () => {
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null as any);
    const findOrCreateRow = vi
      .spyOn(MonthlyData, 'findOrCreateRow')
      .mockResolvedValue([{ increment: vi.fn() }, true] as any);

    const incomeEntry = {
      amount: '200',
      date: '2026-07-15',
      currency: Currency.USD,
      userId: 'u1',
    } as IncomeEntry;
    await postMonthlyData({ incomeEntry });

    expect(findOrCreateRow).toHaveBeenCalledWith({
      where: { yearMonth: '2026-07', type: MonthlyDataTypes.Income, userId: 'u1' },
      defaults: { amountCad: 0, amountUsd: 200 },
      transaction: undefined,
    });
  });

  it('increments the CAD total on an existing row instead of creating a new one', async () => {
    const increment = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue({ increment } as any);
    const createSpy = vi.spyOn(MonthlyData, 'create').mockResolvedValue({} as any);

    const incomeEntry = {
      amount: '100',
      date: '2026-07-15',
      currency: Currency.CAD,
      userId: 'u1',
    } as IncomeEntry;
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
      { transaction: undefined },
    );
  });

  it('scopes the recalculation query to entries whose date starts with the yearMonth', async () => {
    const findAllSpy = vi.spyOn(IncomeEntry, 'findAll').mockResolvedValue([]);
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue({
      destroy: vi.fn(),
      update: vi.fn(),
    } as any);

    const incomeEntry = { date: '2026-07-15', userId: 'u1' } as IncomeEntry;
    await putMonthlyData({ incomeEntry });

    expect(findAllSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'u1' }),
      }),
    );
  });
});

describe('syncMonthlyDataAfterUpdate', () => {
  const stub = () => {
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null as any);
    vi.spyOn(MonthlyData, 'create').mockResolvedValue({} as any);
    return vi.spyOn(IncomeEntry, 'findAll').mockResolvedValue([]);
  };
  const prefixOf = (call: unknown[]) => {
    const dateFilter = (call[0] as any).where.date;
    return dateFilter[Object.getOwnPropertySymbols(dateFilter)[0]];
  };

  it('recomputes both the old and the new month when the date moves months', async () => {
    const findAll = stub();

    await syncMonthlyDataAfterUpdate({
      previousDate: '2026-07-15',
      incomeEntry: { date: '2026-08-02', userId: 'u1' } as IncomeEntry,
    });

    expect(findAll.mock.calls.map(prefixOf)).toEqual(['2026-08', '2026-07']);
  });

  it('recomputes once when only the day changes within a month', async () => {
    const findAll = stub();

    await syncMonthlyDataAfterUpdate({
      previousDate: '2026-07-01',
      incomeEntry: { date: '2026-07-20', userId: 'u1' } as IncomeEntry,
    });

    expect(findAll).toHaveBeenCalledTimes(1);
  });

  it('treats the same month in a different year as a move', async () => {
    const findAll = stub();

    await syncMonthlyDataAfterUpdate({
      previousDate: '2025-07-15',
      incomeEntry: { date: '2026-07-15', userId: 'u1' } as IncomeEntry,
    });

    expect(findAll).toHaveBeenCalledTimes(2);
  });
});

describe('incomeEntry rollup hardening', () => {
  it('rounds recalculated totals to cents instead of storing float noise', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue({ destroy: vi.fn(), update } as any);
    vi.spyOn(IncomeEntry, 'findAll').mockResolvedValue([
      { currency: Currency.CAD, amount: '0.1' },
      { currency: Currency.CAD, amount: '0.2' },
      { currency: Currency.USD, amount: '60.73' },
      { currency: Currency.USD, amount: '0.01' },
    ] as IncomeEntry[]);

    await putMonthlyData({ incomeEntry: { date: '2026-07-15', userId: 'u1' } as IncomeEntry });

    // 0.1 + 0.2 === 0.30000000000000004 in floating point.
    expect(update).toHaveBeenCalledWith(
      { amountCad: 0.3, amountUsd: 60.74 },
      { transaction: undefined },
    );
  });

  it('does not create an empty row when there is no row and nothing to record', async () => {
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null as any);
    vi.spyOn(IncomeEntry, 'findAll').mockResolvedValue([]);
    const findOrCreateRow = vi.spyOn(MonthlyData, 'findOrCreateRow');

    await putMonthlyData({ incomeEntry: { date: '2026-07-15', userId: 'u1' } as IncomeEntry });

    expect(findOrCreateRow).not.toHaveBeenCalled();
  });

  it('adds to the winning row when a concurrent request created the month first (post)', async () => {
    // findOne saw nothing, but by the time findOrCreateRow ran another request had
    // inserted the row: created === false. The amount must still be counted.
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null as any);
    const increment = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(MonthlyData, 'findOrCreateRow').mockResolvedValue([{ increment }, false] as any);

    await postMonthlyData({
      incomeEntry: {
        amount: '25',
        date: '2026-07-15',
        currency: Currency.CAD,
        userId: 'u1',
      } as IncomeEntry,
    });

    expect(increment).toHaveBeenCalledWith('amountCad', { by: 25, transaction: undefined });
  });

  it('does not double count when findOrCreateRow created the row with the amount already in it', async () => {
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null as any);
    const increment = vi.fn();
    vi.spyOn(MonthlyData, 'findOrCreateRow').mockResolvedValue([{ increment }, true] as any);

    await postMonthlyData({
      incomeEntry: {
        amount: '25',
        date: '2026-07-15',
        currency: Currency.CAD,
        userId: 'u1',
      } as IncomeEntry,
    });

    expect(increment).not.toHaveBeenCalled();
  });

  it('updates the winning row when a concurrent request created the month first (put)', async () => {
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null as any);
    vi.spyOn(IncomeEntry, 'findAll').mockResolvedValue([
      { currency: Currency.CAD, amount: '40' },
    ] as IncomeEntry[]);
    const update = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(MonthlyData, 'findOrCreateRow').mockResolvedValue([{ update }, false] as any);

    await putMonthlyData({ incomeEntry: { date: '2026-07-15', userId: 'u1' } as IncomeEntry });

    expect(update).toHaveBeenCalledWith(
      { amountCad: 40, amountUsd: 0 },
      { transaction: undefined },
    );
  });
});
