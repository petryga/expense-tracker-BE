import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import { tmpdir } from 'os';
import router from './exportCsv.js';
import { Expense } from '../models/Expense.js';

const writeRecords = vi.fn().mockResolvedValue(undefined);
vi.mock('csv-writer', () => ({
  createObjectCsvWriter: vi.fn((opts: { path: string }) => ({
    path: opts.path,
    writeRecords,
  })),
}));

const unlink = vi.fn().mockResolvedValue(undefined);
vi.mock('fs/promises', () => ({
  unlink: (...args: unknown[]) => unlink(...args),
}));

const getHandler = () => {
  const layer = (router.stack as any[]).find(
    (candidate) => candidate.route?.path === '/' && candidate.route?.methods?.get
  );
  if (!layer) throw new Error('No GET / route registered');
  return layer.route.stack[0].handle as (req: Request, res: Response) => Promise<void>;
};

const mockRes = () => {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.download = vi.fn();
  return res as Response;
};

describe('GET /export', () => {
  const handler = getHandler();

  beforeEach(() => {
    vi.spyOn(Expense, 'findAll').mockResolvedValue([] as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    writeRecords.mockClear();
    unlink.mockClear();
  });

  it('writes to a unique file under the OS temp dir rather than a shared path', async () => {
    const req = { userId: 'u1' } as unknown as Request;
    const res = mockRes();

    await handler(req, res);

    const [writtenPath] = (res.download as any).mock.calls[0];
    expect(writtenPath.startsWith(tmpdir())).toBe(true);
    expect(writtenPath).toMatch(/expenses-export-[0-9a-f-]+\.csv$/);
  });

  it('uses a different file for two concurrent requests, so one user can never read another user in-flight', async () => {
    const reqA = { userId: 'userA' } as unknown as Request;
    const reqB = { userId: 'userB' } as unknown as Request;
    const resA = mockRes();
    const resB = mockRes();

    await Promise.all([handler(reqA, resA), handler(reqB, resB)]);

    const pathA = (resA.download as any).mock.calls[0][0];
    const pathB = (resB.download as any).mock.calls[0][0];
    expect(pathA).not.toBe(pathB);
  });

  it('serves the download under a friendly filename, not the random temp name', async () => {
    const req = { userId: 'u1' } as unknown as Request;
    const res = mockRes();

    await handler(req, res);

    const [, filename] = (res.download as any).mock.calls[0];
    expect(filename).toBe('expenses.csv');
  });

  it('deletes the temp file once res.download finishes successfully', async () => {
    const req = { userId: 'u1' } as unknown as Request;
    const res = mockRes();
    (res.download as any).mockImplementation((_path: string, _name: string, cb: () => void) =>
      cb()
    );

    await handler(req, res);

    expect(unlink).toHaveBeenCalledTimes(1);
    const [writtenPath] = (res.download as any).mock.calls[0];
    expect(unlink).toHaveBeenCalledWith(writtenPath);
  });

  it('still deletes the temp file when the download transfer itself errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const req = { userId: 'u1' } as unknown as Request;
    const res = mockRes();
    const transferError = new Error('client aborted');
    (res.download as any).mockImplementation((_path: string, _name: string, cb: (e: Error) => void) =>
      cb(transferError)
    );

    await handler(req, res);

    expect(unlink).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith('Failed to send CSV:', transferError);
  });

  it('cleans up the temp file when CSV generation fails before any download starts', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(Expense.findAll).mockRejectedValue(new Error('db down'));

    const req = { userId: 'u1' } as unknown as Request;
    const res = mockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(unlink).toHaveBeenCalledTimes(1);
    expect(res.download).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('scopes the export query to the requesting user', async () => {
    const req = { userId: 'u42' } as unknown as Request;
    const res = mockRes();

    await handler(req, res);

    expect(Expense.findAll).toHaveBeenCalledWith({ where: { userId: 'u42' } });
  });
});
