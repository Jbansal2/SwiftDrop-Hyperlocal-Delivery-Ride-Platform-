import { db } from '../../db/index.js'
import { orders } from '../../db/schema/orders.js'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { authenticate, driverAuth } from '../../middleware/authenticate.js'
import { getDistanceAndDuration, calculateParcelFare } from '../../services/maps.js'
import { generateOTP, safeEqual } from '../../utils/otp.js'
import { findDriverByUser, driverFor } from '../../lib/drivers.js'
import { canView, isOwner, isAssignedDriver, redactOrderFor, ORDER_CANCELLABLE } from '../../lib/access.js'
import { idParams, lat, lng, otpBody, cancelBody } from '../../lib/schemas.js'

const phone = { type: 'string', pattern: '^[6-9][0-9]{9}$' }
const name = { type: 'string', minLength: 2, maxLength: 100 }
const address = { type: 'string', minLength: 3, maxLength: 300 }
const weightKg = { type: 'number', exclusiveMinimum: 0, maximum: 20 }
const paymentMode = { type: 'string', enum: ['prepaid', 'cod'] }

async function assignedOrder(req, reply) {
  const driver = await findDriverByUser(req.user.userId)
  const [order] = await db.select().from(orders).where(eq(orders.id, req.params.id)).limit(1)
  if (!order || !isAssignedDriver(order, driver)) {
    reply.code(404).send({ success: false, message: 'Order nahi mila' })
    return null
  }
  return order
}

