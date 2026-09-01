import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';

// FRONTEND_URL is read at module load time, so it must be set before the
// first import of ./app.js anywhere in the process.
process.env.FRONTEND_URL = 'https://myapp.vercel.app';

const { app, createApiLimiter } = await import('./app.js');

describe('trust proxy', () => {
  it("trusts the first hop, so req.ip reflects X-Forwarded-For from Northflank's proxy", () => {
    expect(app.get('trust proxy')).toBe(1);
  });

  it('does not choke on X-Forwarded-For now that trust proxy is configured', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://myapp.vercel.app')
      .set('X-Forwarded-For', '203.0.113.5');

    expect(res.status).toBe(200);
  });
});

describe('security headers', () => {
  it('applies helmet defaults (e.g. nosniff, no framing) to every response', async () => {
    const res = await request(app).get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });
});

describe('CORS', () => {
  it('allows the configured FRONTEND_URL origin', async () => {
    const res = await request(app).get('/health').set('Origin', 'https://myapp.vercel.app');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://myapp.vercel.app');
  });

  it('rejects any other origin with a clean 403 instead of leaking a stack trace', async () => {
    const res = await request(app).get('/health').set('Origin', 'https://evil.example.com');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Not allowed by CORS' });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows requests with no Origin header (curl, server-to-server, health checks)', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
  });
});

describe('rate limiting', () => {
  it('allows up to the configured limit and blocks the request after it with 429', async () => {
    // Isolated instance/app so this doesn't share counters with the
    // app-wide limiter or other tests.
    const limiter = createApiLimiter();
    const testApp = express();
    testApp.use(limiter);
    testApp.get('/', (req, res) => res.status(200).json({ ok: true }));

    for (let i = 0; i < 100; i++) {
      const res = await request(testApp).get('/');
      expect(res.status).toBe(200);
    }

    const blocked = await request(testApp).get('/');
    expect(blocked.status).toBe(429);
  });
});
