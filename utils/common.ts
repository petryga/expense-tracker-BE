import type { Response } from 'express';

// Logs an unexpected failure and returns a generic 500. Only ever called from
// a catch block — expected rejections (validation, not found, forbidden) use
// an explicit res.status(400 | 404) at the call site.
export const handleError = (res: Response, error: unknown, message: string) => {
  console.error(message, error);
  res.status(500).json({ error: message });
};
