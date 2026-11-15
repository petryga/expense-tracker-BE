import { pino } from 'pino';

// One JSON object per line on stdout; the host (Northflank) collects stdout.
// Tests stay quiet unless LOG_LEVEL asks otherwise. LOG_PRETTY=true makes
// local output human-readable (pino-pretty is a dev dependency only).
const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info');

export const logger = pino({
  level,
  // Belt and braces: the request serializer below never includes headers, but
  // anything that logs a raw request object must not leak credentials.
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'headers.authorization'],
    remove: true,
  },
  ...(process.env.LOG_PRETTY === 'true' ? { transport: { target: 'pino-pretty' } } : {}),
});
