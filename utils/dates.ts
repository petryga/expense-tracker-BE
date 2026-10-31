export class InvalidDateError extends Error {
  constructor(value: unknown) {
    super(`Invalid date: ${JSON.stringify(value)}`);
    this.name = 'InvalidDateError';
  }
}

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

// Reads the calendar date straight off the leading `YYYY-MM-DD` of the string
// (optionally followed by a `T...` time part) instead of going through
// `new Date()`/parseISO. Those interpret the string in the *server's* time
// zone, so the same stored value could land in different months on a laptop
// and on a UTC host, and the rollup would then disagree with the row's date.
export const parseDateParts = (value: unknown): DateParts | null => {
  if (typeof value !== 'string') return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Round-trip through Date.UTC to reject impossible dates like 2026-02-31.
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
};

export const requireDateParts = (value: unknown): DateParts => {
  const parts = parseDateParts(value);
  if (!parts) throw new InvalidDateError(value);
  return parts;
};
