import { env } from './env.js'
import { childLogger } from '../lib/logger.js'

const log = childLogger('redis')

// lazyConnect keeps imports side-effect free, so tests can load routes without a redis
// tests swap in an in-memory redis so the auth / ride flows run without a server
const Redis = /** @type {typeof import('ioredis').default} */ (
  env.REDIS_URL === 'mock' ? (await import('ioredis-mock')).default : (await import('ioredis')).default
)

const redis = new Redis(env.REDIS_URL === 'mock' ? {} : env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true
})

redis.on('connect', () => log.info('redis connected'))
redis.on('error', (err) => log.error({ err }, 'redis error'))

export default redis
