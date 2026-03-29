# SwiftDrop — Hyperlocal Delivery / Ride Platform

Monorepo with:

- **backend/** — Fastify API + Drizzle ORM (Postgres) + Redis
- **partner/** — Expo (React Native) partner/driver app

## Tech Stack

- **Backend:** Node.js, Fastify, Drizzle ORM, Postgres, Redis
- **Partner App:** Expo Router, React Native, NativeWind/Tailwind
- **Infra (local):** Docker Compose (backend + Redis)

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

## Quick Start — Backend (Local)

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
# Core
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DB

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=change-me
JWT_REFRESH_SECRET=change-me-too

# SMS (Fast2SMS)
FAST2SMS_API_KEY=your_fast2sms_key

# Maps (optional; backend falls back to mock values in development if missing)
OLA_MAPS_API_KEY=

# Payments
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=

# Cloudinary (for driver documents upload)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Run dev server:

```bash
npm run dev
```

Health check:

- `GET http://localhost:3000/`

### Backend Scripts

From `backend/`:

- `npm run dev` — start with nodemon
- `npm run start` — start with node
- `npm run db:push` — push schema changes via drizzle-kit
- `npm run db:studio` — open Drizzle Studio

## Quick Start — Backend (Docker)

If you prefer Docker + Redis:

```bash
cd backend
# Make sure DATABASE_URL, JWT_SECRET, FAST2SMS_API_KEY are available in your environment or in an .env file
docker compose up --build
```

Notes:

- Compose provides Redis at `redis://redis:6379` inside the container.
- You still need a reachable Postgres `DATABASE_URL`.

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

- OTP sending uses Fast2SMS in production mode. In `NODE_ENV=development`, OTP is logged to console.
- Maps: if `OLA_MAPS_API_KEY` is not set in development, backend returns mock distance/duration.

## Troubleshooting

- **401 Token Not Found:** send `Authorization: Bearer <token>` header.
- **Redis errors:** verify `REDIS_URL` and that Redis is running.
- **DB connection failed:** verify `DATABASE_URL` (and that the DB is reachable).