export default async function orderRoutes(fastify) {
  fastify.post(
    '/estimate',
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['pickupLat', 'pickupLng', 'dropLat', 'dropLng'],
          properties: { pickupLat: lat, pickupLng: lng, dropLat: lat, dropLng: lng, weightKg, paymentMode }
        }
      }
    },
    async (req) => {
      const { pickupLat, pickupLng, dropLat, dropLng, weightKg = 1, paymentMode = 'prepaid' } = req.body
      const { distanceKm } = await getDistanceAndDuration(pickupLat, pickupLng, dropLat, dropLng)
      const { fare, platformCut, driverEarning } = calculateParcelFare(distanceKm, weightKg, paymentMode === 'cod')
      return { success: true, estimate: { fare, platformCut, driverEarning, distanceKm } }
    }
  )

  fastify.post(
    '/create',
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: 'object',
          required: [
            'senderName',
            'senderPhone',
            'receiverName',
            'receiverPhone',
            'pickupAddress',
            'pickupLat',
            'pickupLng',
            'dropAddress',
            'dropLat',
            'dropLng'
          ],
          properties: {
            senderName: name,
            senderPhone: phone,
            receiverName: name,
            receiverPhone: phone,
            pickupAddress: address,
            pickupLat: lat,
            pickupLng: lng,
            dropAddress: address,
            dropLat: lat,
            dropLng: lng,
            weightKg,
            description: { type: 'string', maxLength: 200 },
            paymentMode,
            codAmount: { type: 'number', minimum: 0, maximum: 50000 }
          }
        }
      }
    },
    async (req, reply) => {
      const {
        senderName,
        senderPhone,
        receiverName,
        receiverPhone,
        pickupAddress,
        pickupLat,
        pickupLng,
        dropAddress,
        dropLat,
        dropLng,
        weightKg = 1,
        description,
        paymentMode = 'prepaid'
      } = req.body
      // a cod amount on a prepaid order would later be "collected" from nobody
      const codAmount = paymentMode === 'cod' ? (req.body.codAmount ?? 0) : 0
      const { userId } = req.user
      const { distanceKm } = await getDistanceAndDuration(pickupLat, pickupLng, dropLat, dropLng)
      const { fare, platformCut, driverEarning } = calculateParcelFare(distanceKm, weightKg, paymentMode === 'cod')
      const pickupOtp = generateOTP()
      const deliveryOtp = generateOTP()
      const [order] = await db
        .insert(orders)
        .values({
          userId,
          senderName,
          senderPhone,
          receiverName,
          receiverPhone,
          pickupAddress,
          pickupLat: String(pickupLat),
          pickupLng: String(pickupLng),
          dropAddress,
          dropLat: String(dropLat),
          dropLng: String(dropLng),
          weightKg: String(weightKg),
          description,
          paymentMode,
          codAmount: String(codAmount),
          distanceKm: String(distanceKm),
          estimatedFare: String(fare),
          platformCut: String(platformCut),
          driverEarning: String(driverEarning),
          pickupOtp,
          deliveryOtp
        })
        .returning()

      return reply.code(201).send({
        success: true,
        order: { id: order.id, status: order.status, estimatedFare: fare, distanceKm, pickupOtp, deliveryOtp }
      })
    }
  )

  fastify.patch('/:id/accept', { preHandler: [driverAuth], schema: { params: idParams } }, async (req, reply) => {
    const driver = await findDriverByUser(req.user.userId)
    if (!driver || driver.status !== 'active') {
      return reply.code(403).send({ success: false, message: 'Driver active nahi' })
    }
    const [order] = await db
      .update(orders)
      .set({ driverId: driver.id, status: 'accepted', acceptedAt: new Date() })
      .where(and(eq(orders.id, req.params.id), eq(orders.status, 'pending')))
      .returning()
    if (!order) {
      return reply.code(409).send({ success: false, message: 'Order available nahi hai' })
    }
    return { success: true, message: 'Order accepted! Pickup ke liye jao.' }
  })

  fastify.patch(
    '/:id/pickup',
    {
      preHandler: [driverAuth],
      schema: { params: idParams, body: otpBody }
    },
    async (req, reply) => {
      const order = await assignedOrder(req, reply)
      if (!order) return reply
      if (order.status !== 'accepted') {
        return reply.code(409).send({ success: false, message: `Order ${order.status} hai` })
      }
      if (!safeEqual(order.pickupOtp, req.body.otp)) {
        return reply.code(400).send({ success: false, message: 'Pickup OTP galat' })
      }
      await db.update(orders).set({ status: 'picked_up', pickedUpAt: new Date() }).where(eq(orders.id, order.id))
      return { success: true, message: 'Parcel picked up! Ab deliver karo.' }
    }
  )

  fastify.patch(
    '/:id/deliver',
    {
      preHandler: [driverAuth],
      schema: { params: idParams, body: otpBody }
    },
    async (req, reply) => {
      const order = await assignedOrder(req, reply)
      if (!order) return reply
      if (!['picked_up', 'in_transit'].includes(order.status)) {
        return reply.code(409).send({ success: false, message: `Order ${order.status} hai` })
      }
      if (!safeEqual(order.deliveryOtp, req.body.otp)) {
        return reply.code(400).send({ success: false, message: 'Delivery OTP galat' })
      }
      const isCod = order.paymentMode === 'cod'
      await db
        .update(orders)
        .set({
          status: 'delivered',
          finalFare: order.estimatedFare,
          deliveredAt: new Date(),
          codCollected: isCod
        })
        .where(eq(orders.id, order.id))

      return {
        success: true,
        message: 'Parcel delivered!',
        finalFare: order.estimatedFare,
        driverEarning: order.driverEarning,
        codCollected: isCod
      }
    }
  )

  fastify.get('/:id/track', { preHandler: [authenticate], schema: { params: idParams } }, async (req, reply) => {
    const [order] = await db.select().from(orders).where(eq(orders.id, req.params.id)).limit(1)
    const driver = await driverFor(req.user)
    if (!canView(order, req.user, driver)) {
      return reply.code(404).send({ success: false, message: 'Order nahi mila' })
    }
    const visible = redactOrderFor(order, req.user)
    return {
      success: true,
      order: {
        id: visible.id,
        status: visible.status,
        pickupAddress: visible.pickupAddress,
        dropAddress: visible.dropAddress,
        estimatedFare: visible.estimatedFare,
        paymentMode: visible.paymentMode
      }
    }
  })

  fastify.get(
    '/history',
    {
      preHandler: [authenticate],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            offset: { type: 'integer', minimum: 0, default: 0 }
          }
        }
      }
    },
    async (req) => {
      const { limit, offset } = req.query
      const history = await db
        .select()
        .from(orders)
        .where(eq(orders.userId, req.user.userId))
        .orderBy(desc(orders.createdAt))
        .limit(limit)
        .offset(offset)
      return { success: true, count: history.length, limit, offset, orders: history }
    }
  )

  fastify.patch(
    '/:id/cancel',
    {
      preHandler: [authenticate],
      schema: { params: idParams, body: cancelBody }
    },
    async (req, reply) => {
      const { reason = 'User cancelled' } = req.body || {}
      const [order] = await db.select().from(orders).where(eq(orders.id, req.params.id)).limit(1)
      if (!order || !isOwner(order, req.user)) {
        return reply.code(404).send({ success: false, message: 'Order nahi mila' })
      }
      // once the parcel is picked up it is with the driver; cancelling then strands it
      if (!ORDER_CANCELLABLE.includes(order.status)) {
        return reply.code(409).send({ success: false, message: 'Cancel nahi ho sakta' })
      }
      await db
        .update(orders)
        .set({ status: 'cancelled', cancelReason: reason })
        .where(and(eq(orders.id, order.id), inArray(orders.status, ORDER_CANCELLABLE)))
      return { success: true, message: 'Order cancelled' }
    }
  )
}
