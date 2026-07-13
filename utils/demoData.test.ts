import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  formatDemoDate,
  getLastNMonths,
  randomBetween,
  randomDay,
  randomItem,
} from './demoData.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('formatDemoDate', () => {
  it('zero-pads month and day', () => {
    expect(formatDemoDate(2026, 7, 5)).toBe('2026-07-05');
  });

  it('leaves double-digit month and day unpadded further', () => {
    expect(formatDemoDate(2026, 12, 28)).toBe('2026-12-28');
  });
});

describe('randomBetween', () => {
  it('stays within the given bounds and rounds to 2 decimal places', () => {
    for (let i = 0; i < 50; i++) {
      const result = randomBetween(10, 20);
      expect(result).toBeGreaterThanOrEqual(10);
      expect(result).toBeLessThanOrEqual(20);
      expect(result).toBe(Math.round(result * 100) / 100);
    }
  });

  it('returns the bound value when min equals max', () => {
    expect(randomBetween(5, 5)).toBe(5);
  });

  it('produces a deterministic value for a mocked Math.random', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(randomBetween(0, 100)).toBe(50);
  });
});

describe('randomItem', () => {
  it('always returns one of the given items', () => {
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 20; i++) {
      expect(items).toContain(randomItem(items));
    }
  });

  it('returns the only item for a single-item list', () => {
    expect(randomItem(['only'])).toBe('only');
  });
});

describe('randomDay', () => {
  it('always returns a day between 1 and 27', () => {
    for (let i = 0; i < 50; i++) {
      const day = randomDay();
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(27);
    }
  });
});

describe('getLastNMonths', () => {
  it('returns n months ending at the current month, oldest first', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15)); // July 2026 (JS months are 0-indexed)

    expect(getLastNMonths(3)).toEqual([
      { year: 2026, month: 5 },
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
    ]);
  });

  it('rolls back across a year boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 10)); // February 2026

    expect(getLastNMonths(3)).toEqual([
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ]);
  });

  it('returns an empty array for n=0', () => {
    expect(getLastNMonths(0)).toEqual([]);
  });
});
