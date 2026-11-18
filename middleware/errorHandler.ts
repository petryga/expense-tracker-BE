import type { ErrorRequestHandler } from 'express';
import { reportError, routeOf } from '../utils/sentry.js';

interface HttpishError {
  status?: number;
  statusCode?: number;
  expose?: boolean;
  message?: string;
}

// Last middleware in the chain. Express 5 forwards both thrown and rejected
// errors from handlers here. The client gets a short JSON error with the
// request id to quote; the stack goes to the log, never to the client.
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const e = (err ?? {}) as HttpishError;
  const candidate = e.status ?? e.statusCode;
  const status = candidate && candidate >= 400 && candidate < 600 ? candidate : 500;

  if (status >= 500) {
    req.log.error({ err }, 'Unhandled error');
    reportError(err, String(req.id), routeOf(req));
  } else req.log.warn({ err: { type: (err as Error)?.name, message: e.message } }, 'Request error');

  // body-parser errors (bad JSON, too large) set expose=true with a safe message.
  const message =
    status < 500 && e.expose && e.message
      ? e.message
      : status < 500
        ? 'Bad request'
        : 'Internal server error';
  res.status(status).json({ error: message, requestId: req.id });
};
