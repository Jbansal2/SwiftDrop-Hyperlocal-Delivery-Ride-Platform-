import { db } from '../../db/index.js'
import { rides } from '../../db/schema/rides.js'
import { drivers } from '../../db/schema/drivers.js'
import { eq } from 'drizzle-orm'
import { authenticate, driverAuth } from '../../middleware/authenticate.js'
import { getDistanceAndDuration, calculateFare } from '../../services/maps.js'
import { generateOTP } from '../../utils/otp.js'
import redis from '../../config/redis.js'

export default async function rideRoutes(fastify) {
    fastify.post('/estimate', {
        preHandler: [authenticate],
        schema: {
            body: {
                type: 'object',
                required: ['pickupLat', 'pickupLng', 'dropLat', 'dropLng'],
                properties: {
                    pickupLat: { type: 'number' }, pickupLng: { type: 'number' },
                    dropLat: { type: 'number' }, dropLng: { type: 'number' },
                    pickupAddress: { type: 'string' }, dropAddress: { type: 'string' }
                }
            }
        }
    }, async (req, reply) => {
        const { pickupLat, pickupLng, dropLat, dropLng } = req.body
        const { distanceKm, durationMin } = await getDistanceAndDuration(pickupLat, pickupLng, dropLat, dropLng)
        const surge = await redis.get('surge:multiplier') || '1.0'
        const { fare, platformCut, driverEarning } = calculateFare(distanceKm, durationMin, parseFloat(surge))

        return {
            success: true,
            estimate: { fare, platformCut, driverEarning, distanceKm, durationMin, surge: parseFloat(surge) }
        }
    })
    fastify.post('/book', {
        preHandler: [authenticate],
        schema: {
            body: {
                type: 'object',
                required: ['pickupLat', 'pickupLng', 'dropLat', 'dropLng', 'pickupAddress', 'dropAddress'],
                properties: {
                    pickupLat: { type: 'number' }, pickupLng: { type: 'number' },
                    dropLat: { type: 'number' }, dropLng: { type: 'number' },
                    pickupAddress: { type: 'string' }, dropAddress: { type: 'string' }
                }
            }
        }
    }, async (req, reply) => {
        const { pickupLat, pickupLng, dropLat, dropLng, pickupAddress, dropAddress } = req.body
        const { userId } = req.user
        const { distanceKm, durationMin } = await getDistanceAndDuration(pickupLat, pickupLng, dropLat, dropLng)
        const surge = parseFloat(await redis.get('surge:multiplier') || '1.0')
        const { fare, platformCut, driverEarning } = calculateFare(distanceKm, durationMin, surge)
        const startOtp = generateOTP()
        const [ride] = await db.insert(rides).values({
            userId, pickupAddress, pickupLat: String(pickupLat), pickupLng: String(pickupLng),
            dropAddress, dropLat: String(dropLat), dropLng: String(dropLng),
            estimatedFare: String(fare), platformCut: String(platformCut),
            driverEarning: String(driverEarning), distanceKm: String(distanceKm),
            durationMin, surgeMultiplier: String(surge), startOtp
        }).returning()
        await redis.setex(`ride:pending:${ride.id}`, 120, JSON.stringify({
            rideId: ride.id, pickupLat, pickupLng, fare
        }))

        return reply.code(201).send({
            success: true,
            ride: { id: ride.id, status: ride.status, estimatedFare: fare, distanceKm, durationMin }
        })
    })
    fastify.patch('/:id/accept', { preHandler: [driverAuth] }, async (req, reply) => {
        const { id } = req.params
        const { userId } = req.user
        const [driver] = await db.select().from(drivers).where(eq(drivers.userId, userId)).limit(1)
        if (!driver || driver.status !== 'active') {
            return reply.code(403).send({ success: false, message: 'Driver active nahi hai' })
        }
        const [ride] = await db.update(rides)
            .set({ driverId: driver.id, status: 'accepted', acceptedAt: new Date() })
            .where(eq(rides.id, id))
            .returning()

        return { success: true, message: 'Ride accepted!', ride: { id: ride.id, status: ride.status } }
    })
    fastify.patch('/:id/start', {
        preHandler: [driverAuth],
        schema: { body: { type: 'object', required: ['otp'], properties: { otp: { type: 'string' } } } }
    }, async (req, reply) => {
        const { id } = req.params
        const { otp } = req.body
        const [ride] = await db.select().from(rides).where(eq(rides.id, id)).limit(1)
        if (!ride) return reply.code(404).send({ success: false, message: 'Ride nahi mili' })
        if (ride.startOtp !== otp) return reply.code(400).send({ success: false, message: 'OTP galat hai' })

        await db.update(rides)
            .set({ status: 'started', startedAt: new Date() })
            .where(eq(rides.id, id))

        return { success: true, message: 'Ride started! Drive safe.' }
    })
    fastify.patch('/:id/complete', { preHandler: [driverAuth] }, async (req, reply) => {
        const { id } = req.params

        const [ride] = await db.select().from(rides).where(eq(rides.id, id)).limit(1)
        if (!ride || ride.status !== 'started') {
            return reply.code(400).send({ success: false, message: 'Ride started nahi hai' })
        }
        const [completed] = await db.update(rides)
            .set({ status: 'completed', finalFare: ride.estimatedFare, completedAt: new Date() })
            .where(eq(rides.id, id))
            .returning()
        await db.update(drivers)
            .set({ totalRides: String(parseInt(ride.driverEarning || 0) + 1) })
            .where(eq(drivers.id, ride.driverId))

        return {
            success: true,
            message: 'Ride complete!',
            finalFare: completed.finalFare,
            driverEarning: completed.driverEarning
        }
    })
    fastify.patch('/:id/cancel', {
        preHandler: [authenticate],
        schema: { body: { type: 'object', properties: { reason: { type: 'string' } } } }
    }, async (req, reply) => {
        const { id } = req.params
        const { reason = 'User cancelled' } = req.body || {}

        const [ride] = await db.select().from(rides).where(eq(rides.id, id)).limit(1)
        if (!ride) return reply.code(404).send({ success: false, message: 'Ride nahi mili' })
        if (['completed', 'cancelled'].includes(ride.status)) {
            return reply.code(400).send({ success: false, message: 'Yeh ride cancel nahi ho sakti' })
        }

        await db.update(rides)
            .set({ status: 'cancelled', cancelReason: reason })
            .where(eq(rides.id, id))

        return { success: true, message: 'Ride cancelled' }
    })
    fastify.get('/:id', { preHandler: [authenticate] }, async (req, reply) => {
        const [ride] = await db.select().from(rides).where(eq(rides.id, req.params.id)).limit(1)
        if (!ride) return reply.code(404).send({ success: false, message: 'Ride nahi mili' })
        return { success: true, ride }
    })
}