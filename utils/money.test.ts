import { describe, expect, it } from 'vitest';
import { fromCents, toCents } from './money.js';

describe('toCents', () => {
  it('turns amounts, as numbers or decimal strings, into whole cents', () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents('12.50')).toBe(1250);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it('counts anything unreadable as nothing', () => {
    expect(toCents(null)).toBe(0);
    expect(toCents(undefined)).toBe(0);
    expect(toCents('abc')).toBe(0);
  });

  it('adds up exactly where floats would not', () => {
    const dimes = Array.from({ length: 10 }, () => 0.1);
    expect(dimes.reduce((sum, value) => sum + value, 0)).not.toBe(1);
    expect(fromCents(dimes.reduce((sum, value) => sum + toCents(value), 0))).toBe(1);
  });
});
