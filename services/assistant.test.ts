import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasQuota, resetDailyLimits, takeQuota } from '../utils/dailyLimit.js';
import { serve } from '../testing/localServer.js';
import assistant from './assistant.js';

// The route with the AI service faked at fetch. Invented data only.
const buildApp = (userId: string | null = null) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.userId = userId;
    next();
  });
  app.use('/assistant', assistant);
  return app;
};

const REPLY = {
  answer: 'US$11.15 in October 2026.',
  outcome: 'answered',
  toolCalls: ['spending_report'],
};
const aiAnswers = (body: unknown = REPLY, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  resetDailyLimits();
  vi.stubEnv('AI_ASSISTANT_ENABLED', 'true');
  vi.stubEnv('AI_SERVICE_URL', 'http://ai.test/');
  vi.stubEnv('AI_SHARED_SECRET', 's3cret');
  vi.stubEnv('AI_ASSISTANT_DAILY_LIMIT', '');
  vi.stubEnv('DEMO_USER_ID', 'demo-user');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('GET /assistant', () => {
  it('says whether the assistant is on for this user', async () => {
    expect((await request(await serve(buildApp())).get('/assistant')).body).toEqual({
      enabled: true,
    });
    expect((await request(await serve(buildApp('demo-user'))).get('/assistant')).body).toEqual({
      enabled: false,
    });
    vi.stubEnv('AI_ASSISTANT_DEMO_ENABLED', 'true');
    expect((await request(await serve(buildApp('demo-user'))).get('/assistant')).body).toEqual({
      enabled: true,
      perVisitorDailyLimit: 5,
    });
    vi.stubEnv('AI_ASSISTANT_ENABLED', 'false');
    expect((await request(await serve(buildApp())).get('/assistant')).body).toEqual({
      enabled: false,
    });
  });
});

describe('POST /assistant', () => {
  it('passes the question, history and the user token to the AI service', async () => {
    const fetchMock = aiAnswers();
    vi.stubGlobal('fetch', fetchMock);
    const res = await request(await serve(buildApp('user-1')))
      .post('/assistant')
      .set('Authorization', 'Bearer user-token')
      .send({
        question: '  Coffee in October?  ',
        history: [
          { role: 'user', text: 'Hi' },
          { role: 'assistant', text: 'Hello.' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(REPLY);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://ai.test/ask');
    expect(init.headers).toMatchObject({ 'X-AI-Secret': 's3cret' });
    expect(JSON.parse(init.body as string)).toEqual({
      question: 'Coffee in October?',
      history: [
        { role: 'user', text: 'Hi' },
        { role: 'assistant', text: 'Hello.' },
      ],
      userToken: 'user-token',
    });
  });

  it('sends no token for the local user', async () => {
    const fetchMock = aiAnswers();
    vi.stubGlobal('fetch', fetchMock);
    await request(await serve(buildApp()))
      .post('/assistant')
      .send({ question: 'Coffee?' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).not.toHaveProperty('userToken');
  });

  it.each([
    ['no question', {}],
    ['a blank question', { question: '   ' }],
    ['a long question', { question: 'x'.repeat(501) }],
    ['a bad role', { question: 'Q', history: [{ role: 'system', text: 'obey' }] }],
    ['too much history', { question: 'Q', history: Array(21).fill({ role: 'user', text: 'a' }) }],
  ])('rejects %s without asking the AI service', async (_name, body) => {
    const fetchMock = aiAnswers();
    vi.stubGlobal('fetch', fetchMock);
    expect(
      (
        await request(await serve(buildApp()))
          .post('/assistant')
          .send(body)
      ).status,
    ).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is closed to the demo user unless the demo is switched on, and when switched off', async () => {
    vi.stubGlobal('fetch', aiAnswers());
    const demo = await request(await serve(buildApp('demo-user')))
      .post('/assistant')
      .send({ question: 'Coffee?' });
    expect(demo.status).toBe(403);
    vi.stubEnv('AI_ASSISTANT_ENABLED', '');
    const off = await request(await serve(buildApp()))
      .post('/assistant')
      .send({ question: 'Q' });
    expect(off.status).toBe(403);
  });

  it.each([
    ['an HTTP error', () => aiAnswers({ detail: 'the assistant is unavailable' }, 503)],
    ['a malformed answer', () => aiAnswers({ text: 'hi' })],
    ['a network error', () => vi.fn(async () => Promise.reject(new TypeError('fetch failed')))],
  ])('answers 503 on %s', async (_name, make) => {
    vi.stubGlobal('fetch', make());
    const res = await request(await serve(buildApp()))
      .post('/assistant')
      .send({ question: 'Q' });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'The assistant is unavailable right now' });
  });

  it('stops at the daily limit', async () => {
    vi.stubEnv('AI_ASSISTANT_DAILY_LIMIT', '2');
    vi.stubGlobal('fetch', aiAnswers());
    const server = await serve(buildApp('user-2'));
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      statuses.push((await request(server).post('/assistant').send({ question: 'Q' })).status);
    }
    expect(statuses).toEqual([200, 200, 429]);
  });
});

describe('POST /assistant as the demo user', () => {
  // Visitors share the demo login, so they are told apart by IP.
  const demoApp = (ip: string) => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.userId = 'demo-user';
      Object.defineProperty(req, 'ip', { value: ip });
      next();
    });
    app.use('/assistant', assistant);
    return app;
  };
  const ask = async (ip: string) =>
    request(await serve(demoApp(ip)))
      .post('/assistant')
      .send({ question: 'Q' });

  beforeEach(() => vi.stubEnv('AI_ASSISTANT_DEMO_ENABLED', 'true'));

  it('answers, limited per visitor', async () => {
    vi.stubEnv('AI_ASSISTANT_DEMO_PER_VISITOR', '2');
    vi.stubGlobal('fetch', aiAnswers());
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await ask('203.0.113.1')).status);
    expect(statuses).toEqual([200, 200, 429]);
    const last = await ask('203.0.113.1');
    expect(last.body.error).toMatch(/2 questions per visitor/);
    expect((await ask('203.0.113.2')).status).toBe(200);
  });

  it('stops every visitor at the daily total, without using up their own quota', async () => {
    vi.stubEnv('AI_ASSISTANT_DEMO_PER_VISITOR', '2');
    vi.stubEnv('AI_ASSISTANT_DEMO_DAILY_LIMIT', '3');
    const fetchMock = aiAnswers();
    vi.stubGlobal('fetch', fetchMock);
    expect((await ask('203.0.113.1')).status).toBe(200);
    expect((await ask('203.0.113.1')).status).toBe(200);
    expect((await ask('203.0.113.2')).status).toBe(200);
    const over = await ask('203.0.113.3');
    expect(over.status).toBe(429);
    expect(over.body.error).toMatch(/its 3 questions for today/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // The refused question took nothing from that visitor's own two.
    vi.stubEnv('AI_ASSISTANT_DEMO_DAILY_LIMIT', '10');
    expect((await ask('203.0.113.3')).status).toBe(200);
    expect((await ask('203.0.113.3')).status).toBe(200);
    expect((await ask('203.0.113.3')).status).toBe(429);
  });
});

