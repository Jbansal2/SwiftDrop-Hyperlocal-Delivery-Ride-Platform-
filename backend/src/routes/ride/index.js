import { db } from '../../db/index.js'
import { rides } from '../../db/schema/rides.js'
import { drivers } from '../../db/schema/drivers.js'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { authenticate, driverAuth } from '../../middleware/authenticate.js'
import { getDistanceAndDuration, calculateFare } from '../../services/maps.js'
import { generateOTP, safeEqual } from '../../utils/otp.js'
import { findDriverByUser, driverFor } from '../../lib/drivers.js'
import { canView, isOwner, isAssignedDriver, redactRideFor, RIDE_CANCELLABLE } from '../../lib/access.js'
import { idParams, lat, lng, otpBody, cancelBody } from '../../lib/schemas.js'
import redis from '../../config/redis.js'

const tripBody = (required) => ({
  type: 'object',
  required,
  properties: {
    pickupLat: lat,
    pickupLng: lng,
    dropLat: lat,
    dropLng: lng,
    pickupAddress: { type: 'string', minLength: 3, maxLength: 300 },
    dropAddress: { type: 'string', minLength: 3, maxLength: 300 }
  }
})

async function currentSurge() {
  const raw = parseFloat(await redis.get('surge:multiplier'))
  // clamp so a bad value in redis can't produce a 0 or 50x fare
  return Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 3) : 1
}

async function activeDriverOr403(req, reply) {
  const driver = await findDriverByUser(req.user.userId)
  if (!driver || driver.status !== 'active') {
    reply.code(403).send({ success: false, message: 'Driver active nahi hai' })
    return null
  }
  return driver
}

