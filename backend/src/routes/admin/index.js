import { db } from '../../db/index.js'
import { drivers, driverDocuments } from '../../db/schema/drivers.js'
import { users } from '../../db/schema/users.js'
import { eq } from 'drizzle-orm'
import { adminAuth } from '../../middleware/authenticate.js'
import { sendOTPSms } from '../../utils/sms.js'

export default async function adminRoutes(fastify) {
    fastify.get('/drivers/pending', {
        preHandler: [adminAuth]
    }, async (req, reply) => {
        const pendingDrivers = await db.select()
            .from(drivers)
            .where(eq(drivers.status, 'under_review'))

        return {
            success: true,
            count: pendingDrivers.length,
            drivers: pendingDrivers
        }
    })
    fastify.get('/drivers/:id/documents', {
        preHandler: [adminAuth]
    }, async (req, reply) => {
        const { id } = req.params
        const [driver] = await db.select().from(drivers)
            .where(eq(drivers.id, id)).limit(1)

        if (!driver) {
            return reply.code(404).send({ success: false, message: 'Driver nahi mila' })
        }
        const docs = await db.select().from(driverDocuments)
            .where(eq(driverDocuments.driverId, id))

        return { success: true, driver, documents: docs }
    })
    fastify.patch('/drivers/:id/approve', {
        preHandler: [adminAuth]
    }, async (req, reply) => {
        const { id } = req.params
        const adminId = req.user.userId
        const [driver] = await db.select().from(drivers)
            .where(eq(drivers.id, id)).limit(1)

        if (!driver) {
            return reply.code(404).send({ success: false, message: 'Driver nahi mila' })
        }
        await db.update(drivers)
            .set({
                status: 'active',
                verifiedBy: adminId,
                verifiedAt: new Date()
            })
            .where(eq(drivers.id, id))
        await db.update(driverDocuments)
            .set({ status: 'approved' })
            .where(eq(driverDocuments.driverId, id))
        await sendOTPSms(
            driver.phone,
            `Congratulations ${driver.name}! Aapka SwiftDrop account activate ho gaya. Ab orders lena shuru karo!`
        )

        return { success: true, message: `Driver ${driver.name} activated!` }
    })
    fastify.patch('/drivers/:id/reject', {
        preHandler: [adminAuth],
        schema: {
            body: {
                type: 'object',
                required: ['reason'],
                properties: {
                    reason: { type: 'string' },
                    docType: { type: 'string' }
                }
            }
        }
    }, async (req, reply) => {
        const { id } = req.params
        const { reason, docType } = req.body

        const [driver] = await db.select().from(drivers)
            .where(eq(drivers.id, id)).limit(1)

        if (!driver) {
            return reply.code(404).send({ success: false, message: 'Driver nahi mila' })
        }
        await db.update(drivers)
            .set({ status: 'rejected', rejectionReason: reason })
            .where(eq(drivers.id, id))
        if (docType) {
            await db.update(driverDocuments)
                .set({ status: 'rejected', rejectionReason: reason })
                .where(eq(driverDocuments.driverId, id))
        }
        await sendOTPSms(
            driver.phone,
            `SwiftDrop: Aapka application reject hua. Reason: ${reason}. Dobara upload karein.`
        )

        return { success: true, message: 'Driver rejected', reason }
    })
    fastify.patch('/drivers/:id/suspend', {
        preHandler: [adminAuth]
    }, async (req, reply) => {
        const { id } = req.params
        const { reason } = req.body || {}

        await db.update(drivers)
            .set({ status: 'suspended', isOnline: false, rejectionReason: reason })
            .where(eq(drivers.id, id))

        return { success: true, message: 'Driver suspended' }
    })
    fastify.get('/dashboard', {
        preHandler: [adminAuth]
    }, async (req, reply) => {
        const allDrivers = await db.select().from(drivers)
        const allUsers = await db.select().from(users)

        return {
            success: true,
            stats: {
                totalUsers: allUsers.length,
                totalDrivers: allDrivers.length,
                activeDrivers: allDrivers.filter(d => d.status === 'active').length,
                pendingReview: allDrivers.filter(d => d.status === 'under_review').length,
                rejected: allDrivers.filter(d => d.status === 'rejected').length
            }
        }
    })
}