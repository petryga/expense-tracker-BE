import { describe, expect, it, vi } from 'vitest';
import { formatDate } from './exportUtils';

describe('formatDate', () => {
  it('formats a mid-day UTC datetime string down to yyyy-MM-dd', () => {
    expect(formatDate('2026-07-11T15:00:00.000Z')).toBe('2026-07-11');
  });

  it('formats a UTC-midnight datetime string without rolling back a day locally', () => {
    expect(formatDate('2026-07-11T00:00:00.000Z')).toBe('2026-07-11');
  });

  it('passes through a plain date string unchanged', () => {
    expect(formatDate('2026-07-11')).toBe('2026-07-11');
  });

  it('passes through an unparseable string with no "T" unchanged', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });

  it('falls back to the original string when an invalid "T"-containing string throws while formatting', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(formatDate('garbageTvalue')).toBe('garbageTvalue');
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
