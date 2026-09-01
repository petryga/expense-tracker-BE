import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';

const resetDemoUserData = vi.fn().mockResolvedValue(undefined);
vi.mock('../utils/demoData.js', () => ({ resetDemoUserData }));

// Imported after the mock so ../config/database.js (which process.exit()s
// without DB env vars) is never pulled in.
const { default: router } = await import('./demo.js');

const getHandler = () => {
  const layer = (router.stack as any[]).find(
    (candidate) => candidate.route?.path === '/reset' && candidate.route?.methods?.post,
  );
  if (!layer) throw new Error('No POST /reset route registered');
  return layer.route.stack[0].handle as (req: Request, res: Response) => Promise<void>;
};

const mockRes = () => {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
};

const DEMO_ID = 'demo-user-123';

describe('POST /demo/reset', () => {
  const handler = getHandler();

  beforeEach(() => {
    vi.useFakeTimers();
    resetDemoUserData.mockClear();
    process.env.DEMO_USER_ID = DEMO_ID;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.DEMO_USER_ID;
  });

  it('does nothing (204) when DEMO_USER_ID is not configured', async () => {
    delete process.env.DEMO_USER_ID;
    const res = mockRes();

    await handler({ userId: DEMO_ID } as Request, res);

    expect(resetDemoUserData).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('does nothing (204) for a user that is not the demo user', async () => {
    const res = mockRes();

    await handler({ userId: 'someone-else' } as Request, res);

    expect(resetDemoUserData).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('reseeds the demo user, then debounces a second reset within 60s', async () => {
    await handler({ userId: DEMO_ID } as Request, mockRes());
    expect(resetDemoUserData).toHaveBeenCalledTimes(1);

    // 30s later — still inside the debounce window
    vi.advanceTimersByTime(30_000);
    await handler({ userId: DEMO_ID } as Request, mockRes());
    expect(resetDemoUserData).toHaveBeenCalledTimes(1);

    // past the window
    vi.advanceTimersByTime(31_000);
    await handler({ userId: DEMO_ID } as Request, mockRes());
    expect(resetDemoUserData).toHaveBeenCalledTimes(2);
  });
});
