import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { handleError } from './common.js';
import { InvalidDateError } from './dates.js';

describe('handleError', () => {
  it('logs the error and responds with a 500 and the given message', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res = { status } as unknown as Response;
    const error = new Error('boom');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    handleError(res, error, 'Failed to do the thing');

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ error: 'Failed to do the thing' });
    expect(consoleSpy).toHaveBeenCalledWith('Failed to do the thing', error);

    consoleSpy.mockRestore();
  });

  it('responds with a 400 (and does not log it as a server error) for an invalid date', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res = { status } as unknown as Response;
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    handleError(res, new InvalidDateError('nope'), 'Failed to create new expense');

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ error: 'Invalid date: "nope"' });
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
