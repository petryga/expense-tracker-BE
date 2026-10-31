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

describe('GET /', () => {
  it('returns the computed totals for the requesting user', async () => {
    const data = [{ id: 'expense-2026-07' }] as any;
    const spy = vi.spyOn(totals, 'getMonthlyTotals').mockResolvedValue(data);
    const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

    await handler({ userId: 'u1' } as unknown as Request, res);

    expect(spy).toHaveBeenCalledWith('u1');
    expect(res.json).toHaveBeenCalledWith(data);
  });

  it('responds 500 instead of crashing when the query fails', async () => {
    vi.spyOn(totals, 'getMonthlyTotals').mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const json = vi.fn();
    const res = { json, status: vi.fn().mockReturnValue({ json }) } as unknown as Response;

    await handler({ userId: 'u1' } as unknown as Request, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
