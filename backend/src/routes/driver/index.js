import { db } from '../../db/index.js'
import { drivers, driverDocuments } from '../../db/schema/drivers.js'
import { eq } from 'drizzle-orm'
import { authenticate, driverAuth } from '../../middleware/authenticate.js'
import { uploadToCloudinary } from '../../config/cloudinary.js'
import { locations } from '../../services/locations.js'

export const DOC_TYPES = ['aadhaar', 'license', 'rc', 'insurance', 'pan', 'selfie']
export const REQUIRED_DOCS = ['aadhaar', 'license', 'rc', 'insurance']

export default async function driverRoutes(fastify) {
  fastify.post(
    '/register',
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['name', 'vehicleNumber', 'vehicleType'],
          properties: {
            name: { type: 'string', minLength: 2, maxLength: 100 },
            vehicleNumber: { type: 'string', minLength: 4, maxLength: 20 },
            vehicleType: { type: 'string', enum: ['bike', 'auto'] }
          }
        }
      }
    },
    async (req, reply) => {
      const { name, vehicleNumber, vehicleType } = req.body
      const { userId, phone } = req.user
      const existing = await db.select().from(drivers).where(eq(drivers.userId, userId)).limit(1)

      if (existing.length > 0) {
        return reply.code(400).send({
          success: false,
          message: 'Driver already registered hai'
        })
      }

      const [driver] = await db.insert(drivers).values({ userId, name, phone, vehicleNumber, vehicleType }).returning()

      return reply.code(201).send({
        success: true,
        message: 'Driver registered! Ab documents upload karo.',
        driver: { id: driver.id, status: driver.status }
      })
    }
  )
  fastify.post(
    '/documents/upload',
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['docType', 'frontImage'],
          properties: {
            docType: { type: 'string', enum: DOC_TYPES },
            docNumber: { type: 'string', maxLength: 50 },
            frontImage: { type: 'string', minLength: 1 },
            backImage: { type: 'string' }
          }
        }
      }
    },
    async (req, reply) => {
      const { docType, docNumber, frontImage, backImage } = req.body
      const { userId } = req.user
      const [driver] = await db.select().from(drivers).where(eq(drivers.userId, userId)).limit(1)

      if (!driver) {
        return reply.code(404).send({ success: false, message: 'Pehle register karo' })
      }
      if (driver.status === 'suspended') {
        return reply.code(403).send({ success: false, message: 'Account suspended hai' })
      }

      const frontUrl = await uploadToCloudinary(frontImage, `drivers/${driver.id}/${docType}_front`)
      const backUrl = backImage ? await uploadToCloudinary(backImage, `drivers/${driver.id}/${docType}_back`) : null
      await db
        .insert(driverDocuments)
        .values({ driverId: driver.id, docType, docNumber, frontUrl, backUrl })
        .onConflictDoUpdate({
          target: [driverDocuments.driverId, driverDocuments.docType],
          set: { frontUrl, backUrl, status: 'pending', uploadedAt: new Date() }
        })
      const uploaded = await db.select().from(driverDocuments).where(eq(driverDocuments.driverId, driver.id))
      const uploadedTypes = uploaded.map((d) => d.docType)
      const allDone = REQUIRED_DOCS.every((d) => uploadedTypes.includes(d))
      // active / suspended drivers re-uploading a doc must not drop back into review
      if (allDone && ['registered', 'docs_uploaded', 'rejected'].includes(driver.status)) {
        await db.update(drivers).set({ status: 'under_review' }).where(eq(drivers.id, driver.id))
      }

      return {
        success: true,
        message: `${docType} uploaded successfully`,
        allDocsUploaded: allDone,
        status: allDone ? 'under_review' : 'docs_pending'
      }
    }
  )
  fastify.get(
    '/status',
    {
      preHandler: [authenticate]
    },
    async (req, reply) => {
      const { userId } = req.user

      const [driver] = await db.select().from(drivers).where(eq(drivers.userId, userId)).limit(1)

      if (!driver) {
        return reply.code(404).send({ success: false, message: 'Driver nahi mila' })
      }
      const docs = await db.select().from(driverDocuments).where(eq(driverDocuments.driverId, driver.id))

      return {
        success: true,
        driver: {
          id: driver.id,
          name: driver.name,
          status: driver.status,
          vehicleType: driver.vehicleType,
          rejectionReason: driver.rejectionReason
        },
        documents: docs.map((d) => ({
          type: d.docType,
          status: d.status
        }))
      }
    }
  )
  fastify.patch(
    '/location',
    {
      preHandler: [driverAuth],
      schema: {
        body: {
          type: 'object',
          required: ['lat', 'lng'],
          properties: {
            lat: { type: 'number', minimum: -90, maximum: 90 },
            lng: { type: 'number', minimum: -180, maximum: 180 }
          }
        }
      }
    },
    async (req) => {
      const { lat, lng } = req.body
      const { userId } = req.user
      await locations.update(userId, lat, lng)

      return { success: true, message: 'Location updated' }
    }
  )
  fastify.patch(
    '/toggle-status',
    {
      preHandler: [driverAuth],
      schema: {
        body: {
          type: 'object',
          required: ['isOnline'],
          properties: { isOnline: { type: 'boolean' } }
        }
      }
    },
    async (req, reply) => {
      const { isOnline } = req.body
      const { userId } = req.user
      const [driver] = await db.select().from(drivers).where(eq(drivers.userId, userId)).limit(1)
      if (!driver) {
        return reply.code(404).send({ success: false, message: 'Driver nahi mila' })
      }
      if (isOnline && driver.status !== 'active') {
        return reply.code(403).send({ success: false, message: 'Approval ke baad hi online ho sakte ho' })
      }
      await db.update(drivers).set({ isOnline }).where(eq(drivers.userId, userId))
      if (!isOnline) {
        await locations.remove(userId)
      }

      return { success: true, isOnline, message: isOnline ? 'Aap online hain!' : 'Aap offline hain' }
    }
  )
  fastify.get(
    '/nearby',
    {
      preHandler: [authenticate],
      schema: {
        querystring: {
          type: 'object',
          required: ['lat', 'lng'],
          properties: {
            lat: { type: 'number', minimum: -90, maximum: 90 },
            lng: { type: 'number', minimum: -180, maximum: 180 },
            radius: { type: 'number', minimum: 0.1, maximum: 25, default: 5 }
          }
        }
      }
    },
    async (req) => {
      const { lat, lng, radius } = req.query
      const nearby = await locations.nearby(lat, lng, radius)
      return { success: true, count: nearby.length, drivers: nearby }
    }
  )
}
