import { db } from '../../db/index.js'
import { payments } from '../../db/schema/payments.js'
import { rides } from '../../db/schema/rides.js'
import { orders } from '../../db/schema/orders.js'
import { eq } from 'drizzle-orm'
import { authenticate } from '../../middleware/authenticate.js'
import { createRazorpayOrder, verifyPayment } from '../../services/payment.js'

export default async function paymentRoutes(fastify) {
    fastify.post('/create-order', {
        preHandler: [authenticate],
        schema: {
            body: {
                type: 'object',
                required: ['referenceId', 'type'],
                properties: {
                    referenceId: { type: 'string' },
                    type: { type: 'string' }
                }
            }
        }
    }, async (req, reply) => {
        const { referenceId, type } = req.body
        const { userId } = req.user
        let amount = 0
        if (type === 'ride') {
            const [ride] = await db.select().from(rides).where(eq(rides.id, referenceId)).limit(1)
            if (!ride) return reply.code(404).send({ success: false, message: 'Ride nahi mili' })
            amount = parseFloat(ride.estimatedFare)
        } else {
            const [order] = await db.select().from(orders).where(eq(orders.id, referenceId)).limit(1)
            if (!order) return reply.code(404).send({ success: false, message: 'Order nahi mila' })
            amount = parseFloat(order.estimatedFare)
        }

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
                amount, currency: 'INR',
                keyId: process.env.RAZORPAY_KEY_ID
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
                    razorpayOrderId: { type: 'string' },
                    razorpayPaymentId: { type: 'string' },
                    razorpaySignature: { type: 'string' }
                }
            }
        }
    }, async (req, reply) => {
        const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body
        const isValid = verifyPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature)
        if (!isValid) {
            return reply.code(400).send({ success: false, message: 'Payment verification failed' })
        }

        await db.update(payments)
            .set({ status: 'paid', razorpayPaymentId })
            .where(eq(payments.razorpayOrderId, razorpayOrderId))

        return { success: true, message: 'Payment successful!', paymentId: razorpayPaymentId }
    })
    fastify.get('/history', { preHandler: [authenticate] }, async (req, reply) => {
        const history = await db.select().from(payments)
            .where(eq(payments.userId, req.user.userId))
        return { success: true, count: history.length, payments: history }
    })
    fastify.post('/cod-collect', {
        preHandler: [authenticate],
        schema: {
            body: {
                type: 'object',
                required: ['orderId', 'amount'],
                properties: {
                    orderId: { type: 'string' },
                    amount: { type: 'number' }
                }
            }
        }
    }, async (req, reply) => {
        const { orderId, amount } = req.body
        const { userId } = req.user
        await db.insert(payments).values({
            userId, referenceId: orderId, type: 'order',
            amount: String(amount), status: 'paid'
        })
        await db.update(orders)
            .set({ codCollected: true })
            .where(eq(orders.id, orderId))

        return { success: true, message: 'COD collected! 24hr mein settle hoga.' }
    })
}