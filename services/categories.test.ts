import { describe, expect, it, vi, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import router from './categories.js';
import { Category } from '../models/Category.js';
import { CategoryBudget } from '../models/CategoryBudget.js';

const getHandler = (method: 'get' | 'post' | 'put' | 'delete', path: string) => {
  const layer = (router.stack as any[]).find(
    (candidate) => candidate.route?.path === path && candidate.route?.methods?.[method]
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

describe('PUT /:id/budget', () => {
  const handler = getHandler('put', '/:id/budget');

  it('404s instead of writing a budget when the categoryId does not belong to the requester and is not a default category', async () => {
    const categoryFindOneSpy = vi.spyOn(Category, 'findOne').mockResolvedValue(null);
    const budgetCreateSpy = vi.spyOn(CategoryBudget, 'create');

    const req = {
      userId: 'u1',
      params: { id: 'someone-elses-category' },
      body: { budget: 500 },
    } as unknown as Request;
    const res = mockRes();

    await handler(req, res);

    expect(categoryFindOneSpy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(budgetCreateSpy).not.toHaveBeenCalled();
  });

  it('creates a budget when the category is owned by the requester', async () => {
    vi.spyOn(Category, 'findOne').mockResolvedValue({ id: 'c1', userId: 'u1' } as any);
    vi.spyOn(CategoryBudget, 'findOne').mockResolvedValue(null);
    const createSpy = vi
      .spyOn(CategoryBudget, 'create')
      .mockImplementation(async (data: any) => data as any);

    const req = {
      userId: 'u1',
      params: { id: 'c1' },
      body: { budget: 500 },
    } as unknown as Request;
    const res = mockRes();

    await handler(req, res);

    expect(createSpy).toHaveBeenCalledWith({ categoryId: 'c1', userId: 'u1', budget: 500 });
    expect(res.json).toHaveBeenCalledWith({ categoryId: 'c1', userId: 'u1', budget: 500 });
  });

  it('creates a budget when the category is a shared default category', async () => {
    vi.spyOn(Category, 'findOne').mockResolvedValue({ id: 'c1', isDefault: true, userId: null } as any);
    vi.spyOn(CategoryBudget, 'findOne').mockResolvedValue(null);
    const createSpy = vi
      .spyOn(CategoryBudget, 'create')
      .mockImplementation(async (data: any) => data as any);

    const req = {
      userId: 'u1',
      params: { id: 'c1' },
      body: { budget: 250 },
    } as unknown as Request;
    const res = mockRes();

    await handler(req, res);

    expect(createSpy).toHaveBeenCalledWith({ categoryId: 'c1', userId: 'u1', budget: 250 });
  });

  it('updates an existing budget rather than creating a duplicate', async () => {
    vi.spyOn(Category, 'findOne').mockResolvedValue({ id: 'c1', userId: 'u1' } as any);
    const update = vi.fn().mockResolvedValue({ id: 'b1', categoryId: 'c1', userId: 'u1', budget: 700 });
    vi.spyOn(CategoryBudget, 'findOne').mockResolvedValue({ id: 'b1', update } as any);
    const createSpy = vi.spyOn(CategoryBudget, 'create');

    const req = {
      userId: 'u1',
      params: { id: 'c1' },
      body: { budget: 700 },
    } as unknown as Request;
    const res = mockRes();

    await handler(req, res);

    expect(update).toHaveBeenCalledWith({ budget: 700 });
    expect(createSpy).not.toHaveBeenCalled();
  });
});
