import { db } from '../../db/index.js'
import { payments } from '../../db/schema/payments.js'
import { rides } from '../../db/schema/rides.js'
import { orders } from '../../db/schema/orders.js'
import { and, desc, eq } from 'drizzle-orm'
import { authenticate, driverAuth } from '../../middleware/authenticate.js'
import { createRazorpayOrder, verifyPayment } from '../../services/payment.js'
import { env } from '../../config/env.js'
import { findDriverByUser } from '../../lib/drivers.js'
import { isAssignedDriver } from '../../lib/access.js'

const uuid = { type: 'string', format: 'uuid' }

export default async function paymentRoutes(fastify) {
  fastify.post('/create-order', {
    preHandler: [authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['referenceId', 'type'],
        properties: { referenceId: uuid, type: { type: 'string', enum: ['ride', 'order'] } }
      }
    }
  }, async (req, reply) => {
    const { referenceId, type } = req.body
    const { userId } = req.user
    const table = type === 'ride' ? rides : orders

    // only the person who booked it can pay for it
    const [item] = await db.select().from(table)
      .where(and(eq(table.id, referenceId), eq(table.userId, userId)))
      .limit(1)
    if (!item) {
      return reply.code(404).send({ success: false, message: type === 'ride' ? 'Ride nahi mili' : 'Order nahi mila' })
    }
    if (type === 'order' && item.paymentMode === 'cod') {
      return reply.code(400).send({ success: false, message: 'COD order ka online payment nahi hota' })
    }

    const [alreadyPaid] = await db.select({ id: payments.id }).from(payments)
      .where(and(eq(payments.referenceId, referenceId), eq(payments.status, 'paid')))
      .limit(1)
    if (alreadyPaid) {
      return reply.code(409).send({ success: false, message: 'Payment pehle hi ho chuka hai' })
    }

    const amount = parseFloat(item.finalFare ?? item.estimatedFare)
    const rzpOrder = await createRazorpayOrder(amount, referenceId)
    const [payment] = await db.insert(payments).values({
      userId, referenceId, type,
      amount: String(amount),
      razorpayOrderId: rzpOrder.id
    }).returning()

    return {
      success: true,
      payment: {
        id: payment.id,
        razorpayOrderId: rzpOrder.id,
        amount,
        currency: 'INR',
        keyId: env.RAZORPAY_KEY_ID
      }
    }
  })

  fastify.post('/verify', {
    preHandler: [authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['razorpayOrderId', 'razorpayPaymentId', 'razorpaySignature'],
        properties: {
          razorpayOrderId: { type: 'string', minLength: 1 },
          razorpayPaymentId: { type: 'string', minLength: 1 },
          razorpaySignature: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (req, reply) => {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body
    if (!verifyPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
      return reply.code(400).send({ success: false, message: 'Payment verification failed' })
    }

    const [payment] = await db.update(payments)
      .set({ status: 'paid', razorpayPaymentId })
      .where(and(
        eq(payments.razorpayOrderId, razorpayOrderId),
        eq(payments.userId, req.user.userId),
        eq(payments.status, 'created')
      ))
      .returning()
    if (!payment) {
      return reply.code(404).send({ success: false, message: 'Payment record nahi mila ya pehle hi verify ho chuka' })
    }

    return { success: true, message: 'Payment successful!', paymentId: razorpayPaymentId }
  })

  fastify.get('/history', { preHandler: [authenticate] }, async (req) => {
    const history = await db.select().from(payments)
      .where(eq(payments.userId, req.user.userId))
      .orderBy(desc(payments.createdAt))
      .limit(100)
    return { success: true, count: history.length, payments: history }
  })

  // was open to any logged-in user with any amount; now only the delivering driver,
  // and the amount comes from the order, not the request
  fastify.post('/cod-collect', {
    preHandler: [driverAuth],
    schema: {
      body: {
        type: 'object',
        required: ['orderId'],
        properties: { orderId: uuid }
      }
    }
  }, async (req, reply) => {
    const driver = await findDriverByUser(req.user.userId)
    const [order] = await db.select().from(orders).where(eq(orders.id, req.body.orderId)).limit(1)
    if (!order || !isAssignedDriver(order, driver)) {
      return reply.code(404).send({ success: false, message: 'Order nahi mila' })
    }
    if (order.paymentMode !== 'cod') {
      return reply.code(400).send({ success: false, message: 'Yeh COD order nahi hai' })
    }
    if (order.status !== 'delivered') {
      return reply.code(409).send({ success: false, message: 'Delivery ke baad hi COD collect hota hai' })
    }

    const [existing] = await db.select({ id: payments.id }).from(payments)
      .where(and(eq(payments.referenceId, order.id), eq(payments.status, 'paid')))
      .limit(1)
    if (existing) {
      return reply.code(409).send({ success: false, message: 'COD pehle hi record ho chuka hai' })
    }

    // driver collects the parcel value plus the delivery fare from the receiver
    const amount = Number(order.codAmount) + Number(order.finalFare ?? order.estimatedFare)
    await db.insert(payments).values({
      userId: order.userId, referenceId: order.id, type: 'order',
      amount: String(amount), status: 'paid'
    })
    await db.update(orders).set({ codCollected: true }).where(eq(orders.id, order.id))

    return { success: true, amount, message: 'COD collected! 24hr mein settle hoga.' }
  })
}
