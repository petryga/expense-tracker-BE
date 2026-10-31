import { describe, expect, it, vi, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import router from './expenses.js';
import { Currency, Expense } from '../models/Expense.js';

// Pulls the raw handler out of the router so it can be exercised without an
// HTTP server (same approach as incomeEntries.test.ts).
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

const body = {
  category: 'Groceries',
  amount: '10',
  account: 'Amex',
  description: 'x',
  datePosted: '2026-08-02',
  id: 'e1',
  currency: Currency.USD,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /', () => {
  const handler = getHandler('post', '/');

  it('rejects an invalid datePosted with a 400 and writes nothing', async () => {
    const create = vi.spyOn(Expense, 'create');
    const bulkCreate = vi.spyOn(Expense, 'bulkCreate');
    const res = mockRes();

    await handler({ body: { ...body, datePosted: 'garbage' }, userId: 'u1' } as Request, res);
    await handler({ body: [body, { ...body, datePosted: '' }], userId: 'u1' } as Request, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(create).not.toHaveBeenCalled();
    expect(bulkCreate).not.toHaveBeenCalled();
  });
});

describe('PUT /:id', () => {
  const handler = getHandler('put', '/:id');

  const stubExpense = (year: number, month: number) => {
    const expense: any = { id: 'e1', userId: 'u1', year, month };
    expense.update = vi.fn().mockImplementation(async (data: any) => {
      Object.assign(expense, data);
      return expense;
    });
    vi.spyOn(Expense, 'findOne').mockResolvedValue(expense);
    return expense;
  };

  it('rejects an invalid datePosted with a 400 and leaves the expense untouched', async () => {
    const expense = stubExpense(2026, 7);
    const res = mockRes();

    await handler(
      { params: { id: 'e1' }, body: { ...body, datePosted: undefined }, userId: 'u1' } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(expense.update).not.toHaveBeenCalled();
  });

  it('updates the expense when the date is valid, including a move to another month', async () => {
    const expense = stubExpense(2026, 7);
    const res = mockRes();

    await handler(
      { params: { id: 'e1' }, body: { ...body, datePosted: '2026-08-02' }, userId: 'u1' } as any,
      res,
    );

    expect(expense.update).toHaveBeenCalledWith(
      expect.objectContaining({ year: 2026, month: 8, userId: 'u1' }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
