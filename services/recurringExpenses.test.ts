import { describe, expect, it, vi, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import router from './recurringExpenses.js';
import { RecurringExpense } from '../models/RecurringExpense.js';

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

describe('POST /', () => {
  const handler = getHandler('post', '/');

  it('creates a recurring expense scoped to the requesting user, passing through the client-generated id', async () => {
    const createSpy = vi
      .spyOn(RecurringExpense, 'create')
      .mockImplementation(async (data: any) => data as any);

    const req = {
      userId: 'u1',
      body: {
        id: 'client-uuid-1',
        category: 'Subscriptions',
        amount: 15.99,
        account: 'Acme Credit Card',
        description: 'Streaming',
        dayOfMonth: 12,
        currency: 'USD',
      },
    } as unknown as Request;
    const res = mockRes();

    await handler(req, res);

    expect(createSpy).toHaveBeenCalledWith({
      id: 'client-uuid-1',
      category: 'Subscriptions',
      amount: 15.99,
      account: 'Acme Credit Card',
      description: 'Streaming',
      dayOfMonth: 12,
      currency: 'USD',
      userId: 'u1',
    });
  });

  it('does not mass-assign unexpected fields (e.g. a forged userId or createdAt)', async () => {
    const createSpy = vi
      .spyOn(RecurringExpense, 'create')
      .mockImplementation(async (data: any) => data as any);

    const req = {
      userId: 'u1',
      body: {
        category: 'Subscriptions',
        amount: 15.99,
        account: 'Acme Credit Card',
        description: 'Streaming',
        dayOfMonth: 12,
        currency: 'USD',
        userId: 'someone-elses-id',
        createdAt: '1999-01-01T00:00:00.000Z',
      },
    } as unknown as Request;
    const res = mockRes();

    await handler(req, res);

    const created = createSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(created.userId).toBe('u1');
    expect(created).not.toHaveProperty('createdAt');
  });
});

describe('PUT /:id', () => {
  const handler = getHandler('put', '/:id');

  it('does not mass-assign unexpected fields on update', async () => {
    const update = vi.fn().mockImplementation(async (data: any) => data);
    vi.spyOn(RecurringExpense, 'findOne').mockResolvedValue({ update } as any);

    const req = {
      userId: 'u1',
      params: { id: 'r1' },
      body: {
        category: 'Subscriptions',
        amount: 20,
        account: 'Acme Credit Card',
        description: 'Streaming',
        dayOfMonth: 5,
        currency: 'USD',
        userId: 'someone-elses-id',
        updatedAt: '1999-01-01T00:00:00.000Z',
      },
    } as unknown as Request;
    const res = mockRes();

    await handler(req, res);

    const updated = update.mock.calls[0][0] as Record<string, unknown>;
    expect(updated.userId).toBe('u1');
    expect(updated).not.toHaveProperty('updatedAt');
  });
});
