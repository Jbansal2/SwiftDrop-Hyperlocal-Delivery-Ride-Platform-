import { buildApp } from './app.js'
import { env } from './config/env.js'
import { testDBConnection, closeDB } from './db/index.js'
import redis from './config/redis.js'
import { logger } from './lib/logger.js'

async function start() {
  const app = await buildApp()
  try {
    await redis.connect()
    await testDBConnection()
    await app.listen({ port: env.PORT, host: '0.0.0.0' })
  } catch (err) {
    logger.fatal({ err }, 'failed to start')
    process.exit(1)
  }

  const shutdown = async (signal) => {
    logger.info({ signal }, 'shutting down')
    await app.close()
    await Promise.allSettled([closeDB(), redis.quit()])
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

start()
