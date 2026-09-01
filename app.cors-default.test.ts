import { describe, expect, it } from 'vitest';
import request from 'supertest';

// Deliberately does NOT set FRONTEND_URL, and lives in its own file so it
// gets a fresh module graph — this is what a local `npm run dev` looks like,
// since FRONTEND_URL is only set in the Northflank production env.
delete process.env.FRONTEND_URL;

const { app } = await import('./app.js');

describe('CORS fallback when FRONTEND_URL is not set (local dev)', () => {
  it('still allows the Vite dev server origins', async () => {
    const res5173 = await request(app).get('/health').set('Origin', 'http://localhost:5173');
    expect(res5173.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const res127 = await request(app).get('/health').set('Origin', 'http://127.0.0.1:5173');
    expect(res127.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
  });

  it('does not fall back to allowing everything else', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://not-my-frontend.example.com');
    expect(res.status).toBe(403);
  });
});
