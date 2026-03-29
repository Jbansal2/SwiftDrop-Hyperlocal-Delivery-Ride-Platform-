import { generateOTP, validatePhone } from '../../utils/otp.js'
import { sendOTPSms } from '../../utils/sms.js'
import { generateAccessToken, generateRefreshToken, verifyToken } from '../../utils/jwt.js'
import { db } from '../../db/index.js'
import { users } from '../../db/schema/users.js'
import { eq } from 'drizzle-orm'
import redis from '../../config/redis.js'
import { authenticate } from '../../middleware/authenticate.js'

export default async function authRoutes(fastify) {
    fastify.post('/send-otp', {
        schema: {
            body: {
                type: 'object',
                required: ['phone'],
                properties: { phone: { type: 'string' } }
            }
        }
    }, async (req, reply) => {
        const { phone } = req.body

        if (!validatePhone(phone)) {
            return reply.code(400).send({
                success: false,
                message: 'Invalid phone number'
            })
        }

        const attempts = await redis.incr(`otp_attempts:${phone}`)
        if (attempts === 1) await redis.expire(`otp_attempts:${phone}`, 300)
        if (attempts > 3) {
            return reply.code(429).send({
                success: false,
                message: '5 min baad try karo'
            })
        }

        const otp = generateOTP()
        await redis.setex(`otp:${phone}`, 300, otp)
        await sendOTPSms(phone, otp)

        return {
            success: true,
            message: `OTP sent to ${phone}`
        }
    })

    fastify.post('/verify-otp', {
        schema: {
            body: {
                type: 'object',
                required: ['phone', 'otp'],
                properties: {
                    phone: { type: 'string' },
                    otp: { type: 'string' },
                    role: { type: 'string' }
                }
            }
        }
    }, async (req, reply) => {
        const { phone, otp, role = 'sender' } = req.body

        const savedOtp = await redis.get(`otp:${phone}`)
        if (!savedOtp || savedOtp !== otp) {
            return reply.code(400).send({
                success: false,
                message: 'OTP galat ya expire'
            })
        }

        await redis.del(`otp:${phone}`)
        await redis.del(`otp_attempts:${phone}`)

        const [user] = await db
            .insert(users)
            .values({ phone, role })
            .onConflictDoUpdate({
                target: users.phone,
                set: { lastLogin: new Date() }
            })
            .returning()

        const accessToken = generateAccessToken({ userId: user.id, phone: user.phone, role: user.role })
        const refreshToken = generateRefreshToken({ userId: user.id })
        await db.update(users).set({ refreshToken }).where(eq(users.id, user.id))

        return {
            success: true,
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                phone: user.phone,
                role: user.role
            }
        }
    })


    fastify.get('/me', {
        preHandler: [authenticate]
    }, async (req, reply) => {
        return {
            success: true,
            user: req.user
        }
    })

    fastify.post('/refresh-token', {
        schema: {
            body: {
                type: 'object',
                required: ['refreshToken'],
                properties: { refreshToken: { type: 'string' } }
            }
        }
    }, async (req, reply) => {
        const { refreshToken } = req.body
        const decoded = verifyToken(refreshToken, process.env.JWT_REFRESH_SECRET)
        if (!decoded) {
            return reply.code(401).send({ success: false, message: 'Refresh token invalid ya expire' })
        }
        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, decoded.userId))
            .limit(1)

        if (!user || user.refreshToken !== refreshToken) {
            return reply.code(401).send({ success: false, message: 'Token mismatch — dobara login karo' })
        }
        const newAccessToken = generateAccessToken({ userId: user.id, phone: user.phone, role: user.role })
        const newRefreshToken = generateRefreshToken({ userId: user.id })
        await db.update(users).set({ refreshToken: newRefreshToken }).where(eq(users.id, user.id))

        return { success: true, accessToken: newAccessToken, refreshToken: newRefreshToken }
    })
    fastify.post('/logout', {
        preHandler: [authenticate]
    }, async (req, reply) => {
        await db.update(users)
            .set({ refreshToken: null })
            .where(eq(users.id, req.user.userId))

        return { success: true, message: 'Logout ho gaye — dobara login karo' }
    })
} 