import { pgTable, uuid, varchar, boolean, timestamp, pgEnum, decimal, text } from 'drizzle-orm/pg-core'

export const driverStatusEnum = pgEnum('driver_status', [
  'registered', 'docs_uploaded', 'under_review', 'active', 'rejected', 'suspended'
])

export const vehicleTypeEnum = pgEnum('vehicle_type', ['bike', 'auto'])

export const drivers = pgTable('drivers', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 15 }).unique().notNull(),
  status: driverStatusEnum('status').default('registered').notNull(),
  vehicleNumber: varchar('vehicle_number', { length: 20 }),
  vehicleType: vehicleTypeEnum('vehicle_type').default('bike'),
  isOnline: boolean('is_online').default(false),
  rating: decimal('rating', { precision: 3, scale: 2 }).default('5.00'),
  totalRides: decimal('total_rides').default('0'),
  rejectionReason: text('rejection_reason'),
  verifiedBy: uuid('verified_by'),
  verifiedAt: timestamp('verified_at'),
  createdAt: timestamp('created_at').defaultNow()
})

export const docTypeEnum = pgEnum('doc_type', [
  'aadhaar', 'license', 'rc', 'insurance', 'pan', 'selfie'
])

export const docStatusEnum = pgEnum('doc_status', ['pending', 'approved', 'rejected'])

export const driverDocuments = pgTable('driver_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  driverId: uuid('driver_id').notNull(),
  docType: docTypeEnum('doc_type').notNull(),
  docNumber: varchar('doc_number', { length: 50 }),
  frontUrl: text('front_url').notNull(),
  backUrl: text('back_url'),
  status: docStatusEnum('status').default('pending'),
  rejectionReason: text('rejection_reason'),
  uploadedAt: timestamp('uploaded_at').defaultNow()
})