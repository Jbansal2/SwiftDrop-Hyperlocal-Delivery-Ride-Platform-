# Changelog

## 1.1.0

### Security
- Login could self-assign the `admin` role through `role` in `/auth/verify-otp`; only `sender` and `driver` are accepted now.
- OTP verification is capped at 5 attempts per OTP (was unlimited, so brute-forceable).
- OTPs use `crypto.randomInt`; OTP, refresh token and Razorpay signature checks are constant-time.
- Rides and orders are only visible to their owner, the assigned driver and admins; the driver can no longer read the start / pickup / delivery OTPs from the API.
- Only the owner can cancel a ride or order, and only the assigned driver can start, complete, pick up or deliver.
- `/payment/create-order` checks the ride/order belongs to the caller; `/payment/verify` only updates the caller's own unpaid payment.
- `/payment/cod-collect` is driver-only, takes the amount from the order and can only run once, after delivery.
- 500 responses no longer leak error messages; CORS is an allowlist (`CORS_ORIGINS`).

### Fixed
- `/driver/location`, `/toggle-status` and `/nearby` crashed: `redis` was never imported.
- Document upload crashed: the upsert had no matching unique index on `(driver_id, doc_type)`.
- `adminAuth` / `driverAuth` sent a second reply after a 401 (`Reply was already sent`).
- Completing a ride overwrote `drivers.total_rides` with the fare amount; it now increments.
- Two drivers could accept the same ride or order; acceptance is now first-wins (409 for the rest).
- Ride / order state machine enforced (no completing an unstarted ride, no cancelling after pickup, ...).
- Rejecting one document rejected all of a driver's documents.
- Admin approve / reject returned 500 when the SMS failed after the DB was already updated.
- Razorpay amount in paise is rounded (`0.29 * 100` is not an integer).
- Senders were never given the ride start OTP or the parcel OTPs.

### Added
- Test suite (74 tests) with in-process Postgres and Redis, 75% coverage gate.
- ESLint, GitHub Actions CI (lint, test, audit, real-services smoke test, Docker build), Dependabot.
- `docker compose up` runs Postgres, Redis, migrations and the API with no setup.
- Committed migrations and `npm run migrate`; validated env config with `.env.example`.
- Structured pino logging with request ids and redaction, `/health` readiness check, graceful shutdown.
- Input validation on every route; paginated order history; dashboard counts in SQL.

### Removed
- Unused dependencies: `@fastify/jwt`, `bcryptjs`, `bullmq`, `multer`.
