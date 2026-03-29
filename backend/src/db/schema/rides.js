import { pgTable, uuid, varchar, timestamp, pgEnum, decimal, text, integer } from 'drizzle-orm/pg-core'

export const rideStatusEnum = pgEnum('ride_status', [
  'searching', // driver dhundh raha hai
  'accepted', // driver ne accept kiya
  'arrived', // driver pickup pe pahuncha
  'started', // ride shuru
  'completed',// ride complete
  'cancelled' // cancel hua
])

export const rides = pgTable('rides', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  driverId: uuid('driver_id'),

  // Pickup + Drop
  pickupAddress: text('pickup_address').notNull(),
  pickupLat: decimal('pickup_lat', { precision: 10, scale: 8 }).notNull(),
  pickupLng: decimal('pickup_lng', { precision: 11, scale: 8 }).notNull(),
  dropAddress: text('drop_address').notNull(),
  dropLat: decimal('drop_lat', { precision: 10, scale: 8 }).notNull(),
  dropLng: decimal('drop_lng', { precision: 11, scale: 8 }).notNull(),

  // Fare
  estimatedFare: decimal('estimated_fare', { precision: 10, scale: 2 }),
  finalFare: decimal('final_fare', { precision: 10, scale: 2 }),
  platformCut: decimal('platform_cut', { precision: 10, scale: 2 }),
  driverEarning: decimal('driver_earning', { precision: 10, scale: 2 }),
  distanceKm: decimal('distance_km', { precision: 6, scale: 2 }),
  durationMin: integer('duration_min'),
  surgeMultiplier: decimal('surge_multiplier', { precision: 3, scale: 2 }).default('1.00'),

  // OTP
  startOtp: varchar('start_otp', { length: 6 }),

  // Status + timestamps
  status: rideStatusEnum('status').default('searching'),
  cancelReason: text('cancel_reason'),
  acceptedAt: timestamp('accepted_at'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow()
})