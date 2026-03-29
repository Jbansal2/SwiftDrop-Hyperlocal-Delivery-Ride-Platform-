import { pgTable, uuid, varchar, timestamp, pgEnum, decimal, text, boolean, integer } from 'drizzle-orm/pg-core'

export const orderStatusEnum = pgEnum('order_status', [
  'pending', 
  'accepted', 
  'picked_up', 
  'in_transit', 
  'delivered',
  'cancelled'
])

export const paymentModeEnum = pgEnum('payment_mode', ['prepaid', 'cod'])

export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  driverId: uuid('driver_id'),
  senderName: varchar('sender_name', { length: 100 }).notNull(),
  senderPhone: varchar('sender_phone', { length: 15 }).notNull(),
  receiverName: varchar('receiver_name', { length: 100 }).notNull(),
  receiverPhone: varchar('receiver_phone', { length: 15 }).notNull(),
  pickupAddress: text('pickup_address').notNull(),
  pickupLat: decimal('pickup_lat', { precision: 10, scale: 8 }).notNull(),
  pickupLng: decimal('pickup_lng', { precision: 11, scale: 8 }).notNull(),
  dropAddress: text('drop_address').notNull(),
  dropLat: decimal('drop_lat', { precision: 10, scale: 8 }).notNull(),
  dropLng: decimal('drop_lng', { precision: 11, scale: 8 }).notNull(),
  weightKg: decimal('weight_kg', { precision: 5, scale: 2 }).default('1'),
  description: varchar('description', { length: 200 }),
  paymentMode: paymentModeEnum('payment_mode').default('prepaid'),
  codAmount: decimal('cod_amount', { precision: 10, scale: 2 }).default('0'),
  codCollected: boolean('cod_collected').default(false),
  estimatedFare: decimal('estimated_fare', { precision: 10, scale: 2 }),
  finalFare: decimal('final_fare', { precision: 10, scale: 2 }),
  platformCut: decimal('platform_cut', { precision: 10, scale: 2 }),
  driverEarning: decimal('driver_earning', { precision: 10, scale: 2 }),
  distanceKm: decimal('distance_km', { precision: 6, scale: 2 }),
  pickupOtp: varchar('pickup_otp', { length: 6 }),
  deliveryOtp: varchar('delivery_otp', { length: 6 }),
  status: orderStatusEnum('status').default('pending'),
  cancelReason: text('cancel_reason'),
  acceptedAt: timestamp('accepted_at'),
  pickedUpAt: timestamp('picked_up_at'),
  deliveredAt: timestamp('delivered_at'),
  createdAt: timestamp('created_at').defaultNow()
})