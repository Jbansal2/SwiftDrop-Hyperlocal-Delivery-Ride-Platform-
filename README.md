# SwiftDrop — Hyperlocal Delivery / Ride Platform

Monorepo with:

- **backend/** — Fastify API + Drizzle ORM (Postgres) + Redis
- **partner/** — Expo (React Native) partner/driver app

## Tech Stack

- **Backend:** Node.js, Fastify, Drizzle ORM, Postgres, Redis
- **Partner App:** Expo Router, React Native, NativeWind/Tailwind
- **Infra (local):** Docker Compose (backend + Postgres + Redis)

## Repo Structure

```
backend/   # API server
partner/   # Expo mobile app
```

## Prerequisites

- Node.js (LTS recommended)
- npm
- Postgres database (local/Neon/etc.)
- Redis (local) OR Docker

## Quick Start — Backend (Docker, recommended)

One command brings up Postgres, Redis, runs the migrations and starts the API:

```bash
docker compose up --build          # from the repo root
# or: cd backend && docker compose up --build
```

- API: `http://localhost:3000` — health: `GET /health` (checks Postgres + Redis, 503 if either is down)
- No `.env` is needed for this; compose ships dev-only defaults. Copy `.env.example` to `.env` to add real keys.
- Outside `NODE_ENV=production`, OTPs are logged instead of sent, maps fall back to a mock distance
  and Cloudinary uploads are skipped, so the whole flow works with no external accounts.

## Quick Start — Backend (Local)

Needs Node 20+, a Postgres and a Redis.

```bash
cd backend
cp .env.example .env      # then edit DATABASE_URL / REDIS_URL / JWT secrets
npm ci
npm run migrate           # applies src/db/migrations
npm run dev
```

Every variable is documented in [`backend/.env.example`](backend/.env.example). The app refuses to start
if `DATABASE_URL`, `JWT_SECRET` or `JWT_REFRESH_SECRET` is missing.

### Backend Scripts

From `backend/`:

| script | what it does |
| --- | --- |
| `npm run dev` | start with nodemon |
| `npm start` | start with node |
| `npm test` | unit + end-to-end flow tests (no services needed) |
| `npm run test:coverage` | same, fails under 75% line coverage |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run migrate` | apply migrations (works in the production image) |
| `npm run db:generate` | create a new migration after editing `src/db/schema` |
| `npm run db:studio` | open Drizzle Studio |

## Testing

```bash
cd backend
npm test
```

Tests need nothing running. `NODE_ENV=test` swaps in an in-process Postgres
([PGlite](https://pglite.dev)) with the real migrations applied, and an in-memory Redis, so the
suites in `backend/test/` drive full ride, parcel, COD and payment flows through the HTTP API:

- `fares`, `otp`, `payment`, `access`, `locations` — pure logic
- `app` — auth guards, validation, error handling, health
- `flows` — OTP login and lockout, token rotation, driver onboarding and approval,
  ride and parcel lifecycles, COD, Razorpay verification

CI (`.github/workflows/ci.yml`) runs lint, the tests with the coverage gate and `npm audit` on every
push and PR, then migrates and boots the server against real Postgres and Redis, and builds the
Docker image.

## Architecture

```
src/
  server.js          process entry: connects, listens, graceful shutdown
  app.js             buildApp(): plugins, error handler, routes, /health (used by tests)
  config/env.js      validated environment, single place that reads process.env
  lib/               logger (pino), access rules, shared schemas, driver lookups
  middleware/        authenticate, requireRole('admin' | 'driver')
  routes/<area>/     HTTP handlers, one plugin per prefix
  services/          fares + maps, razorpay, driver geo locations
  db/schema, db/migrations
```

Logs are structured JSON (pino) with a request id on every line; send `x-request-id` to correlate.
Authorization headers, OTPs and tokens are redacted.

## Quick Start — Partner App (Expo)

```bash
cd partner
npm install
npx expo start
```

You can develop by editing files inside the `partner/app/` directory (Expo Router).

## API Overview (High-level)

Base prefixes (registered in backend):

- `/auth` — OTP login, user session
- `/driver` — driver registration, documents, status/location
- `/admin` — driver review/approval/rejection, dashboard stats
- `/ride` — ride estimate, book, accept/start/complete/cancel
- `/order` — parcel estimate, create, accept/pickup/deliver/track/history
- `/payment` — Razorpay create/verify, history, COD collect

## Development Notes

- OTP sending uses Fast2SMS in production mode. Otherwise the OTP is written to the log.
- Maps: if `OLA_MAPS_API_KEY` is not set in development, backend returns mock distance/duration.

## Troubleshooting

- **401 Token Not Found:** send `Authorization: Bearer <token>` header.
- **500 with a requestId:** search the logs for that `reqId`; details are never sent to the client.
- **Redis errors:** verify `REDIS_URL` and that Redis is running.
- **DB connection failed:** verify `DATABASE_URL` (and that the DB is reachable).
