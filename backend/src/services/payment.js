import Razorpay from 'razorpay'
import crypto from 'crypto'
export const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
})
export async function createRazorpayOrder(amountRupees, receiptId) {
    const order = await razorpay.orders.create({
        amount: amountRupees * 100,
        currency: 'INR',
        receipt: receiptId,
        payment_capture: 1 
    })
    return order
}
export function verifyPayment(orderId, paymentId, signature) {
    const body = orderId + '|' + paymentId
    const expected = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest('hex')
    return expected === signature
}