export default async function rideRoutes(fastify) {
  fastify.post(
    '/estimate',
    {
      preHandler: [authenticate],
      schema: { body: tripBody(['pickupLat', 'pickupLng', 'dropLat', 'dropLng']) }
    },
    async (req) => {
      const { pickupLat, pickupLng, dropLat, dropLng } = req.body
      const { distanceKm, durationMin } = await getDistanceAndDuration(pickupLat, pickupLng, dropLat, dropLng)
      const surge = await currentSurge()
      const { fare, platformCut, driverEarning } = calculateFare(distanceKm, durationMin, surge)
      return { success: true, estimate: { fare, platformCut, driverEarning, distanceKm, durationMin, surge } }
    }
  )

  fastify.post(
    '/book',
    {
      preHandler: [authenticate],
      schema: { body: tripBody(['pickupLat', 'pickupLng', 'dropLat', 'dropLng', 'pickupAddress', 'dropAddress']) }
    },
    async (req, reply) => {
      const { pickupLat, pickupLng, dropLat, dropLng, pickupAddress, dropAddress } = req.body
      const { userId } = req.user

      const [open] = await db
        .select({ id: rides.id })
        .from(rides)
        .where(and(eq(rides.userId, userId), inArray(rides.status, ['searching', 'accepted', 'arrived', 'started'])))
        .limit(1)
      if (open) {
        return reply.code(409).send({ success: false, message: 'Pehle wali ride abhi chal rahi hai', rideId: open.id })
      }

      const { distanceKm, durationMin } = await getDistanceAndDuration(pickupLat, pickupLng, dropLat, dropLng)
      const surge = await currentSurge()
      const { fare, platformCut, driverEarning } = calculateFare(distanceKm, durationMin, surge)
      const startOtp = generateOTP()
      const [ride] = await db
        .insert(rides)
        .values({
          userId,
          pickupAddress,
          pickupLat: String(pickupLat),
          pickupLng: String(pickupLng),
          dropAddress,
          dropLat: String(dropLat),
          dropLng: String(dropLng),
          estimatedFare: String(fare),
          platformCut: String(platformCut),
          driverEarning: String(driverEarning),
          distanceKm: String(distanceKm),
          durationMin,
          surgeMultiplier: String(surge),
          startOtp
        })
        .returning()
      await redis.setex(`ride:pending:${ride.id}`, 120, JSON.stringify({ rideId: ride.id, pickupLat, pickupLng, fare }))

      return reply.code(201).send({
        success: true,
        ride: { id: ride.id, status: ride.status, estimatedFare: fare, distanceKm, durationMin, startOtp }
      })
    }
  )

  fastify.patch('/:id/accept', { preHandler: [driverAuth], schema: { params: idParams } }, async (req, reply) => {
    const driver = await activeDriverOr403(req, reply)
    if (!driver) return reply

    // conditional update = first driver wins; two drivers can no longer both "accept" one ride
    const [ride] = await db
      .update(rides)
      .set({ driverId: driver.id, status: 'accepted', acceptedAt: new Date() })
      .where(and(eq(rides.id, req.params.id), eq(rides.status, 'searching')))
      .returning()
    if (!ride) {
      return reply.code(409).send({ success: false, message: 'Ride available nahi hai' })
    }
    await redis.del(`ride:pending:${ride.id}`)
    return { success: true, message: 'Ride accepted!', ride: { id: ride.id, status: ride.status } }
  })

  fastify.patch(
    '/:id/start',
    {
      preHandler: [driverAuth],
      schema: { params: idParams, body: otpBody }
    },
    async (req, reply) => {
      const driver = await activeDriverOr403(req, reply)
      if (!driver) return reply

      const [ride] = await db.select().from(rides).where(eq(rides.id, req.params.id)).limit(1)
      if (!ride || !isAssignedDriver(ride, driver)) {
        return reply.code(404).send({ success: false, message: 'Ride nahi mili' })
      }
      if (!['accepted', 'arrived'].includes(ride.status)) {
        return reply.code(409).send({ success: false, message: `Ride ${ride.status} hai` })
      }
      if (!safeEqual(ride.startOtp, req.body.otp)) {
        return reply.code(400).send({ success: false, message: 'OTP galat hai' })
      }

      await db.update(rides).set({ status: 'started', startedAt: new Date() }).where(eq(rides.id, ride.id))
      return { success: true, message: 'Ride started! Drive safe.' }
    }
  )

  fastify.patch('/:id/complete', { preHandler: [driverAuth], schema: { params: idParams } }, async (req, reply) => {
    const driver = await findDriverByUser(req.user.userId)
    if (!driver) return reply.code(403).send({ success: false, message: 'Driver nahi mila' })

    const [completed] = await db
      .update(rides)
      .set({ status: 'completed', finalFare: rides.estimatedFare, completedAt: new Date() })
      .where(and(eq(rides.id, req.params.id), eq(rides.status, 'started'), eq(rides.driverId, driver.id)))
      .returning()
    if (!completed) {
      return reply.code(409).send({ success: false, message: 'Ride started nahi hai' })
    }
    // was `driverEarning + 1`, which overwrote the ride count with a rupee amount
    await db
      .update(drivers)
      .set({ totalRides: sql`${drivers.totalRides} + 1` })
      .where(eq(drivers.id, driver.id))

    return {
      success: true,
      message: 'Ride complete!',
      finalFare: completed.finalFare,
      driverEarning: completed.driverEarning
    }
  })

  fastify.patch(
    '/:id/cancel',
    {
      preHandler: [authenticate],
      schema: { params: idParams, body: cancelBody }
    },
    async (req, reply) => {
      const { reason = 'User cancelled' } = req.body || {}
      const driver = await driverFor(req.user)

      const [ride] = await db.select().from(rides).where(eq(rides.id, req.params.id)).limit(1)
      if (!ride || !(isOwner(ride, req.user) || isAssignedDriver(ride, driver))) {
        return reply.code(404).send({ success: false, message: 'Ride nahi mili' })
      }
      if (!RIDE_CANCELLABLE.includes(ride.status)) {
        return reply.code(409).send({ success: false, message: 'Yeh ride cancel nahi ho sakti' })
      }

      await db
        .update(rides)
        .set({ status: 'cancelled', cancelReason: reason })
        .where(and(eq(rides.id, ride.id), inArray(rides.status, RIDE_CANCELLABLE)))
      await redis.del(`ride:pending:${ride.id}`)

      return { success: true, message: 'Ride cancelled' }
    }
  )

  fastify.get('/:id', { preHandler: [authenticate], schema: { params: idParams } }, async (req, reply) => {
    const [ride] = await db.select().from(rides).where(eq(rides.id, req.params.id)).limit(1)
    const driver = await driverFor(req.user)
    if (!canView(ride, req.user, driver)) {
      return reply.code(404).send({ success: false, message: 'Ride nahi mili' })
    }
    return { success: true, ride: redactRideFor(ride, req.user) }
  })
}
