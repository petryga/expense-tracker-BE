import type { Request, Response } from 'express';
import { logger } from './logger.js';
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

  // res.req is the request this response belongs to; its child logger already
  // carries the request id. Fall back to the root logger for bare test doubles.
  const req = res.req as Request | undefined;
  (req?.log ?? logger).error({ err: error }, message);
  res.status(500).json(req?.id ? { error: message, requestId: req.id } : { error: message });
};