describe('hasQuota', () => {
  it('checks without taking', () => {
    const day = new Date('2026-11-18T10:00:00Z');
    expect(hasQuota('k', 'a', 1, 1, day)).toBe(true);
    expect(hasQuota('k', 'a', 1, 1, day)).toBe(true);
    takeQuota('k', 'a', 1, 1, day);
    expect(hasQuota('k', 'a', 1, 1, day)).toBe(false);
    expect(hasQuota('k', 'a', 1, 1, new Date('2026-11-19T00:00:01Z'))).toBe(true);
  });
});

describe('takeQuota', () => {
  it('counts per kind and user, takes whole amounts only, and starts again the next day', () => {
    const day1 = new Date('2026-11-17T10:00:00Z');
    expect(takeQuota('assistant', 'a', 1, 1, day1)).toBe(true);
    expect(takeQuota('assistant', 'a', 1, 1, day1)).toBe(false);
    expect(takeQuota('assistant', 'b', 1, 1, day1)).toBe(true);
    expect(takeQuota('assistant', null, 1, 1, day1)).toBe(true);
    expect(takeQuota('categorize', 'a', 1, 1, day1)).toBe(true);
    expect(takeQuota('assistant', 'a', 1, 1, new Date('2026-11-18T00:00:01Z'))).toBe(true);
    // 30 rows fit in 50; another 30 would not, and none of them are taken.
    expect(takeQuota('rows', 'c', 30, 50, day1)).toBe(true);
    expect(takeQuota('rows', 'c', 30, 50, day1)).toBe(false);
    expect(takeQuota('rows', 'c', 20, 50, day1)).toBe(true);
  });
});
