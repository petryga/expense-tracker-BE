import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import expensesRouter from './services/expenses.js';
import monthlyData from './services/monthlyData.js';
import incomeEntries from './services/incomeEntries.js';
import exportCsV from './services/exportCsv.js';
import recurringExpenses from './services/recurringExpenses.js';
import recurringIncomeEntries from './services/recurringIncomeEntries.js';
import categories from './services/categories.js';
import accounts from './services/accounts.js';
import demo from './services/demo.js';
import { requireAuth } from './middleware/auth.js';

export const allowedOrigins = (
  process.env.FRONTEND_URL || 'http://localhost:5173,http://127.0.0.1:5173'
)
  .split(',')
  .map((origin) => origin.trim());

// Factory rather than a shared instance so tests can mount an isolated
// limiter and exercise its 429 behavior without tripping the app-wide one.
export const createApiLimiter = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });

export const app = express();

// Northflank (and every similar PaaS) terminates TLS at a reverse proxy in
// front of this container, so the real client IP only arrives via
// X-Forwarded-For. Without this, Express reports every request as coming
// from the proxy, and express-rate-limit buckets all users together into a
// single shared counter instead of one per client.
app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // No Origin header (curl, server-to-server, health checks) — allow.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
  }),
);
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err.message === 'Not allowed by CORS') {
    res.status(403).json({ error: 'Not allowed by CORS' });
    return;
  }
  next(err);
});
app.use(express.json());

// Express 5 leaves req.body as undefined when there was nothing to parse (no
// body, or no JSON content-type); Express 4 left an empty object. Handlers here
// destructure req.body directly, so without this a bodyless POST throws a
// TypeError that only happens to surface as a 400 because of a surrounding
// try/catch. Restoring the v4 shape keeps that validation explicit.
app.use((req, _res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

// Unauthenticated on purpose — hosting platforms ping this to check the
// container is up, before any user has a token to send.
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// No login/signup routes live here — Supabase Auth handles authentication
// directly against Supabase's own API, so there's no auth endpoint on this
// backend to apply a stricter limiter to.
app.use(createApiLimiter());

app.use(requireAuth);

app.use('/expenses', expensesRouter);
app.use('/monthlyData', monthlyData);
app.use('/income', incomeEntries);
app.use('/export', exportCsV);
app.use('/recurringExpenses', recurringExpenses);
app.use('/recurringIncome', recurringIncomeEntries);
app.use('/categories', categories);
app.use('/accounts', accounts);
app.use('/demo', demo);
