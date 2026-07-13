import { describe, expect, it, vi } from 'vitest';
import { handleError } from './common.js';

describe('handleError', () => {
  it('logs the error and responds with a 400 and the given message', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res = { status };
    const error = new Error('boom');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    handleError(res, error, 'Failed to do the thing');

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ error: 'Failed to do the thing' });
    expect(consoleSpy).toHaveBeenCalledWith('Failed to do the thing', error);

    consoleSpy.mockRestore();
  });
});
