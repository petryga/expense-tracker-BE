import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import * as Sentry from '@sentry/node';
import type { ErrorEvent } from '@sentry/node';
import { serve } from '../testing/localServer.js';
import { requestLogger } from '../middleware/requestLogger.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { scrubEvent, sentryOptions } from './sentry.js';
import { handleError } from './common.js';

// All values invented. The real SDK runs with the app's options; only the
// network is replaced, so these check what would actually leave the process.
const TOKEN = 'eyJfake.token.value';
const SECRET_TEXT = 'Invented Bakery 4417';

const sent: string[] = [];

beforeAll(() => {
  Sentry.init({
    ...sentryOptions('https://publickey@o0.ingest.sentry.io/0'),
    transport: (options) =>
      Sentry.createTransport(options, async (req) => {
        sent.push(typeof req.body === 'string' ? req.body : new TextDecoder().decode(req.body));
        return { statusCode: 200 };
      }),
  });
});
afterAll(() => Sentry.close());
beforeEach(() => {
  sent.length = 0;
});

const buildApp = () => {
  const app = express();
  app.use(requestLogger);
  app.use(express.json());
  app.post('/expenses/:id', (req) => {
    const description = (req.body as { description: string }).description;
    throw new Error(`failed on row ${req.params.id}`, { cause: description.length });
  });
  app.get('/categories/:id', (req, res) => {
    handleError(res, new Error(`lookup failed for ${SECRET_TEXT.length}`), 'Failed to load');
  });
  app.post('/bad', () => {
    throw Object.assign(new Error('bad input'), { status: 400 });
  });
  app.post('/db', () => {
    const error = new Error(`Key (description)=(${SECRET_TEXT}) already exists.`);
    error.name = 'SequelizeUniqueConstraintError';
    throw error;
  });
  app.use(errorHandler);
  return app;
};

const sentEvents = async () => {
  await Sentry.flush(2000);
  return sent.join('\n');
};

describe('Sentry reporting', () => {
  it('reports a 500 with the request id and route, and nothing private', async () => {
    const res = await request(await serve(buildApp()))
      .post(`/expenses/42?search=${encodeURIComponent(SECRET_TEXT)}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .set('Cookie', `session=${TOKEN}`)
      .set('X-Request-Id', 'req-sentry-1')
      .send({ description: SECRET_TEXT, amount: 12.34 });
    expect(res.status).toBe(500);

    const body = await sentEvents();
    expect(body).toContain('failed on row 42');
    expect(body).toContain('"request_id":"req-sentry-1"');
    expect(body).toContain('"route":"/expenses/:id"');
    expect(body).not.toContain(TOKEN);
    expect(body).not.toContain('Bearer');
    expect(body).not.toContain(SECRET_TEXT);
    expect(body).not.toContain(encodeURIComponent(SECRET_TEXT));
    expect(body).not.toContain('12.34');
    expect(body).not.toContain('127.0.0.1');
  });

  it('reports a route-level 500 from handleError too', async () => {
    const res = await request(await serve(buildApp()))
      .get('/categories/7')
      .set('X-Request-Id', 'req-sentry-2');
    expect(res.status).toBe(500);
    const body = await sentEvents();
    expect(body).toContain('"request_id":"req-sentry-2"');
    expect(body).toContain('"route":"/categories/:id"');
  });

  it('does not report 4xx errors', async () => {
    const res = await request(await serve(buildApp()))
      .post('/bad')
      .send({});
    expect(res.status).toBe(400);
    expect(await sentEvents()).not.toContain('"type":"event"');
  });

  it('keeps only the type of a database error, whose message quotes stored values', async () => {
    await request(await serve(buildApp()))
      .post('/db')
      .send({});
    const body = await sentEvents();
    expect(body).toContain('SequelizeUniqueConstraintError');
    expect(body).not.toContain(SECRET_TEXT);
  });
});

describe('scrubEvent', () => {
  it('keeps method and path; drops everything else that could hold user data', () => {
    const event = scrubEvent({
      type: undefined,
      request: {
        method: 'POST',
        url: 'https://api.example.test/expenses?search=coffee',
        headers: { authorization: `Bearer ${TOKEN}` },
        cookies: { session: TOKEN },
        data: { description: SECRET_TEXT },
        query_string: 'search=coffee',
      },
      user: { id: 'user-1', ip_address: '203.0.113.9' },
      breadcrumbs: [{ message: SECRET_TEXT }],
      extra: { body: SECRET_TEXT },
      server_name: 'host-1',
      exception: {
        values: [
          {
            type: 'Error',
            value: 'boom',
            stacktrace: { frames: [{ function: 'f', vars: { description: SECRET_TEXT } }] },
          },
        ],
      },
    } as ErrorEvent);

    expect(event.request).toEqual({ method: 'POST', url: '/expenses' });
    expect(JSON.stringify(event)).not.toContain(SECRET_TEXT);
    expect(JSON.stringify(event)).not.toContain(TOKEN);
    expect(event.user).toBeUndefined();
    expect(event.exception?.values?.[0].value).toBe('boom');
  });
});
