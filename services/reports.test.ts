import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import router from './reports.js';
import * as monthlyTotals from '../utils/monthlyTotals.js';

const handler = (() => {
  const layer = (router.stack as any[]).find(
    (l) => l.route?.path === '/yearly-comparison' && l.route?.methods?.get,
  );
  return layer.route.stack[0].handle as (req: Request, res: Response) => Promise<void>;
})();

const mockRes = () => {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /reports/yearly-comparison', () => {
  it("sums only the requesting user's expenses and returns the comparison", async () => {
    const spy = vi
      .spyOn(monthlyTotals, 'getMonthlyTotals')
      .mockResolvedValue([
        {
          id: 'expense-2026-01',
          type: 'expense',
          yearMonth: '2026-01',
          amountCad: '100.00',
          amountUsd: '0.00',
        },
      ]);
    const res = mockRes();

    await handler({ query: {}, userId: 'u1' } as unknown as Request, res);

    expect(spy).toHaveBeenCalledWith('u1', { type: 'expense' });
    const body = vi.mocked(res.json).mock.calls[0][0] as any;
    expect(body.rows[0]).toMatchObject({ year: 2026, amountCad: 100, cutoffMonth: null });
  });

  it('passes parsed cutoffs through, including "none"', async () => {
    vi.spyOn(monthlyTotals, 'getMonthlyTotals').mockResolvedValue([
      { id: 'a', type: 'expense', yearMonth: '2025-01', amountCad: '10.00', amountUsd: '0.00' },
      { id: 'b', type: 'expense', yearMonth: '2026-01', amountCad: '10.00', amountUsd: '0.00' },
      { id: 'c', type: 'expense', yearMonth: '2026-02', amountCad: '10.00', amountUsd: '0.00' },
    ]);
    const res = mockRes();

    await handler(
      { query: { mode: 'ytd', cutoffs: '2025:none,2026:1' }, userId: null } as unknown as Request,
      res,
    );

    const body = vi.mocked(res.json).mock.calls[0][0] as any;
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({ year: 2026, cutoffMonth: 1, monthsCount: 1 });
  });

  it.each([
    { mode: 'weekly' },
    { baseCurrency: 'EUR' },
    { cutoffs: '2026' },
    { cutoffs: '2026:13' },
    { cutoffs: ['2026:3'] },
  ])('rejects invalid query %j with 400 and runs no query', async (query) => {
    const spy = vi.spyOn(monthlyTotals, 'getMonthlyTotals');
    const res = mockRes();

    await handler({ query, userId: 'u1' } as unknown as Request, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(spy).not.toHaveBeenCalled();
  });
});
