import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import router from './incomeEntries.js';
import { Currency, IncomeEntry } from '../models/IncomeEntry.js';
import { MonthlyData } from '../models/MonthlyData.js';
import { sequelize } from '../config/database.js';

// Express stores each router.<method>(path, handler) registration as a Layer
// with a nested route.stack; pulling the raw handler out lets us exercise it
// directly without spinning up an HTTP server.
const getHandler = (method: 'get' | 'post' | 'put' | 'delete', path: string) => {
  const layer = (router.stack as any[]).find(
    (candidate) => candidate.route?.path === path && candidate.route?.methods?.[method],
  );
  if (!layer) throw new Error(`No ${method.toUpperCase()} ${path} route registered`);
  return layer.route.stack[0].handle as (req: Request, res: Response) => Promise<void>;
};

const mockRes = () => {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  return res as Response;
};

describe('DELETE /:id', () => {
  const handler = getHandler('delete', '/:id');

  beforeEach(() => {
    vi.spyOn(sequelize, 'transaction').mockImplementation(((fn: any) => fn({} as any)) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('removes the entry before recalculating the monthly total, so the deleted amount is excluded', async () => {
    // A tiny stateful mock stands in for the DB: findAll only "sees" the
    // entry until destroy() has actually run. Regression: the old handler
    // called putMonthlyData (which reads via findAll) before destroy(), so
    // the deleted entry's amount was still counted in the recalculated total.
    let deleted = false;
    const incomeEntry = {
      id: 'e1',
      userId: 'u1',
      date: '2026-07-15',
      currency: Currency.CAD,
      amount: '100',
      destroy: vi.fn().mockImplementation(async () => {
        deleted = true;
      }),
    } as unknown as IncomeEntry;

    vi.spyOn(IncomeEntry, 'findOne').mockResolvedValue(incomeEntry);
    vi.spyOn(IncomeEntry, 'findAll').mockImplementation(async () => (deleted ? [] : [incomeEntry]));

    const monthlyDataDestroy = vi.fn().mockResolvedValue(undefined);
    const monthlyDataUpdate = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue({
      destroy: monthlyDataDestroy,
      update: monthlyDataUpdate,
    } as any);

    const req = { params: { id: 'e1' }, userId: 'u1' } as unknown as Request;
    const res = mockRes();

    await handler(req, res);

    // Totals recalculate to zero only if the entry was already gone by the
    // time putMonthlyData ran, which is what drives the row to be destroyed
    // instead of updated with the stale (pre-deletion) amount.
    expect(monthlyDataDestroy).toHaveBeenCalledOnce();
    expect(monthlyDataUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('runs the delete before the recalculation query, regardless of totals', async () => {
    const incomeEntry = {
      id: 'e1',
      userId: 'u1',
      date: '2026-07-15',
      currency: Currency.CAD,
      amount: '100',
      destroy: vi.fn().mockResolvedValue(undefined),
    } as unknown as IncomeEntry;

    vi.spyOn(IncomeEntry, 'findOne').mockResolvedValue(incomeEntry);
    const findAllSpy = vi.spyOn(IncomeEntry, 'findAll').mockResolvedValue([]);
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue({
      destroy: vi.fn(),
      update: vi.fn(),
    } as any);

    const req = { params: { id: 'e1' }, userId: 'u1' } as unknown as Request;
    const res = mockRes();

    await handler(req, res);

    const destroyOrder = vi.mocked(incomeEntry.destroy).mock.invocationCallOrder[0];
    const findAllOrder = findAllSpy.mock.invocationCallOrder[0];
    expect(destroyOrder).toBeLessThan(findAllOrder);
  });
});

describe('PUT /:id', () => {
  const handler = getHandler('put', '/:id');

  beforeEach(() => {
    vi.spyOn(sequelize, 'transaction').mockImplementation(((fn: any) => fn({} as any)) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not mass-assign unexpected fields on update (e.g. a forged userId or createdAt)', async () => {
    const update = vi
      .fn()
      .mockImplementation(async (data: any) => ({ ...data, date: '2026-07-15' }));
    const incomeEntry = { id: 'e1', userId: 'u1', update } as unknown as IncomeEntry;

    vi.spyOn(IncomeEntry, 'findOne').mockResolvedValue(incomeEntry);
    vi.spyOn(IncomeEntry, 'findAll').mockResolvedValue([]);
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null);
    vi.spyOn(MonthlyData, 'create').mockResolvedValue({} as any);

    const req = {
      params: { id: 'e1' },
      userId: 'u1',
      body: {
        date: '2026-07-15',
        description: 'Salary',
        category: 'bankAccounts',
        amount: '3500',
        currency: Currency.CAD,
        userId: 'someone-elses-id',
        createdAt: '1999-01-01T00:00:00.000Z',
      },
    } as unknown as Request;
    const res = mockRes();

    await handler(req, res);

    const updated = update.mock.calls[0][0] as Record<string, unknown>;
    expect(updated.userId).toBe('u1');
    expect(updated).not.toHaveProperty('createdAt');
  });
});

describe('POST /', () => {
  const handler = getHandler('post', '/');

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects an invalid date with a 400 and writes nothing', async () => {
    vi.spyOn(sequelize, 'transaction').mockImplementation(((fn: any) => fn({} as any)) as any);
    const create = vi.spyOn(IncomeEntry, 'create');
    const bulkCreate = vi.spyOn(IncomeEntry, 'bulkCreate');
    const base = { description: 'x', category: 'cash', amount: '1', currency: Currency.USD };
    const res = mockRes();

    await handler({ body: { ...base, date: '2026/10/31' }, userId: 'u1' } as Request, res);
    await handler(
      {
        body: [
          { ...base, date: '2026-10-31' },
          { ...base, date: 'soon' },
        ],
        userId: 'u1',
      } as Request,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(create).not.toHaveBeenCalled();
    expect(bulkCreate).not.toHaveBeenCalled();
  });
});

describe('PUT /:id', () => {
  const handler = getHandler('put', '/:id');

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('recomputes the month the entry left as well as the one it moved to', async () => {
    vi.spyOn(sequelize, 'transaction').mockImplementation(((fn: any) => fn({} as any)) as any);
    const entry: any = { id: 'e1', userId: 'u1', date: '2026-07-15', currency: Currency.USD };
    entry.update = vi.fn().mockImplementation(async (data: any) => Object.assign(entry, data));
    vi.spyOn(IncomeEntry, 'findOne').mockResolvedValue(entry);
    const findAll = vi.spyOn(IncomeEntry, 'findAll').mockResolvedValue([]);
    vi.spyOn(MonthlyData, 'findOne').mockResolvedValue(null as any);

    await handler(
      {
        params: { id: 'e1' },
        body: {
          date: '2026-08-02',
          description: 'x',
          category: 'cash',
          amount: '1',
          currency: 'USD',
        },
        userId: 'u1',
      } as any,
      mockRes(),
    );

    const prefixes = findAll.mock.calls.map(([options]) => {
      const dateFilter = (options as any).where.date;
      return dateFilter[Object.getOwnPropertySymbols(dateFilter)[0]];
    });
    expect(prefixes).toEqual(['2026-08', '2026-07']);
  });
});
