# Expense Tracker — API

REST API for a personal expense & income tracker. Express 5 + Sequelize + Postgres, with Supabase JWT authentication and per-user data scoping.

Frontend: **[expense-tracker-FE](https://github.com/petryga/expense-tracker-FE)** · **Live demo:** [expense-tracker-fe-nu.vercel.app](https://expense-tracker-fe-nu.vercel.app) (click **Try the demo**)

## What it does

- Expenses and income entries, with recurring templates that materialise on a schedule
- User-defined categories with per-category monthly budgets, plus a shared set of defaults
- Accounts, and monthly totals computed on read from the expenses/income tables (no stored rollup)
- CSV export of all expenses
- A **demo account**: when `DEMO_USER_ID` is set, that user's data is wiped and reseeded with fresh fake data on every login, so the public demo always looks alive without exposing real data

## Stack

| | |
|---|---|
| Runtime | Node 24, TypeScript (ESM) |
| Web | Express 5, `helmet`, `cors`, `express-rate-limit` |
| Data | Postgres via Sequelize 6 (`sequelize-cli` migrations + seeders) |
| Auth | Supabase-issued JWTs, verified with `jose` against the project's JWKS |
| Tests | Vitest + `supertest` |
| CI | GitHub Actions — lint, typecheck, migrate + seed against a real Postgres, tests |

## Architecture

```
index.ts            entry point + production-safety guards
app.ts              Express app: helmet → CORS allowlist → rate limit → requireAuth → routers
middleware/auth.ts  verifies the Supabase JWT, sets req.userId (or 401)
services/*.ts       one router per resource; every query is scoped to req.userId
models/*.ts         Sequelize models
utils/*.ts          pure helpers (monthly-data math, CSV formatting, demo-data generation)
migrations/         schema history — `npm start` runs these on every deploy
seeders/            shared default categories / accounts, and demo templates
```

Every route handler filters by `req.userId`; mutations do a `findOne({ where: { id, userId } })` ownership check before touching a row. There is no raw SQL — all queries go through Sequelize.

```mermaid
flowchart LR
  FE["expense-tracker-FE"] -->|"Bearer JWT"| H["helmet + CORS allowlist"]
  H --> RL["rate limit (100 / 15 min / IP)"]
  RL --> A["requireAuth<br/>verify Supabase JWT → req.userId"]
  A --> R["resource routers<br/>expenses · income · categories · accounts · …"]
  R --> M["Sequelize models"]
  M --> PG[("Postgres")]
  A -. "no SUPABASE_URL &amp; no AUTH_DISABLED" .-> X["500"]
```

## Security

- **Auth**: `requireAuth` extracts the `Authorization: Bearer <token>`, verifies it against Supabase's JWKS (`ES256`/`RS256`; a legacy `hs256` shared-secret mode is also supported), and sets `req.userId` from the `sub` claim. No valid token → `401`.
- **Fail closed**: with no `SUPABASE_URL` the API refuses to serve requests (`500`) unless `AUTH_DISABLED=true` is set explicitly (local dev / CI). A production start without either aborts at boot.
- **Per-user isolation**: enforced in every service, not just at the auth boundary.
- `helmet` defaults, an env-driven CORS **allowlist** (not `*`), `express-rate-limit` (100 req / 15 min), and `trust proxy` so the limiter buckets per client behind a PaaS proxy.

## Running locally

```bash
npm install
cp .env.example .env          # fill in DB_* ; leave SUPABASE_URL blank + AUTH_DISABLED=true for no-auth dev
npm run migrate
npm run seed
npm run dev                   # http://localhost:3000
```

**Integration tests** (`npm run test:integration`) run the real routers against a real Postgres: they create a throwaway `et_test_integration` database on the server in `BE/.env` (Homebrew on 5432 is fine, no Docker needed), apply every migration, run, and drop it. They refuse to run unless `DB_HOST` is `localhost`/`127.0.0.1`, so they can never touch Supabase. Plain `npm test` stays database-free.

Need a throwaway Postgres? `docker compose up -d` starts one on `127.0.0.1:5433` (set `DB_PORT=5433`). It's for rehearsing migrations against a disposable database — see `docker-compose.yml`.

To enable auth, set `SUPABASE_URL` (and drop `AUTH_DISABLED`); the frontend must then send Supabase access tokens.

## Commands

| | |
|---|---|
| `npm run dev` | dev server, auto-restart |
| `npm run build` | compile to `dist/` |
| `npm start` | `migrate` then run — what production does on deploy |
| `npm run migrate` / `migrate:undo` | Sequelize migrations |
| `npm run seed` | seeders (from-scratch databases only) |
| `npm test` | Vitest |
| `npm run lint` / `npm run typecheck` | both fail on any warning |

## Statement import

Upload an Amex activity CSV (the detailed export, which has a unique `Reference` per row), review the rows, confirm. Nothing becomes an expense without a confirm.

- `POST /imports` `{ fileName, csv, account, currency }` parses the file and stores every row in `imported_transactions`. Rows already imported (same `Reference`) are counted as duplicates, not stored again.
- Rules, not a model, decide what isn't spending: card payments and reward credits are skipped. A refund that equals an earlier purchase from the same merchant (within 180 days, any month, any upload) cancels it: both are marked `returned` and neither becomes an expense. If that purchase was already saved, the refund waits on review, and confirming `return` removes the expense. Partial refunds aren't paired; you decide them.
- Every import reconciles: imported rows plus duplicates add up to the file total, to the cent.
- `GET /imports`, `GET /imports/:id`, `POST /imports/:id/confirm` `{ rows: [{ id, action: save|skip|return, category?, description? }] }`, `DELETE /imports/:id` (only while nothing is saved).
- The demo account can't upload; `POST /imports/sample` loads a synthetic statement bundled in `utils/sampleStatement.ts`. Demo reset wipes its imports.

## Logging

- One JSON line per request (pino-http): request id, method, path (no query string), status, duration, `userId`. Level from `LOG_LEVEL`; `LOG_PRETTY=true` for readable local output.
- **Request ids:** every response has an `X-Request-Id`. A well-formed incoming one (`[A-Za-z0-9._-]`, up to 64 chars) is kept, so a proxy or another service can pass its own. To trace a request, search the logs for that id: the request line and any error logged while handling it carry it.
- **Errors:** a central error middleware logs the error with its stack and the request id, and returns `{ error, requestId }`, never a stack trace. `handleError` (route-level 500s) does the same.
- **Never logged:** headers (so no tokens or cookies), request or response bodies, query strings (search text is expense descriptions), statement descriptions or amounts.

## Configuration

See `.env.example` for the full list. Key vars: `DB_*`, `SUPABASE_URL`, `AUTH_DISABLED`, `FRONTEND_URL` (CORS allowlist), `DEMO_USER_ID`.

## License

All rights reserved. Published for portfolio review; not licensed for reuse.
