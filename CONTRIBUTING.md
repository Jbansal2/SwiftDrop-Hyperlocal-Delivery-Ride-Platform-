# Contributing

1. `cd backend && npm ci`
2. Make the change **with a test** in `backend/test/` that fails before it and passes after.
3. `npm run lint && npm test` must pass (CI also enforces 75% line coverage).
4. Schema change? Edit `src/db/schema/*`, run `npm run db:generate`, commit the new migration.
5. Keep commits small and focused, one feature or fix each, using
   [conventional commits](https://www.conventionalcommits.org): `fix(ride): ...`, `feat(order): ...`, `test: ...`.
