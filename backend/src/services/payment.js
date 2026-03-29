import Razorpay from 'razorpay'
import crypto from 'crypto'

// Razorpay instance banao
export const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
})

// Payment order create karo
export async function createRazorpayOrder(amountRupees, receiptId) {
    const order = await razorpay.orders.create({
        amount: amountRupees * 100, // paise mein — ₹120 = 12000 paise
        currency: 'INR',
        receipt: receiptId,
        payment_capture: 1 
    })
    return order
}

// Payment verify karo — signature match
export function verifyPayment(orderId, paymentId, signature) {
    const body = orderId + '|' + paymentId
    const expected = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest('hex')
    return expected === signature
}