import { generateOTP, validatePhone, safeEqual } from '../../utils/otp.js'
import { sendOTPSms } from '../../utils/sms.js'
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../utils/jwt.js'
import { db } from '../../db/index.js'
import { users } from '../../db/schema/users.js'
import { eq } from 'drizzle-orm'
import redis from '../../config/redis.js'
import { authenticate } from '../../middleware/authenticate.js'

const OTP_TTL = 300
const MAX_SENDS = 3
const MAX_VERIFY_ATTEMPTS = 5

// "admin" is deliberately absent: admins are promoted in the database, never self-selected at login
export const SELF_SERVICE_ROLES = ['sender', 'driver']

const phoneSchema = { type: 'string', pattern: '^[6-9][0-9]{9}$' }

function issueTokens(user) {
  return {
    accessToken: generateAccessToken({ userId: user.id, phone: user.phone, role: user.role }),
    refreshToken: generateRefreshToken({ userId: user.id })
  }
}

export default async function authRoutes(fastify) {
  fastify.post(
    '/send-otp',
    {
      schema: {
        body: {
          type: 'object',
          required: ['phone'],
          properties: { phone: phoneSchema },
          additionalProperties: false
        }
      }
    },
    async (req, reply) => {
      const { phone } = req.body
      if (!validatePhone(phone)) {
        return reply.code(400).send({ success: false, message: 'Invalid phone number' })
      }

      const attempts = await redis.incr(`otp_attempts:${phone}`)
      if (attempts === 1) await redis.expire(`otp_attempts:${phone}`, OTP_TTL)
      if (attempts > MAX_SENDS) {
        return reply.code(429).send({ success: false, message: '5 min baad try karo' })
      }

      const otp = generateOTP()
      await redis.setex(`otp:${phone}`, OTP_TTL, otp)
      await redis.del(`otp_verify:${phone}`)
      await sendOTPSms(phone, otp)

      return { success: true, message: `OTP sent to ${phone}` }
    }
  )

  fastify.post(
    '/verify-otp',
    {
      schema: {
        body: {
          type: 'object',
          required: ['phone', 'otp'],
          properties: {
            phone: phoneSchema,
            otp: { type: 'string', pattern: '^[0-9]{6}$' },
            role: { type: 'string', enum: SELF_SERVICE_ROLES }
          },
          additionalProperties: false
        }
      }
    },
    async (req, reply) => {
      const { phone, otp, role = 'sender' } = req.body

      // a 6 digit OTP is 1 in 900k; without a cap it can be brute forced inside the 5 min window
      const tries = await redis.incr(`otp_verify:${phone}`)
      if (tries === 1) await redis.expire(`otp_verify:${phone}`, OTP_TTL)
      if (tries > MAX_VERIFY_ATTEMPTS) {
        await redis.del(`otp:${phone}`)
        return reply.code(429).send({ success: false, message: 'Bahut galat attempts, naya OTP mangao' })
      }

      const savedOtp = await redis.get(`otp:${phone}`)
      if (!savedOtp || !safeEqual(savedOtp, otp)) {
        return reply.code(400).send({ success: false, message: 'OTP galat ya expire' })
      }

      await redis.del(`otp:${phone}`, `otp_attempts:${phone}`, `otp_verify:${phone}`)

      const [user] = await db
        .insert(users)
        .values({ phone, role })
        .onConflictDoUpdate({ target: users.phone, set: { lastLogin: new Date() } })
        .returning()

      if (user.isActive === false) {
        return reply.code(403).send({ success: false, message: 'Account disabled' })
      }

      const { accessToken, refreshToken } = issueTokens(user)
      await db.update(users).set({ refreshToken }).where(eq(users.id, user.id))

      return {
        success: true,
        accessToken,
        refreshToken,
        user: { id: user.id, phone: user.phone, role: user.role }
      }
    }
  )

  fastify.get('/me', { preHandler: [authenticate] }, async (req) => ({ success: true, user: req.user }))

  fastify.post(
    '/refresh-token',
    {
      schema: {
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: { refreshToken: { type: 'string', minLength: 1 } }
        }
      }
    },
    async (req, reply) => {
      const { refreshToken } = req.body
      const decoded = verifyRefreshToken(refreshToken)
      if (!decoded) {
        return reply.code(401).send({ success: false, message: 'Refresh token invalid ya expire' })
      }
      const [user] = await db.select().from(users).where(eq(users.id, decoded.userId)).limit(1)

      if (!user || !user.refreshToken || !safeEqual(user.refreshToken, refreshToken)) {
        return reply.code(401).send({ success: false, message: 'Token mismatch — dobara login karo' })
      }
      const tokens = issueTokens(user)
      await db.update(users).set({ refreshToken: tokens.refreshToken }).where(eq(users.id, user.id))

      return { success: true, ...tokens }
    }
  )

  fastify.post('/logout', { preHandler: [authenticate] }, async (req) => {
    await db.update(users).set({ refreshToken: null }).where(eq(users.id, req.user.userId))
    return { success: true, message: 'Logout ho gaye — dobara login karo' }
  })
}
