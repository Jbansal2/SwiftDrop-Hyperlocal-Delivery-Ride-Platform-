import { db } from '../../db/index.js'
import { drivers, driverDocuments } from '../../db/schema/drivers.js'
import { eq, and } from 'drizzle-orm'
import { authenticate, driverAuth } from '../../middleware/authenticate.js'
import { uploadToCloudinary } from '../../config/cloudinary.js'

export default async function driverRoutes(fastify) {
    fastify.post('/register', {
        preHandler: [authenticate],
        schema: {
            body: {
                type: 'object',
                required: ['name', 'vehicleNumber', 'vehicleType'],
                properties: {
                    name: { type: 'string' },
                    vehicleNumber: { type: 'string' },
                    vehicleType: { type: 'string' }
                }
            }
        }
    }, async (req, reply) => {
        const { name, vehicleNumber, vehicleType } = req.body
        const { userId, phone } = req.user
        const existing = await db.select().from(drivers)
            .where(eq(drivers.userId, userId)).limit(1)

        if (existing.length > 0) {
            return reply.code(400).send({
                success: false,
                message: 'Driver already registered hai'
            })
        }

        const [driver] = await db.insert(drivers)
            .values({ userId, name, phone, vehicleNumber, vehicleType })
            .returning()

        return reply.code(201).send({
            success: true,
            message: 'Driver registered! Ab documents upload karo.',
            driver: { id: driver.id, status: driver.status }
        })
    })
    fastify.post('/documents/upload', {
        preHandler: [authenticate],
        schema: {
            body: {
                type: 'object',
                required: ['docType', 'frontImage'],
                properties: {
                    docType: { type: 'string' },
                    docNumber: { type: 'string' },
                    frontImage: { type: 'string' },
                    backImage: { type: 'string' }
                }
            }
        }
    }, async (req, reply) => {
        const { docType, docNumber, frontImage, backImage } = req.body
        const { userId } = req.user
        const [driver] = await db.select().from(drivers)
            .where(eq(drivers.userId, userId)).limit(1)

        if (!driver) {
            return reply.code(404).send({ success: false, message: 'Pehle register karo' })
        }

        const frontUrl = await uploadToCloudinary(frontImage, `drivers/${driver.id}/${docType}_front`)
        const backUrl = backImage ? await uploadToCloudinary(backImage, `drivers/${driver.id}/${docType}_back`) : null
        await db.insert(driverDocuments)
            .values({ driverId: driver.id, docType, docNumber, frontUrl, backUrl })
            .onConflictDoUpdate({
                target: [driverDocuments.driverId, driverDocuments.docType],
                set: { frontUrl, backUrl, status: 'pending', uploadedAt: new Date() }
            })
        const REQUIRED_DOCS = ['aadhaar', 'license', 'rc', 'insurance']
        const uploaded = await db.select()
            .from(driverDocuments)
            .where(eq(driverDocuments.driverId, driver.id))
        const uploadedTypes = uploaded.map(d => d.docType)
        const allDone = REQUIRED_DOCS.every(d => uploadedTypes.includes(d))
        if (allDone) {
            await db.update(drivers)
                .set({ status: 'under_review' })
                .where(eq(drivers.id, driver.id))
        }

        return {
            success: true,
            message: `${docType} uploaded successfully`,
            allDocsUploaded: allDone,
            status: allDone ? 'under_review' : 'docs_pending'
        }
    })
    fastify.get('/status', {
        preHandler: [authenticate]
    }, async (req, reply) => {
        const { userId } = req.user

        const [driver] = await db.select().from(drivers)
            .where(eq(drivers.userId, userId)).limit(1)

        if (!driver) {
            return reply.code(404).send({ success: false, message: 'Driver nahi mila' })
        }
        const docs = await db.select().from(driverDocuments)
            .where(eq(driverDocuments.driverId, driver.id))

        return {
            success: true,
            driver: {
                id: driver.id,
                name: driver.name,
                status: driver.status,
                vehicleType: driver.vehicleType,
                rejectionReason: driver.rejectionReason
            },
            documents: docs.map(d => ({
                type: d.docType,
                status: d.status
            }))
        }
    })
    fastify.patch('/location', {
        preHandler: [authenticate],
        schema: {
            body: {
                type: 'object',
                required: ['lat', 'lng'],
                properties: {
                    lat: { type: 'number' },
                    lng: { type: 'number' }
                }
            }
        }
    }, async (req, reply) => {
        const { lat, lng } = req.body
        const { userId } = req.user
        await redis.setex(
            `driver:location:${userId}`,
            300,
            JSON.stringify({ lat, lng, updatedAt: new Date() })
        )
        await redis.geoadd('drivers:online', lng, lat, userId)

        return { success: true, message: 'Location updated' }
    })
    fastify.patch('/toggle-status', {
        preHandler: [authenticate],
        schema: {
            body: {
                type: 'object',
                required: ['isOnline'],
                properties: { isOnline: { type: 'boolean' } }
            }
        }
    }, async (req, reply) => {
        const { isOnline } = req.body
        const { userId } = req.user
        await db.update(drivers)
            .set({ isOnline })
            .where(eq(drivers.userId, userId))
        if (!isOnline) {
            await redis.zrem('drivers:online', userId)
        }

        return { success: true, isOnline, message: isOnline ? 'Aap online hain!' : 'Aap offline hain' }
    })
    fastify.get('/nearby', { preHandler: [authenticate] }, async (req, reply) => {
        const { lat, lng, radius = 5 } = req.query
        const nearby = await redis.georadius(
            'drivers:online',
            parseFloat(lng),
            parseFloat(lat),
            parseFloat(radius),
            'km',
            'WITHCOORD',
            'WITHDIST',
            'ASC',
            'COUNT', 5
        )

        return {
            success: true,
            count: nearby.length,
            drivers: nearby.map(d => ({
                userId: d[0],
                distanceKm: d[1],
                lng: d[2][0],
                lat: d[2][1]
            }))
        }
    })
}