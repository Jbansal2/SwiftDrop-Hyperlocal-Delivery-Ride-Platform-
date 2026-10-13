import Razorpay from 'razorpay'
import crypto from 'node:crypto'
import { env } from '../config/env.js'
import { safeEqual } from '../utils/otp.js'

let client
function razorpay() {
  // created on first use so the app boots (and tests run) without razorpay keys
  client ??= new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET })
  return client
}

// razorpay wants integer paise; 45.5 * 100 is 4550.000000000001 in floats
export function toPaise(amountRupees) {
  return Math.round(Number(amountRupees) * 100)
}

export async function createRazorpayOrder(amountRupees, receiptId) {
  return razorpay().orders.create({
    amount: toPaise(amountRupees),
    currency: 'INR',
    receipt: receiptId,
    payment_capture: 1
  })
}

export function signPayment(orderId, paymentId, secret = env.RAZORPAY_KEY_SECRET) {
  return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex')
}

export function verifyPayment(orderId, paymentId, signature, secret = env.RAZORPAY_KEY_SECRET) {
  if (!secret) return false
  return safeEqual(signPayment(orderId, paymentId, secret), signature)
}
