import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { logger } from '../utils/logger.js';

// Accept a caller's id (a proxy, or BE -> AI later) only if it looks like an
// id, so a client can't inject arbitrary text into every log line.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export const resolveRequestId = (incoming: string | string[] | undefined) =>
  typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();

// Path only: query strings carry search text (expense descriptions), and
// nothing personal goes into logs. No headers, no bodies.
const pathOf = (url: string | undefined) => (url ?? '').split('?')[0];

export const requestLogger = pinoHttp({
  logger,
  genReqId: (req: IncomingMessage, res: ServerResponse) => {
    const id = resolveRequestId(req.headers['x-request-id']);
    res.setHeader('X-Request-Id', id);
    return id;
  },
  serializers: {
    req: (req: { id: string; method: string; url: string; raw?: Request }) => ({
      id: req.id,
      method: req.method,
      path: pathOf(req.raw?.originalUrl ?? req.url),
    }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
  // Read when the response finishes, after requireAuth has set userId.
  customProps: (req: IncomingMessage) => ({ userId: (req as Request).userId ?? null }),
  customLogLevel: (_req, res, err) =>
    err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
  // originalUrl: a mounted router rewrites req.url to the part below its mount point.
  customSuccessMessage: (req, res) =>
    `${req.method} ${pathOf((req as Request).originalUrl ?? req.url)} ${res.statusCode}`,
  customErrorMessage: (req, res) =>
    `${req.method} ${pathOf((req as Request).originalUrl ?? req.url)} ${res.statusCode}`,
});
