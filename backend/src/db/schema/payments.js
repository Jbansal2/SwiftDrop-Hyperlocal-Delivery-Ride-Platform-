import { pgTable, uuid, varchar, decimal, timestamp, pgEnum, text } from 'drizzle-orm/pg-core'

export const paymentStatusEnum = pgEnum('payment_status', [
  'created', 'paid', 'failed', 'refunded'
])

export const paymentTypeEnum = pgEnum('payment_type', ['ride', 'order'])

export const payments = pgTable('payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  referenceId: uuid('reference_id').notNull(),
  type: paymentTypeEnum('type').notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  razorpayOrderId: varchar('razorpay_order_id', { length: 100 }),
  razorpayPaymentId: varchar('razorpay_payment_id', { length: 100 }),
  status: paymentStatusEnum('status').default('created'),
  createdAt: timestamp('created_at').defaultNow()
})