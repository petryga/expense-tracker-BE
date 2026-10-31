import { describe, expect, it, vi, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import router from './monthlyData.js';
import * as totals from '../utils/monthlyTotals.js';

afterEach(() => {
  vi.restoreAllMocks();
});

const handler = (router.stack as any[]).find(
  (layer) => layer.route?.path === '/' && layer.route?.methods?.get,
).route.stack[0].handle as (req: Request, res: Response) => Promise<void>;

const mockRes = () => {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
};

const req = (query: Record<string, unknown> = {}) =>
  ({ userId: 'u1', query }) as unknown as Request;

describe('GET /', () => {
  it('returns the computed totals for the requesting user', async () => {
    const data = [{ id: 'expense-2026-07' }] as any;
    const spy = vi.spyOn(totals, 'getMonthlyTotals').mockResolvedValue(data);
    const res = mockRes();

    await handler(req(), res);

    expect(spy).toHaveBeenCalledWith('u1', {});
    expect(res.json).toHaveBeenCalledWith(data);
  });

  it('passes valid type, category and currency filters through', async () => {
    const spy = vi.spyOn(totals, 'getMonthlyTotals').mockResolvedValue([]);

    await handler(req({ type: 'income', category: 'bankAccounts', currency: 'USD' }), mockRes());

    expect(spy).toHaveBeenCalledWith('u1', {
      type: 'income',
      category: 'bankAccounts',
      currency: 'USD',
    });
  });

  it.each([
    ['unknown type', { type: 'wealth' }],
    ['unknown currency', { currency: 'EUR' }],
    ['lowercase currency', { currency: 'usd' }],
    ['empty category', { category: '  ' }],
    ['repeated category', { category: ['a', 'b'] }],
    ['overlong category', { category: 'x'.repeat(101) }],
  ])('rejects %s with a 400 instead of returning unfiltered totals', async (_label, query) => {
    const spy = vi.spyOn(totals, 'getMonthlyTotals');
    const res = mockRes();

    await handler(req(query), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('responds 500 instead of crashing when the query fails', async () => {
    vi.spyOn(totals, 'getMonthlyTotals').mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();

    await handler(req(), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
