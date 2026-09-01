import { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

declare global {
  namespace Express {
    interface Request {
      userId: string | null;
    }
  }
}

type VerificationMode = 'jwks' | 'hs256';

const getVerificationMode = (): VerificationMode =>
  process.env.SUPABASE_JWT_VERIFICATION_MODE?.toLowerCase() === 'hs256' ? 'hs256' : 'jwks';

let cachedJwks: JWTVerifyGetKey | null = null;
// Only called from requireAuth after it's already confirmed SUPABASE_URL is
// set, so supabaseUrl here is always non-empty.
const getJwks = (supabaseUrl: string): JWTVerifyGetKey => {
  if (!cachedJwks) {
    const jwksUrl = new URL(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/.well-known/jwks.json`);
    cachedJwks = createRemoteJWKSet(jwksUrl);
  }
  return cachedJwks;
};

let cachedHs256Secret: Uint8Array | null = null;
const getHs256Secret = (): Uint8Array | null => {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;

  if (!cachedHs256Secret) {
    cachedHs256Secret = new TextEncoder().encode(secret);
  }
  return cachedHs256Secret;
};

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    // Running without Supabase is only allowed when it was asked for explicitly
    // (local dev, CI). Otherwise this is a misconfigured deploy: fail closed
    // rather than serving every request as a single shared `userId: null` user.
    if (process.env.AUTH_DISABLED === 'true') {
      req.userId = null;
      next();
      return;
    }
    console.error(
      'SUPABASE_URL is not set and AUTH_DISABLED is not "true" — refusing to serve unauthenticated requests.'
    );
    res.status(500).json({ error: 'Server auth is not configured' });
    return;
  }

  const mode = getVerificationMode();
  const key = mode === 'hs256' ? getHs256Secret() : getJwks(supabaseUrl);

  if (!key) {
    // Only reachable in hs256 mode: the jwks path always has a key here
    // since supabaseUrl is guaranteed non-empty by the check above.
    console.error('SUPABASE_JWT_SECRET is not configured (verification mode: hs256)');
    res.status(500).json({ error: 'Server misconfiguration' });
    return;
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;

  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  try {
    const { payload } =
      mode === 'hs256'
        ? await jwtVerify(token, key as Uint8Array, { algorithms: ['HS256'] })
        : await jwtVerify(token, key as JWTVerifyGetKey, { algorithms: ['ES256', 'RS256'] });

    if (!payload.sub) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};
