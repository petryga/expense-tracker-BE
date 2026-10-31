import { describe, expect, it, vi, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import router from './incomeEntries.js';
import { Currency, IncomeEntry } from '../models/IncomeEntry.js';

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DELETE /:id', () => {
  const handler = getHandler('delete', '/:id');

  it('deletes the entry and responds 204', async () => {
    const incomeEntry = {
      id: 'e1',
      userId: 'u1',
      destroy: vi.fn().mockResolvedValue(undefined),
    } as unknown as IncomeEntry;
    vi.spyOn(IncomeEntry, 'findOne').mockResolvedValue(incomeEntry);
    const res = mockRes();

    await handler({ params: { id: 'e1' }, userId: 'u1' } as unknown as Request, res);

    expect(incomeEntry.destroy).toHaveBeenCalledOnce();
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('only looks up entries owned by the requesting user', async () => {
    const findOne = vi.spyOn(IncomeEntry, 'findOne').mockResolvedValue(null);
    const res = mockRes();

    await handler({ params: { id: 'e1' }, userId: 'u1' } as unknown as Request, res);

    expect(findOne).toHaveBeenCalledWith({ where: { id: 'e1', userId: 'u1' } });
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('PUT /:id', () => {
  const handler = getHandler('put', '/:id');

  it('does not mass-assign unexpected fields on update (e.g. a forged userId or createdAt)', async () => {
    const update = vi
      .fn()
      .mockImplementation(async (data: any) => ({ ...data, date: '2026-07-15' }));
    const incomeEntry = { id: 'e1', userId: 'u1', update } as unknown as IncomeEntry;
    vi.spyOn(IncomeEntry, 'findOne').mockResolvedValue(incomeEntry);

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

    await handler(req, mockRes());

    const updated = update.mock.calls[0][0] as Record<string, unknown>;
    expect(updated.userId).toBe('u1');
    expect(updated).not.toHaveProperty('createdAt');
  });

  it('rejects an invalid date with a 400 and leaves the entry untouched', async () => {
    const update = vi.fn();
    vi.spyOn(IncomeEntry, 'findOne').mockResolvedValue({ id: 'e1', update } as any);
    const res = mockRes();

    await handler(
      {
        params: { id: 'e1' },
        userId: 'u1',
        body: { date: 'soon', description: 'x', category: 'cash', amount: '1' },
      } as unknown as Request,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('POST /', () => {
  const handler = getHandler('post', '/');

  it('rejects an invalid date with a 400 and writes nothing', async () => {
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

  it('creates a valid entry owned by the requesting user', async () => {
    const create = vi.spyOn(IncomeEntry, 'create').mockImplementation(async (d: any) => d);
    const res = mockRes();

    await handler(
      {
        body: {
          date: '2026-10-31',
          description: 'x',
          category: 'cash',
          amount: '1',
          currency: 'USD',
        },
        userId: 'u1',
      } as Request,
      res,
    );

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }));
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
