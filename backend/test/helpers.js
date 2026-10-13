import jwt from 'jsonwebtoken'
import { buildApp } from '../src/app.js'
import { env } from '../src/config/env.js'

export const USER_ID = '11111111-1111-4111-8111-111111111111'

export function tokenFor(role, overrides = {}) {
  const payload = { userId: USER_ID, phone: '9876543210', role, exp: Math.floor(Date.now() / 1000) + 300, ...overrides }
  return jwt.sign(payload, env.JWT_SECRET)
}

export const bearer = (role) => ({ authorization: `Bearer ${tokenFor(role)}` })

export async function testApp(opts = {}) {
  return buildApp({
    logger: false,
    healthChecks: { db: async () => {}, redis: async () => {} },
    ...opts
  })
}
