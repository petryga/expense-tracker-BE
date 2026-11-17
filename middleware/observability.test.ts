import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Writable } from 'node:stream';
import { pino } from 'pino';
import { serve } from '../testing/localServer.js';

// Capture the JSON lines the request logger writes, instead of stdout.
const lines: Record<string, unknown>[] = [];
const sink = new Writable({
  write(chunk, _enc, done) {
    for (const line of String(chunk).split('\n').filter(Boolean)) lines.push(JSON.parse(line));
    done();
  },
});
vi.mock('../utils/logger.js', () => ({ logger: pino({ level: 'info' }, sink) }));

const { requestLogger, resolveRequestId } = await import('./requestLogger.js');
const { errorHandler } = await import('./errorHandler.js');

const buildApp = () => {
  const app = express();
  app.use(requestLogger);
  app.use(express.json());
  app.use((req, _res, next) => {
    req.userId = 'user-1';
    next();
  });
  app.get('/ok', (_req, res) => res.json({ ok: true }));
  const nested = express.Router();
  nested.get('/:id', (_req, res) => res.json({ ok: true }));
  app.use('/things', nested);
  app.post('/boom', () => {
    throw new Error('database password is hunter2');
  });
  app.use(errorHandler);
  return app;
};

describe('request ids', () => {
  it('generates one and returns it in X-Request-Id', async () => {
    const res = await request(await serve(buildApp())).get('/ok');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("keeps a caller's well-formed id and replaces a malformed one", async () => {
    const kept = await request(await serve(buildApp()))
      .get('/ok')
      .set('X-Request-Id', 'abc-123');
    expect(kept.headers['x-request-id']).toBe('abc-123');
    expect(resolveRequestId('bad id\nwith newline')).not.toContain('\n');
    expect(resolveRequestId(['a', 'b'])).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('request logging', () => {
  it('writes one JSON line per request with id, method, path, status, duration and userId only', async () => {
    lines.length = 0;
    const res = await request(await serve(buildApp()))
      .get('/ok?search=private%20description')
      .set('Authorization', 'Bearer secret-token')
      .set('Cookie', 'session=secret');

    const entry = lines.find((l) => l.msg && String(l.msg).startsWith('GET /ok'))!;
    expect(entry).toMatchObject({
      level: 30,
      userId: 'user-1',
      req: { id: res.headers['x-request-id'], method: 'GET', path: '/ok' },
      res: { statusCode: 200 },
    });
    expect(typeof entry.responseTime).toBe('number');
    const text = JSON.stringify(lines);
    expect(text).not.toContain('secret-token');
    expect(text).not.toContain('session=secret');
    expect(text).not.toContain('private');
  });

  it('logs the full path for a route inside a mounted router', async () => {
    lines.length = 0;
    await request(await serve(buildApp())).get('/things/42?x=1');
    expect(lines.map((l) => l.msg)).toContain('GET /things/42 200');
  });

  it('does not log request bodies', async () => {
    lines.length = 0;
    await request(await serve(buildApp()))
      .post('/boom')
      .send({ description: 'my pharmacy purchase', amount: 12.5 });
    expect(JSON.stringify(lines)).not.toContain('pharmacy');
  });
});

describe('error handler', () => {
  it('logs the error with the request id and returns clean JSON without the message or stack', async () => {
    lines.length = 0;
    const res = await request(await serve(buildApp()))
      .post('/boom')
      .set('X-Request-Id', 'trace-me');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error', requestId: 'trace-me' });
    const logged = lines.find((l) => l.msg === 'Unhandled error')!;
    expect(logged).toMatchObject({
      req: { id: 'trace-me' },
      err: { message: 'database password is hunter2' },
    });
  });

  it('passes through a client error like malformed JSON as a 400', async () => {
    const res = await request(await serve(buildApp()))
      .post('/boom')
      .set('Content-Type', 'application/json')
      .send('{"not json');
    expect(res.status).toBe(400);
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });
});
