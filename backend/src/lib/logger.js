import pino from 'pino'
import { env } from '../config/env.js'

// one JSON logger for the whole app; fastify reuses it so request logs carry reqId
export const loggerOptions = {
  level: env.LOG_LEVEL,
  redact: {
    paths: ['req.headers.authorization', '*.otp', '*.refreshToken', '*.accessToken'],
    censor: '[redacted]'
  }
}

export const logger = pino(loggerOptions)

export function childLogger(module) {
  return logger.child({ module })
}
