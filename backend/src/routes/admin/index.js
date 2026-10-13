import { db } from '../../db/index.js'
import { drivers, driverDocuments } from '../../db/schema/drivers.js'
import { users } from '../../db/schema/users.js'
import { eq, and, count } from 'drizzle-orm'
import { adminAuth } from '../../middleware/authenticate.js'
import { locations } from '../../services/locations.js'
import { sendNotificationSms } from '../../utils/sms.js'
import { DOC_TYPES } from '../driver/index.js'
import { idParams } from '../../lib/schemas.js'

export default async function adminRoutes(fastify) {
    fastify.get('/drivers/pending', {
        preHandler: [adminAuth]
    }, async () => {
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
        preHandler: [adminAuth],
        schema: { params: idParams }
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
        preHandler: [adminAuth],
        schema: { params: idParams }
    }, async (req, reply) => {
        const { id } = req.params
        const adminId = req.user.userId
        const [driver] = await db.select().from(drivers)
            .where(eq(drivers.id, id)).limit(1)

        if (!driver) {
            return reply.code(404).send({ success: false, message: 'Driver nahi mila' })
        }
        if (driver.status !== 'under_review') {
            return reply.code(409).send({ success: false, message: `Driver ${driver.status} hai, review mein nahi` })
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
        await sendNotificationSms(
            driver.phone,
            `Congratulations ${driver.name}! Aapka SwiftDrop account activate ho gaya. Ab orders lena shuru karo!`
        )

        return { success: true, message: `Driver ${driver.name} activated!` }
    })
    fastify.patch('/drivers/:id/reject', {
        preHandler: [adminAuth],
        schema: {
            params: idParams,
            body: {
                type: 'object',
                required: ['reason'],
                properties: {
                    reason: { type: 'string', minLength: 3, maxLength: 500 },
                    docType: { type: 'string', enum: DOC_TYPES }
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
            // only the named document, not every document the driver uploaded
            await db.update(driverDocuments)
                .set({ status: 'rejected', rejectionReason: reason })
                .where(and(eq(driverDocuments.driverId, id), eq(driverDocuments.docType, docType)))
        }
        await sendNotificationSms(
            driver.phone,
            `SwiftDrop: Aapka application reject hua. Reason: ${reason}. Dobara upload karein.`
        )

        return { success: true, message: 'Driver rejected', reason }
    })
    fastify.patch('/drivers/:id/suspend', {
        preHandler: [adminAuth],
        schema: {
            params: idParams,
            body: { type: 'object', properties: { reason: { type: 'string', maxLength: 500 } } }
        }
    }, async (req, reply) => {
        const { id } = req.params
        const { reason } = req.body || {}

        const [driver] = await db.update(drivers)
            .set({ status: 'suspended', isOnline: false, rejectionReason: reason })
            .where(eq(drivers.id, id))
            .returning()
        if (!driver) {
            return reply.code(404).send({ success: false, message: 'Driver nahi mila' })
        }
        await locations.remove(driver.userId)

        return { success: true, message: 'Driver suspended' }
    })
    fastify.get('/dashboard', {
        preHandler: [adminAuth]
    }, async () => {
        // counted in postgres instead of loading every row into memory
        const [[{ totalUsers }], byStatus] = await Promise.all([
            db.select({ totalUsers: count() }).from(users),
            db.select({ status: drivers.status, n: count() }).from(drivers).groupBy(drivers.status)
        ])
        const of = (status) => Number(byStatus.find(r => r.status === status)?.n ?? 0)

        return {
            success: true,
            stats: {
                totalUsers: Number(totalUsers),
                totalDrivers: byStatus.reduce((sum, r) => sum + Number(r.n), 0),
                activeDrivers: of('active'),
                pendingReview: of('under_review'),
                rejected: of('rejected'),
                suspended: of('suspended')
            }
        }
    })
}