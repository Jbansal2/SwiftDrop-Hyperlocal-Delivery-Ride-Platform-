import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { testApp, bearer, tokenFor } from './helpers.js'

let app
before(async () => {
  app = await testApp()
  app.get('/__boom', async () => {
    throw new Error('db password is hunter2')
  })
  await app.ready()
})
after(() => app.close())

const inject = (opts) => app.inject(opts)

test('GET / reports the app version', async () => {
  const res = await inject({ url: '/' })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().status, 'ok')
})

test('/health is 200 when every dependency answers', async () => {
  const res = await inject({ url: '/health' })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.json().checks, { db: 'ok', redis: 'ok' })
})

test('/health is 503 and names the failing dependency', async () => {
  const sick = await testApp({
    healthChecks: {
      db: async () => {},
      redis: async () => {
        throw new Error('down')
      }
    }
  })
  const res = await sick.inject({ url: '/health' })
  assert.equal(res.statusCode, 503)
  assert.deepEqual(res.json().checks, { db: 'ok', redis: 'down' })
  await sick.close()
})

test('unknown routes get a JSON 404', async () => {
  const res = await inject({ url: '/nope' })
  assert.equal(res.statusCode, 404)
  assert.equal(res.json().success, false)
})

test('500s hide the internal message and return a request id', async () => {
  const res = await inject({ url: '/__boom', headers: { 'x-request-id': 'req-42' } })
  assert.equal(res.statusCode, 500)
  assert.equal(res.json().message, 'Internal server error')
  assert.equal(res.json().requestId, 'req-42')
  assert.doesNotMatch(res.body, /hunter2/)
})

test('/auth/me without a token is 401', async () => {
  const res = await inject({ url: '/auth/me' })
  assert.equal(res.statusCode, 401)
  assert.equal(res.json().message, 'Token Not Found')
})

test('/auth/me with a forged token is 401', async () => {
  const forged = jwt.sign({ userId: 'x', role: 'admin' }, 'not-the-secret')
  const res = await inject({ url: '/auth/me', headers: { authorization: `Bearer ${forged}` } })
  assert.equal(res.statusCode, 401)
})

test('/auth/me with an expired token is 401', async () => {
  const expired = tokenFor('sender', { exp: Math.floor(Date.now() / 1000) - 10 })
  const res = await inject({ url: '/auth/me', headers: { authorization: `Bearer ${expired}` } })
  assert.equal(res.statusCode, 401)
})

test('/auth/me with a valid token returns the user', async () => {
  const res = await inject({ url: '/auth/me', headers: bearer('sender') })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json().user.role, 'sender')
})

test('admin routes: no token is a single clean 401 (used to double-reply)', async () => {
  const res = await inject({ url: '/admin/dashboard' })
  assert.equal(res.statusCode, 401)
})

test('admin routes reject senders and drivers with 403', async () => {
  for (const role of ['sender', 'driver']) {
    const res = await inject({ url: '/admin/dashboard', headers: bearer(role) })
    assert.equal(res.statusCode, 403, role)
  }
})

test('driver-only routes reject a sender', async () => {
  const res = await inject({
    method: 'PATCH',
    url: '/driver/location',
    headers: bearer('sender'),
    payload: { lat: 28.6, lng: 77.2 }
  })
  assert.equal(res.statusCode, 403)
})

test('cod-collect is driver only', async () => {
  const res = await inject({
    method: 'POST',
    url: '/payment/cod-collect',
    headers: bearer('sender'),
    payload: { orderId: '11111111-1111-4111-8111-111111111111' }
  })
  assert.equal(res.statusCode, 403)
})

test('login cannot self-assign the admin role', async () => {
  const res = await inject({
    method: 'POST',
    url: '/auth/verify-otp',
    payload: { phone: '9876543210', otp: '123456', role: 'admin' }
  })
  assert.equal(res.statusCode, 400)
})

test('send-otp validates the phone number before touching redis', async () => {
  const res = await inject({ method: 'POST', url: '/auth/send-otp', payload: { phone: '12345' } })
  assert.equal(res.statusCode, 400)
})

test('ride ids must be uuids', async () => {
  const res = await inject({ url: '/ride/not-a-uuid', headers: bearer('sender') })
  assert.equal(res.statusCode, 400)
})

test('ride estimate rejects out-of-range coordinates', async () => {
  const res = await inject({
    method: 'POST',
    url: '/ride/estimate',
    headers: bearer('sender'),
    payload: { pickupLat: 200, pickupLng: 77.2, dropLat: 28.5, dropLng: 77.1 }
  })
  assert.equal(res.statusCode, 400)
})

test('order create rejects an unknown payment mode', async () => {
  const res = await inject({
    method: 'POST',
    url: '/order/create',
    headers: bearer('sender'),
    payload: {
      senderName: 'Asha',
      senderPhone: '9876543210',
      receiverName: 'Ravi',
      receiverPhone: '9123456789',
      pickupAddress: 'Sector 15',
      pickupLat: 28.6,
      pickupLng: 77.2,
      dropAddress: 'Sector 62',
      dropLat: 28.62,
      dropLng: 77.36,
      paymentMode: 'crypto'
    }
  })
  assert.equal(res.statusCode, 400)
})

test('payment type must be ride or order', async () => {
  const res = await inject({
    method: 'POST',
    url: '/payment/create-order',
    headers: bearer('sender'),
    payload: { referenceId: '11111111-1111-4111-8111-111111111111', type: 'wallet' }
  })
  assert.equal(res.statusCode, 400)
})

test('a forged razorpay signature is rejected before any db write', async () => {
  const res = await inject({
    method: 'POST',
    url: '/payment/verify',
    headers: bearer('sender'),
    payload: { razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1', razorpaySignature: 'f'.repeat(64) }
  })
  assert.equal(res.statusCode, 400)
})
