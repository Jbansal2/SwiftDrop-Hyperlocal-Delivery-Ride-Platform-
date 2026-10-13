import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toPaise, signPayment, verifyPayment } from '../src/services/payment.js'

test('toPaise rounds float noise away', () => {
  assert.equal(toPaise(45.5), 4550)
  assert.equal(toPaise(0.29), 29) // 0.29 * 100 = 28.999999999999996
  assert.equal(toPaise('120.10'), 12010)
})

test('a correct razorpay signature verifies', () => {
  const sig = signPayment('order_1', 'pay_1', 'secret')
  assert.equal(verifyPayment('order_1', 'pay_1', sig, 'secret'), true)
})

test('a tampered payment id or signature fails', () => {
  const sig = signPayment('order_1', 'pay_1', 'secret')
  assert.equal(verifyPayment('order_1', 'pay_2', sig, 'secret'), false)
  assert.equal(verifyPayment('order_1', 'pay_1', sig.slice(0, -1) + '0', 'secret'), false)
  assert.equal(verifyPayment('order_1', 'pay_1', 'short', 'secret'), false)
})

test('verification fails closed when no secret is configured', () => {
  const sig = signPayment('order_1', 'pay_1', 'secret')
  assert.equal(verifyPayment('order_1', 'pay_1', sig, ''), false)
})
