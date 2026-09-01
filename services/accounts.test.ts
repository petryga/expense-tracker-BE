import { describe, expect, it, vi, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import { Op } from 'sequelize';
import router from './accounts.js';
import { Account } from '../models/Account.js';

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

describe('GET /', () => {
  const handler = getHandler('get', '/');

  it('returns default and user-owned accounts, ordered by name', async () => {
    const accounts = [{ id: 'a1', name: 'Cash', isDefault: true, userId: null }];
    const findAllSpy = vi.spyOn(Account, 'findAll').mockResolvedValue(accounts as any);

    const req = { userId: 'u1' } as unknown as Request;
    const res = mockRes();

    await handler(req, res);

    expect(findAllSpy).toHaveBeenCalledWith({
      where: { [Op.or]: [{ isDefault: true }, { userId: 'u1' }] },
      order: [['name', 'ASC']],
    });
    expect(res.json).toHaveBeenCalledWith(accounts);
  });
});

describe('POST /', () => {
  const handler = getHandler('post', '/');

  it('creates a non-default account owned by the requesting user', async () => {
    const createSpy = vi
      .spyOn(Account, 'create')
      .mockImplementation(async (data: any) => data as any);

    const req = {
      userId: 'u1',
      body: { name: 'New Checking', currency: 'CAD' },
    } as unknown as Request;
    const res = mockRes();

    await handler(req, res);

    expect(createSpy).toHaveBeenCalledWith({
      name: 'New Checking',
      currency: 'CAD',
      isDefault: false,
      userId: 'u1',
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('DELETE /:id', () => {
  const handler = getHandler('delete', '/:id');

  it('404s when the account is not found or not owned', async () => {
    vi.spyOn(Account, 'findOne').mockResolvedValue(null);

    const req = { params: { id: 'missing' }, userId: 'u1' } as unknown as Request;
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('blocks deleting a default account', async () => {
    vi.spyOn(Account, 'findOne').mockResolvedValue({ isDefault: true } as any);

    const req = { params: { id: 'default-id' }, userId: 'u1' } as unknown as Request;
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('deletes a non-default, owned account', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(Account, 'findOne').mockResolvedValue({ isDefault: false, destroy } as any);

    const req = { params: { id: 'a1' }, userId: 'u1' } as unknown as Request;
    const res = mockRes();

    await handler(req, res);

    expect(destroy).toHaveBeenCalledOnce();
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
