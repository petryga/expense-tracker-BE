import { describe, expect, it, vi, afterEach } from 'vitest';
import { UniqueConstraintError } from 'sequelize';
import { MonthlyData, MonthlyDataTypes } from './MonthlyData.js';
import { sequelize } from '../config/database.js';

const where = { yearMonth: '2026-7', type: MonthlyDataTypes.Expense, userId: null };
const defaults = { amountCad: 0, amountUsd: 5 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MonthlyData.findOrCreateRow', () => {
  const stubSavepoint = () =>
    vi
      .spyOn(sequelize, 'transaction')
      .mockImplementation(((_options: any, fn: any) => fn({ savepoint: true })) as any);

  it('returns the existing row without inserting', async () => {
    const row = { id: 'r1' } as any;
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(row);
    const create = vi.spyOn(MonthlyData, 'create');

    await expect(MonthlyData.findOrCreateRow({ where, defaults })).resolves.toEqual([row, false]);
    expect(create).not.toHaveBeenCalled();
  });

  it('creates the row (inside a savepoint on the caller transaction) when none exists', async () => {
    const outer = { outer: true } as any;
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null);
    const savepoint = stubSavepoint();
    const created = { id: 'new' } as any;
    const create = vi.spyOn(MonthlyData, 'create').mockResolvedValue(created);

    const result = await MonthlyData.findOrCreateRow({ where, defaults, transaction: outer });

    expect(result).toEqual([created, true]);
    expect(savepoint).toHaveBeenCalledWith({ transaction: outer }, expect.any(Function));
    expect(create).toHaveBeenCalledWith(
      { ...where, ...defaults },
      { transaction: { savepoint: true } },
    );
  });

  it('hands back the winning row when the insert loses a race on the unique index', async () => {
    const winner = { id: 'winner' } as any;
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    stubSavepoint();
    vi.spyOn(MonthlyData, 'create').mockRejectedValue(new UniqueConstraintError({}));

    await expect(MonthlyData.findOrCreateRow({ where, defaults })).resolves.toEqual([
      winner,
      false,
    ]);
  });

  it('works when userId is null (no-auth mode) instead of crashing in the conflict path', async () => {
    const winner = { id: 'winner' } as any;
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    stubSavepoint();
    // Sequelize's own findOrCreate throws a TypeError here: err.fields.user_id is null.
    vi.spyOn(MonthlyData, 'create').mockRejectedValue(
      new UniqueConstraintError({
        fields: { user_id: null, type: 'expense', year_month: '2026-7' },
      }),
    );

    await expect(MonthlyData.findOrCreateRow({ where, defaults })).resolves.toEqual([
      winner,
      false,
    ]);
  });

  it('rethrows non-unique errors', async () => {
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null);
    stubSavepoint();
    vi.spyOn(MonthlyData, 'create').mockRejectedValue(new Error('connection lost'));

    await expect(MonthlyData.findOrCreateRow({ where, defaults })).rejects.toThrow(
      'connection lost',
    );
  });

  it('rethrows the unique error if the conflicting row cannot be found afterwards', async () => {
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null);
    stubSavepoint();
    vi.spyOn(MonthlyData, 'create').mockRejectedValue(new UniqueConstraintError({}));

    await expect(MonthlyData.findOrCreateRow({ where, defaults })).rejects.toBeInstanceOf(
      UniqueConstraintError,
    );
  });
});
