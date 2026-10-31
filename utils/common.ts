import type { Response } from 'express';
import { InvalidDateError } from './dates.js';

// Logs an unexpected failure and returns a generic 500. Only ever called from
// a catch block — expected rejections (validation, not found, forbidden) use
// an explicit res.status(400 | 404) at the call site. The one exception is a
// bad date thrown while building an expense/income row: it surfaces from many
// handlers, so it is mapped to a 400 here rather than at each call site.
export const handleError = (res: Response, error: unknown, message: string) => {
  if (error instanceof InvalidDateError) {
    return res.status(400).json({ error: error.message });
  }

  console.error(message, error);
  res.status(500).json({ error: message });
};
