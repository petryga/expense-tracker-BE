import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { handleError } from './common.js';
import { InvalidDateError } from './dates.js';
import { logger } from './logger.js';

describe('handleError', () => {
  it('logs the error and responds with a 500 and the given message', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res = { status } as unknown as Response;
    const error = new Error('boom');
    const consoleSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    handleError(res, error, 'Failed to do the thing');

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ error: 'Failed to do the thing' });
    expect(consoleSpy).toHaveBeenCalledWith({ err: error }, 'Failed to do the thing');

    consoleSpy.mockRestore();
  });

  it('logs through the request logger and returns the request id when there is a request', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const reqLog = { error: vi.fn() };
    const res = { status, req: { id: 'req-123', log: reqLog } } as unknown as Response;
    const error = new Error('boom');

    handleError(res, error, 'Failed to do the thing');

    expect(reqLog.error).toHaveBeenCalledWith({ err: error }, 'Failed to do the thing');
    expect(json).toHaveBeenCalledWith({ error: 'Failed to do the thing', requestId: 'req-123' });
  });

  it('responds with a 400 (and does not log it as a server error) for an invalid date', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res = { status } as unknown as Response;
    const consoleSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    handleError(res, new InvalidDateError('nope'), 'Failed to create new expense');

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ error: 'Invalid date: "nope"' });
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
