import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { requireAuth } from './auth.js';
import { jwtVerify } from 'jose';

vi.mock('jose', () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => ({})),
}));

const makeRes = () => {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { status, json } as unknown as {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
};

const ENV_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_JWT_VERIFICATION_MODE',
  'SUPABASE_JWT_SECRET',
  'AUTH_DISABLED',
] as const;

describe('requireAuth', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
    vi.mocked(jwtVerify).mockReset();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  it('passes through with userId=null when SUPABASE_URL is unset and AUTH_DISABLED=true (explicit local no-auth mode)', async () => {
    process.env.AUTH_DISABLED = 'true';
    const req = { headers: {} } as any;
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res as any, next);

    expect(req.userId).toBeNull();
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('responds 500 when SUPABASE_URL is unset and AUTH_DISABLED is not set (fail closed)', async () => {
    const req = { headers: {} } as any;
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Server auth is not configured' });
    expect(next).not.toHaveBeenCalled();
  });

  it('responds 401 when a token is required but missing', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';

    const req = { headers: {} } as any;
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing authorization token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('sets req.userId from the token payload sub and calls next() on a valid token (JWKS mode)', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    vi.mocked(jwtVerify).mockResolvedValue({ payload: { sub: 'user-123' } } as any);

    const req = { headers: { authorization: 'Bearer good-token' } } as any;
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res as any, next);

    expect(req.userId).toBe('user-123');
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('responds 401 when the verified token payload has no sub', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    vi.mocked(jwtVerify).mockResolvedValue({ payload: {} } as any);

    const req = { headers: { authorization: 'Bearer no-sub-token' } } as any;
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('responds 401 when jwtVerify rejects (invalid or expired token)', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    vi.mocked(jwtVerify).mockRejectedValue(new Error('bad signature'));

    const req = { headers: { authorization: 'Bearer bad-token' } } as any;
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('verifies with HS256 when SUPABASE_JWT_VERIFICATION_MODE=hs256 and a secret is configured', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_JWT_VERIFICATION_MODE = 'hs256';
    process.env.SUPABASE_JWT_SECRET = 'shared-secret';
    vi.mocked(jwtVerify).mockResolvedValue({ payload: { sub: 'user-456' } } as any);

    const req = { headers: { authorization: 'Bearer good-token' } } as any;
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res as any, next);

    expect(req.userId).toBe('user-456');
    expect(jwtVerify).toHaveBeenCalledWith('good-token', expect.any(Uint8Array), {
      algorithms: ['HS256'],
    });
    expect(next).toHaveBeenCalledOnce();
  });

  it('responds 500 when HS256 mode is selected but SUPABASE_JWT_SECRET is not configured', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_JWT_VERIFICATION_MODE = 'hs256';

    const req = { headers: {} } as any;
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Server misconfiguration' });
    expect(next).not.toHaveBeenCalled();
  });
});
