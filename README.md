# Expense Tracker — backend

Express + Sequelize + Postgres API. See `../CLAUDE.md` for architecture notes.

## Two databases, on purpose

Local development involves two separate Postgres instances. Knowing which one you're
talking to is the single most important thing in this document.

| | Port | What it is | Destroyable? |
|---|---|---|---|
| **Homebrew Postgres** | `5432` | Your real local data. Backed up daily. | **No** |
| **Docker container** | `5433` | Throwaway. Defined in `docker-compose.yml`. | Yes, that's the point |

They run independently and can be up at the same time. Which one a command hits is decided
by `DB_PORT` — never by which server happens to be running:

```bash
npm run migrate                 # → 5432, your real database
DB_PORT=5433 npm run migrate    # → 5433, the container
```

`.env` sets `DB_PORT=5432`, so the safe default is the real database and reaching the
container is always something you did on purpose.

## Everyday development

Nothing to do. Docker isn't involved.

```bash
npm run dev      # http://localhost:3000, using Homebrew Postgres on 5432
```

If Postgres isn't running: `brew services start postgresql@17`.

## The Docker database

A disposable Postgres you can destroy and rebuild in seconds. It exists so migrations can
be tested without risking real data.

It does **not** start automatically — not at login, not with `npm run dev`. It runs only
between an explicit `up` and `down`.

```bash
docker compose up -d        # start (takes ~8s to become healthy)
docker compose ps           # check status - wait for "healthy", not just "Up"
docker compose down         # stop, keep the data
docker compose down -v      # stop and delete the data → back to empty
docker compose logs -f db   # follow output; first stop when something won't start
```

Run these from `BE/` — that's where `docker-compose.yml` lives. Docker Desktop must be
running (`open -a Docker`).

### When to use it

Mainly one situation: **you're writing or changing a migration.** Also useful for checking
the from-scratch setup path still works, or rehearsing a risky bulk data change.

### Testing a migration against realistic data

The workflow the container exists for. Load a copy of your real data, run the migration,
inspect it, reset, repeat as often as you like.

```bash
# 1. blank database
docker compose down -v && docker compose up -d

# 2. load a copy of real data (newest daily backup)
gunzip -c ~/Library/Application\ Support/expense-tracker-backups/<file>.sql.gz \
  | psql -h 127.0.0.1 -p 5433 -U petryga -d expense_tracker

# 3. run the migration against it
DB_PORT=5433 npm run migrate

# 4. inspect, then go back to step 1 and try again
```

This matters because migrations aren't always reversible — `20260731130000-trim-shared-
default-categories.js` deletes rows and has a deliberately empty `down`. Against your real
database you'd get one attempt.

### Testing the from-scratch path

What a brand-new database (a fresh Supabase project, or CI) would produce:

```bash
docker compose down -v && docker compose up -d
DB_PORT=5433 npm run migrate
DB_PORT=5433 npm run seed
```

Both must complete cleanly. This is how the empty-`bulkInsert` bug in
`seeders/20260711130002-seed-default-categories.js` was found — it had been broken for
anyone setting up from scratch, while every existing database was fine.

## Backups

The Homebrew database is dumped daily at noon and at login by a launchd agent, writing
only when the data actually changed.

- Backups: `~/Library/Application Support/expense-tracker-backups/` (mirrored to iCloud)
- Script: `~/Library/Scripts/expense-tracker-backup.sh` — **editable source is
  `../backup-local-db.sh`; copy it across after editing, launchd runs the `~/Library` copy**
- Log: `~/Library/Logs/expense-tracker-backup.log`

Force one before risky work:

```bash
launchctl kickstart -k gui/$(id -u)/com.user.expense-tracker-backup
```

Restore into a target database:

```bash
gunzip -c <file>.sql.gz | psql -h 127.0.0.1 -p <port> -U petryga -d <database>
```

## Troubleshooting

**`psql` asks for a password on 5433 but not 5432.** Expected — Homebrew Postgres trusts
local connections, the container requires the password from `.env`. Either type it, or:

```bash
export PGPASSWORD=$(awk -F= '/^DB_PASSWORD=/{print $2}' .env)
```

**`Cannot connect to the Docker daemon`.** Docker Desktop isn't running: `open -a Docker`,
then wait a few seconds.

**Connection refused on 5433.** The container is probably still starting. `docker compose ps`
and wait for `healthy` — "Up" alone means the process launched, not that Postgres is
accepting queries.

**Port 5432 already in use.** Two Postgres servers are competing. The Docker one is
deliberately on 5433, so this is something else — check with `lsof -nP -iTCP:5432 -sTCP:LISTEN`.

**The container has data I didn't expect.** The volume survives `docker compose down`.
Use `down -v` for a genuinely clean slate.

## Commands

| | |
|---|---|
| `npm run dev` | Dev server with auto-restart |
| `npm run build` | Compile to `dist/` |
| `npm start` | `migrate` then run — this is what production does on deploy |
| `npm run migrate` / `migrate:undo` | Sequelize migrations |
| `npm run seed` | Seeders (from-scratch databases only) |
| `npm test` | Vitest |
| `npm run lint` / `typecheck` | Both fail on any warning |
