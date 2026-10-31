import { describe, expect, it } from 'vitest';
import { InvalidDateError, parseDateParts, requireDateParts } from './dates.js';

describe('parseDateParts', () => {
  it('parses a plain YYYY-MM-DD date', () => {
    expect(parseDateParts('2026-07-11')).toEqual({ year: 2026, month: 7, day: 11 });
  });

  it('reads the date off a legacy ISO timestamp without shifting it by time zone', () => {
    // 03:00Z is still the previous evening in the US; parseISO + local getters
    // would put this in November on a Pacific machine and December on a UTC
    // host. The calendar date in the string is the single source of truth.
    expect(parseDateParts('2024-12-01T03:00:00.000Z')).toEqual({ year: 2024, month: 12, day: 1 });
    expect(parseDateParts('2025-03-31T23:30:00.000Z')).toEqual({ year: 2025, month: 3, day: 31 });
  });

  it('accepts a leap day only in a leap year', () => {
    expect(parseDateParts('2028-02-29')).not.toBeNull();
    expect(parseDateParts('2026-02-29')).toBeNull();
  });

  it.each([
    ['impossible day', '2026-02-31'],
    ['month 13', '2026-13-01'],
    ['month 00', '2026-00-10'],
    ['slashes', '2026/10/31'],
    ['unpadded', '2026-7-1'],
    ['empty string', ''],
    ['garbage', 'not a date'],
    ['trailing junk', '2026-07-11 extra'],
  ])('rejects %s', (_label, value) => {
    expect(parseDateParts(value)).toBeNull();
  });

  it.each([[undefined], [null], [20260711], [{}]])('rejects non-string %p', (value) => {
    expect(parseDateParts(value)).toBeNull();
  });
});

describe('requireDateParts', () => {
  it('returns the parts for a valid date', () => {
    expect(requireDateParts('2026-07-11')).toEqual({ year: 2026, month: 7, day: 11 });
  });

  it('throws InvalidDateError for an invalid one', () => {
    expect(() => requireDateParts('nope')).toThrow(InvalidDateError);
    expect(() => requireDateParts(undefined)).toThrow(InvalidDateError);
  });
});
