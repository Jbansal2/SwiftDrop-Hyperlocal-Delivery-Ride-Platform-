import { db } from '../../db/index.js'
import { orders } from '../../db/schema/orders.js'
import { drivers } from '../../db/schema/drivers.js'
import { eq } from 'drizzle-orm'
import { authenticate, driverAuth } from '../../middleware/authenticate.js'
import { getDistanceAndDuration, calculateParcelFare } from '../../services/maps.js'
import { generateOTP } from '../../utils/otp.js'

export default async function orderRoutes(fastify) {
  fastify.post('/estimate', { preHandler: [authenticate] }, async (req, reply) => {
    const { pickupLat, pickupLng, dropLat, dropLng, weightKg = 1, paymentMode = 'prepaid' } = req.body
    const { distanceKm } = await getDistanceAndDuration(pickupLat, pickupLng, dropLat, dropLng)
    const { fare, platformCut, driverEarning } = calculateParcelFare(distanceKm, weightKg, paymentMode === 'cod')
    return { success: true, estimate: { fare, platformCut, driverEarning, distanceKm } }
  })
  fastify.post('/create', {
    preHandler: [authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['senderName', 'senderPhone', 'receiverName', 'receiverPhone',
          'pickupAddress', 'pickupLat', 'pickupLng',
          'dropAddress', 'dropLat', 'dropLng'],
        properties: {
          senderName: { type: 'string' }, senderPhone: { type: 'string' },
          receiverName: { type: 'string' }, receiverPhone: { type: 'string' },
          pickupAddress: { type: 'string' }, pickupLat: { type: 'number' }, pickupLng: { type: 'number' },
          dropAddress: { type: 'string' }, dropLat: { type: 'number' }, dropLng: { type: 'number' },
          weightKg: { type: 'number' }, description: { type: 'string' },
          paymentMode: { type: 'string' }, codAmount: { type: 'number' }
        }
      }
    }
  }, async (req, reply) => {
    const {
      senderName, senderPhone, receiverName, receiverPhone,
      pickupAddress, pickupLat, pickupLng,
      dropAddress, dropLat, dropLng,
      weightKg = 1, description, paymentMode = 'prepaid', codAmount = 0
    } = req.body
    const { userId } = req.user
    const { distanceKm } = await getDistanceAndDuration(pickupLat, pickupLng, dropLat, dropLng)
    const { fare, platformCut, driverEarning } = calculateParcelFare(distanceKm, weightKg, paymentMode === 'cod')
    const pickupOtp = generateOTP()
    const deliveryOtp = generateOTP()
    const [order] = await db.insert(orders).values({
      userId, senderName, senderPhone, receiverName, receiverPhone,
      pickupAddress, pickupLat: String(pickupLat), pickupLng: String(pickupLng),
      dropAddress, dropLat: String(dropLat), dropLng: String(dropLng),
      weightKg: String(weightKg), description, paymentMode,
      codAmount: String(codAmount), distanceKm: String(distanceKm),
      estimatedFare: String(fare), platformCut: String(platformCut),
      driverEarning: String(driverEarning), pickupOtp, deliveryOtp
    }).returning()

    return reply.code(201).send({
      success: true,
      order: { id: order.id, status: order.status, estimatedFare: fare, distanceKm }
    })
  })
  fastify.patch('/:id/accept', { preHandler: [driverAuth] }, async (req, reply) => {
    const { id } = req.params
    const [driver] = await db.select().from(drivers).where(eq(drivers.userId, req.user.userId)).limit(1)
    if (!driver || driver.status !== 'active') return reply.code(403).send({ success: false, message: 'Driver active nahi' })
    await db.update(orders).set({ driverId: driver.id, status: 'accepted', acceptedAt: new Date() }).where(eq(orders.id, id))
    return { success: true, message: 'Order accepted! Pickup ke liye jao.' }
  })
  fastify.patch('/:id/pickup', {
    preHandler: [driverAuth],
    schema: { body: { type: 'object', required: ['otp'], properties: { otp: { type: 'string' } } } }
  }, async (req, reply) => {
    const { id } = req.params
    const { otp } = req.body
    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1)
    if (!order) return reply.code(404).send({ success: false, message: 'Order nahi mila' })
    if (order.pickupOtp !== otp) return reply.code(400).send({ success: false, message: 'Pickup OTP galat' })
    await db.update(orders).set({ status: 'picked_up', pickedUpAt: new Date() }).where(eq(orders.id, id))
    return { success: true, message: 'Parcel picked up! Ab deliver karo.' }
  })
  fastify.patch('/:id/deliver', {
    preHandler: [driverAuth],
    schema: { body: { type: 'object', required: ['otp'], properties: { otp: { type: 'string' } } } }
  }, async (req, reply) => {
    const { id } = req.params
    const { otp } = req.body
    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1)
    if (!order) return reply.code(404).send({ success: false, message: 'Order nahi mila' })
    if (order.deliveryOtp !== otp) return reply.code(400).send({ success: false, message: 'Delivery OTP galat' })
    await db.update(orders).set({
      status: 'delivered',
      finalFare: order.estimatedFare,
      deliveredAt: new Date(),
      codCollected: order.paymentMode === 'cod' ? true : false
    }).where(eq(orders.id, id))

    return {
      success: true,
      message: 'Parcel delivered!',
      finalFare: order.estimatedFare,
      driverEarning: order.driverEarning,
      codCollected: order.paymentMode === 'cod'
    }
  })
  fastify.get('/:id/track', { preHandler: [authenticate] }, async (req, reply) => {
    const [order] = await db.select().from(orders).where(eq(orders.id, req.params.id)).limit(1)
    if (!order) return reply.code(404).send({ success: false, message: 'Order nahi mila' })
    return {
      success: true,
      order: {
        id: order.id, status: order.status,
        pickupAddress: order.pickupAddress, dropAddress: order.dropAddress,
        estimatedFare: order.estimatedFare, paymentMode: order.paymentMode
      }
    }
  })
  fastify.get('/history', { preHandler: [authenticate] }, async (req, reply) => {
    const { userId } = req.user
    const history = await db.select().from(orders).where(eq(orders.userId, userId))
    return { success: true, count: history.length, orders: history }
  })
  fastify.patch('/:id/cancel', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params
    const { reason = 'User cancelled' } = req.body || {}
    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1)
    if (!order) return reply.code(404).send({ success: false, message: 'Order nahi mila' })
    if (['delivered', 'cancelled'].includes(order.status)) {
      return reply.code(400).send({ success: false, message: 'Cancel nahi ho sakta' })
    }
    await db.update(orders).set({ status: 'cancelled', cancelReason: reason }).where(eq(orders.id, id))
    return { success: true, message: 'Order cancelled' }
  })
}