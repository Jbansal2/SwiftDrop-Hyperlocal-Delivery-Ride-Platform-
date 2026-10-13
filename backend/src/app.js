import Fastify from 'fastify'
import cors from '@fastify/cors'
import { env, isProduction } from './config/env.js'
import { loggerOptions } from './lib/logger.js'
import { pingDB } from './db/index.js'
import redis from './config/redis.js'
import authRoutes from './routes/auth/index.js'
import driverRoutes from './routes/driver/index.js'
import adminRoutes from './routes/admin/index.js'
import rideRoutes from './routes/ride/index.js'
import orderRoutes from './routes/order/index.js'
import paymentRoutes from './routes/payment/index.js'

export const VERSION = '1.1.0'

function corsOrigin() {
  const allowed = env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  // no list in dev means "allow all" so Expo on a LAN IP just works
  if (allowed.length === 0) return !isProduction
  return allowed
}

export async function buildApp(opts = {}) {
  const app = Fastify({
    logger: opts.logger ?? loggerOptions,
    genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
    ...opts.fastify
  })

  await app.register(cors, { origin: corsOrigin() })

  app.setErrorHandler((/** @type {import('fastify').FastifyError} */ err, req, reply) => {
    const status = err.statusCode ?? 500
    if (err.validation) {
      return reply.code(400).send({ success: false, message: err.message })
    }
    if (status >= 500) {
      req.log.error({ err }, 'unhandled error')
      // internal details stay in the logs, not in the response
      return reply.code(status).send({ success: false, message: 'Internal server error', requestId: req.id })
    }
    return reply.code(status).send({ success: false, message: err.message })
  })

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({ success: false, message: `Route ${req.method} ${req.url} not found` })
  })

  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(driverRoutes, { prefix: '/driver' })
  await app.register(adminRoutes, { prefix: '/admin' })
  await app.register(rideRoutes, { prefix: '/ride' })
  await app.register(orderRoutes, { prefix: '/order' })
  await app.register(paymentRoutes, { prefix: '/payment' })

  app.get('/', async () => ({ status: 'ok', app: 'SwiftDrop Backend', version: VERSION }))

  // readiness: checks the dependencies, 503 if either is down
  app.get('/health', async (req, reply) => {
    const checks = {}
    const ping = opts.healthChecks ?? {
      db: pingDB,
      redis: () => redis.ping()
    }
    for (const [name, fn] of Object.entries(ping)) {
      try {
        await fn()
        checks[name] = 'ok'
      } catch (err) {
        req.log.warn({ err: err.message }, `health check ${name} failed`)
        checks[name] = 'down'
      }
    }
    const healthy = Object.values(checks).every((c) => c === 'ok')
    return reply.code(healthy ? 200 : 503).send({ status: healthy ? 'ok' : 'degraded', checks })
  })

  return app
}
