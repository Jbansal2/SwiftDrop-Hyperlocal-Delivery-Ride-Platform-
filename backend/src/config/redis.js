import Redis from 'ioredis'
import 'dotenv/config'

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null
})

redis.on('connect', () => {
  console.log('Redis connected!')
})

redis.on('error', (err) => {
  console.error('Redis error:', err)
})

export default redis