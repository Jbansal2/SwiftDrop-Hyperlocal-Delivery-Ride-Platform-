import { db } from '../../db/index.js'
import { drivers, driverDocuments } from '../../db/schema/drivers.js'
import { users } from '../../db/schema/users.js'
import { eq } from 'drizzle-orm'
import { adminAuth } from '../../middleware/authenticate.js'
import { sendOTPSms } from '../../utils/sms.js'

export default async function adminRoutes(fastify) {

    // ═══ ROUTE 1: pending drivers list ═══
    // GET /admin/drivers/pending
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

    // ═══ ROUTE 2: driver documents dekho ═══
    // GET /admin/drivers/:id/documents
    fastify.get('/drivers/:id/documents', {
        preHandler: [adminAuth]
    }, async (req, reply) => {
        const { id } = req.params

        // Driver info lo
        const [driver] = await db.select().from(drivers)
            .where(eq(drivers.id, id)).limit(1)

        if (!driver) {
            return reply.code(404).send({ success: false, message: 'Driver nahi mila' })
        }

        // Documents lo
        const docs = await db.select().from(driverDocuments)
            .where(eq(driverDocuments.driverId, id))

        return { success: true, driver, documents: docs }
    })

    // ═══ ROUTE 3: approve driver ═══
    // PATCH /admin/drivers/:id/approve
    fastify.patch('/drivers/:id/approve', {
        preHandler: [adminAuth]
    }, async (req, reply) => {
        const { id } = req.params
        const adminId = req.user.userId

        // Driver exist karta hai?
        const [driver] = await db.select().from(drivers)
            .where(eq(drivers.id, id)).limit(1)

        if (!driver) {
            return reply.code(404).send({ success: false, message: 'Driver nahi mila' })
        }

        // Driver status active karo
        await db.update(drivers)
            .set({
                status: 'active',
                verifiedBy: adminId,
                verifiedAt: new Date()
            })
            .where(eq(drivers.id, id))

        // Sab documents approved mark karo
        await db.update(driverDocuments)
            .set({ status: 'approved' })
            .where(eq(driverDocuments.driverId, id))

        // Driver ko SMS bhejo
        await sendOTPSms(
            driver.phone,
            `Congratulations ${driver.name}! Aapka SwiftDrop account activate ho gaya. Ab orders lena shuru karo!`
        )

        return { success: true, message: `Driver ${driver.name} activated!` }
    })

    // ═══ ROUTE 4: reject driver ═══
    // PATCH /admin/drivers/:id/reject
    fastify.patch('/drivers/:id/reject', {
        preHandler: [adminAuth],
        schema: {
            body: {
                type: 'object',
                required: ['reason'],
                properties: {
                    reason: { type: 'string' },
                    docType: { type: 'string' } // kaunsa doc reject hua
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

        // Status rejected karo + reason save karo
        await db.update(drivers)
            .set({ status: 'rejected', rejectionReason: reason })
            .where(eq(drivers.id, id))

        // Specific doc reject karo agar bataya
        if (docType) {
            await db.update(driverDocuments)
                .set({ status: 'rejected', rejectionReason: reason })
                .where(eq(driverDocuments.driverId, id))
        }

        // Driver ko reason ke saath SMS bhejo
        await sendOTPSms(
            driver.phone,
            `SwiftDrop: Aapka application reject hua. Reason: ${reason}. Dobara upload karein.`
        )

        return { success: true, message: 'Driver rejected', reason }
    })

    // ═══ ROUTE 5: suspend driver ═══
    // PATCH /admin/drivers/:id/suspend
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

    // ═══ ROUTE 6: dashboard stats ═══
    // GET /admin/dashboard
    fastify.get('/dashboard', {
        preHandler: [adminAuth]
    }, async (req, reply) => {
        // Sab drivers count karo by status
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

} // closing bracket