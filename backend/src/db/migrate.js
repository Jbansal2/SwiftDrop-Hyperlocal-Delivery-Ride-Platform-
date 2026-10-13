// applies src/db/migrations; used by docker compose and deploys (drizzle-kit is a dev dependency)
import { runMigrations, closeDB } from './index.js'
import { logger } from '../lib/logger.js'

try {
  await runMigrations()
  logger.info('migrations applied')
} catch (err) {
  logger.fatal({ err }, 'migration failed')
  process.exitCode = 1
} finally {
  await closeDB()
}
