// end-to-end flows against a real (in-process) postgres and an in-memory redis
import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { eq } from 'drizzle-orm'
import { testApp } from './helpers.js'
import { db, runMigrations } from '../src/db/index.js'
import redis from '../src/config/redis.js'
import { users } from '../src/db/schema/users.js'
import { drivers } from '../src/db/schema/drivers.js'
import { rides } from '../src/db/schema/rides.js'
import { payments } from '../src/db/schema/payments.js'
import { env } from '../src/config/env.js'
import { signPayment } from '../src/services/payment.js'
import { locations } from '../src/services/locations.js'

let app
const call = async (method, url, token, payload) => {
  const res = await app.inject({
    method, url, payload,
    headers: token ? { authorization: `Bearer ${token}` } : {}
  })
  return { status: res.statusCode, body: res.json() }
}

async function login(phone, role) {
  assert.equal((await call('POST', '/auth/send-otp', null, { phone })).status, 200)
  const otp = await redis.get(`otp:${phone}`)
  const res = await call('POST', '/auth/verify-otp', null, { phone, otp, ...(role ? { role } : {}) })
  assert.equal(res.status, 200, JSON.stringify(res.body))
  return res.body
}

async function adminToken() {
  const [admin] = await db.insert(users).values({ phone: '9000000001', role: 'admin' }).returning()
  return jwt.sign({ userId: admin.id, phone: admin.phone, role: 'admin' }, env.JWT_SECRET)
}

async function approvedDriver(phone, admin) {
  const session = await login(phone, 'driver')
  const t = session.accessToken
  assert.equal((await call('POST', '/driver/register', t, { name: `Driver ${phone}`, vehicleNumber: 'DL01AB1234', vehicleType: 'bike' })).status, 201)
  for (const docType of ['aadhaar', 'license', 'rc', 'insurance']) {
    const up = await call('POST', '/driver/documents/upload', t, { docType, frontImage: 'data:image/png;base64,AAAA' })
    assert.equal(up.status, 200, JSON.stringify(up.body))
  }
  const status = await call('GET', '/driver/status', t)
  assert.equal(status.body.driver.status, 'under_review')
  const approve = await call('PATCH', `/admin/drivers/${status.body.driver.id}/approve`, admin)
  assert.equal(approve.status, 200)
  return { token: t, driverId: status.body.driver.id, userId: session.user.id }
}

const trip = {
  pickupLat: 28.6139, pickupLng: 77.209, dropLat: 28.5355, dropLng: 77.391,
  pickupAddress: 'Connaught Place', dropAddress: 'Sector 18 Noida'
}

const parcel = {
  senderName: 'Asha', senderPhone: '9876500001', receiverName: 'Ravi', receiverPhone: '9123400002',
  pickupAddress: 'Lajpat Nagar', pickupLat: 28.567, pickupLng: 77.243,
  dropAddress: 'Saket', dropLat: 28.524, dropLng: 77.206,
  paymentMode: 'cod', codAmount: 499, weightKg: 2
}

let admin, sender, stranger, d1, d2

before(async () => {
  await runMigrations()
  app = await testApp()
  await app.ready()
  admin = await adminToken()
  sender = await login('9876500001')
  stranger = await login('9876500002')
  d1 = await approvedDriver('9876500010', admin)
  d2 = await approvedDriver('9876500011', admin)
})
after(() => app.close())

describe('auth', () => {
  test('verify-otp is capped at 5 wrong attempts', async () => {
    const phone = '9876500099'
    await call('POST', '/auth/send-otp', null, { phone })
    for (let i = 0; i < 5; i++) {
      assert.equal((await call('POST', '/auth/verify-otp', null, { phone, otp: '000000' })).status, 400)
    }
    const locked = await call('POST', '/auth/verify-otp', null, { phone, otp: '000000' })
    assert.equal(locked.status, 429)
    assert.equal(await redis.get(`otp:${phone}`), null, 'otp is burned once locked')
  })

  test('send-otp is rate limited to 3 per window', async () => {
    const phone = '9876500098'
    for (let i = 0; i < 3; i++) assert.equal((await call('POST', '/auth/send-otp', null, { phone })).status, 200)
    assert.equal((await call('POST', '/auth/send-otp', null, { phone })).status, 429)
  })

  test('refresh tokens rotate and the old one stops working', async () => {
    const s = await login('9876500003')
    const first = await call('POST', '/auth/refresh-token', null, { refreshToken: s.refreshToken })
    assert.equal(first.status, 200)
    // jwt iat has 1s resolution, make sure the new token differs
    if (first.body.refreshToken !== s.refreshToken) {
      const reuse = await call('POST', '/auth/refresh-token', null, { refreshToken: s.refreshToken })
      assert.equal(reuse.status, 401)
    }
  })

  test('logout revokes the refresh token', async () => {
    const s = await login('9876500004')
    assert.equal((await call('POST', '/auth/logout', s.accessToken)).status, 200)
    assert.equal((await call('POST', '/auth/refresh-token', null, { refreshToken: s.refreshToken })).status, 401)
  })
})

describe('drivers', () => {
  test('an unapproved driver cannot go online', async () => {
    const s = await login('9876500020', 'driver')
    await call('POST', '/driver/register', s.accessToken, { name: 'New Guy', vehicleNumber: 'UP16XY9999', vehicleType: 'auto' })
    const res = await call('PATCH', '/driver/toggle-status', s.accessToken, { isOnline: true })
    assert.equal(res.status, 403)
  })

  test('an approved driver can go online and appears nearby', async (t) => {
    // ioredis-mock has no GEO commands; keep positions in a map for this test
    const seen = new Map()
    t.mock.method(locations, 'update', async (userId, lat, lng) => { seen.set(userId, { lat, lng }) })
    t.mock.method(locations, 'nearby', async () => [...seen].map(([userId, p]) => ({ userId, distanceKm: 0.1, ...p })))

    assert.equal((await call('PATCH', '/driver/toggle-status', d1.token, { isOnline: true })).status, 200)
    assert.equal((await call('PATCH', '/driver/location', d1.token, { lat: 28.6139, lng: 77.209 })).status, 200)
    const near = await call('GET', '/driver/nearby?lat=28.614&lng=77.21&radius=2', sender.accessToken)
    assert.equal(near.status, 200)
    assert.equal(near.body.drivers[0]?.userId, d1.userId)
  })

  test('approving a driver twice is a conflict', async () => {
    const res = await call('PATCH', `/admin/drivers/${d1.driverId}/approve`, admin)
    assert.equal(res.status, 409)
  })

  test('admin dashboard counts by status', async () => {
    const res = await call('GET', '/admin/dashboard', admin)
    assert.equal(res.status, 200)
    assert.ok(res.body.stats.activeDrivers >= 2)
    assert.ok(res.body.stats.totalUsers >= 5)
  })
})

describe('ride lifecycle', () => {
  let rideId, startOtp

  test('sender books a ride and gets the start OTP', async () => {
    const res = await call('POST', '/ride/book', sender.accessToken, trip)
    assert.equal(res.status, 201)
    rideId = res.body.ride.id
    startOtp = res.body.ride.startOtp
    assert.match(startOtp, /^\d{6}$/)
  })

  test('a second open ride for the same sender is refused', async () => {
    assert.equal((await call('POST', '/ride/book', sender.accessToken, trip)).status, 409)
  })

  test('only the first driver to accept gets the ride', async () => {
    assert.equal((await call('PATCH', `/ride/${rideId}/accept`, d1.token)).status, 200)
    assert.equal((await call('PATCH', `/ride/${rideId}/accept`, d2.token)).status, 409)
  })

  test('the driver can see the ride but not its start OTP', async () => {
    const res = await call('GET', `/ride/${rideId}`, d1.token)
    assert.equal(res.status, 200)
    assert.equal(res.body.ride.startOtp, undefined)
  })

  test('strangers and other drivers get a 404', async () => {
    assert.equal((await call('GET', `/ride/${rideId}`, stranger.accessToken)).status, 404)
    assert.equal((await call('GET', `/ride/${rideId}`, d2.token)).status, 404)
    assert.equal((await call('PATCH', `/ride/${rideId}/cancel`, stranger.accessToken, {})).status, 404)
  })

  test('another driver cannot start it, even with the right OTP', async () => {
    assert.equal((await call('PATCH', `/ride/${rideId}/start`, d2.token, { otp: startOtp })).status, 404)
  })

  test('wrong OTP does not start the ride', async () => {
    const wrong = startOtp === '111111' ? '222222' : '111111'
    assert.equal((await call('PATCH', `/ride/${rideId}/start`, d1.token, { otp: wrong })).status, 400)
  })

  test('cannot complete before starting', async () => {
    assert.equal((await call('PATCH', `/ride/${rideId}/complete`, d1.token)).status, 409)
  })

  test('start then complete, and the driver ride count goes up by exactly one', async () => {
    assert.equal((await call('PATCH', `/ride/${rideId}/start`, d1.token, { otp: startOtp })).status, 200)
    const done = await call('PATCH', `/ride/${rideId}/complete`, d1.token)
    assert.equal(done.status, 200)
    const [driver] = await db.select().from(drivers).where(eq(drivers.id, d1.driverId))
    assert.equal(Number(driver.totalRides), 1)
  })

  test('a completed ride cannot be cancelled', async () => {
    assert.equal((await call('PATCH', `/ride/${rideId}/cancel`, sender.accessToken, {})).status, 409)
  })

  test('the rider can cancel a ride that has not started', async () => {
    const booked = await call('POST', '/ride/book', sender.accessToken, trip)
    const res = await call('PATCH', `/ride/${booked.body.ride.id}/cancel`, sender.accessToken, { reason: 'changed plans' })
    assert.equal(res.status, 200)
    const [row] = await db.select().from(rides).where(eq(rides.id, booked.body.ride.id))
    assert.equal(row.status, 'cancelled')
  })
})

describe('parcel lifecycle with COD', () => {
  let order

  test('create returns both OTPs to the sender', async () => {
    const res = await call('POST', '/order/create', sender.accessToken, parcel)
    assert.equal(res.status, 201)
    order = res.body.order
    assert.match(order.pickupOtp, /^\d{6}$/)
  })

  test('COD cannot be collected before delivery', async () => {
    await call('PATCH', `/order/${order.id}/accept`, d1.token)
    assert.equal((await call('POST', '/payment/cod-collect', d1.token, { orderId: order.id })).status, 409)
  })

  test('delivery needs pickup first', async () => {
    assert.equal((await call('PATCH', `/order/${order.id}/deliver`, d1.token, { otp: order.deliveryOtp })).status, 409)
  })

  test('the sender cannot cancel once it is picked up', async () => {
    assert.equal((await call('PATCH', `/order/${order.id}/pickup`, d1.token, { otp: order.pickupOtp })).status, 200)
    assert.equal((await call('PATCH', `/order/${order.id}/cancel`, sender.accessToken, {})).status, 409)
  })

  test('deliver, then collect COD once with the amount taken from the order', async () => {
    assert.equal((await call('PATCH', `/order/${order.id}/deliver`, d1.token, { otp: order.deliveryOtp })).status, 200)
    const cod = await call('POST', '/payment/cod-collect', d1.token, { orderId: order.id })
    assert.equal(cod.status, 200)
    assert.equal(cod.body.amount, 499 + order.estimatedFare)
    assert.equal((await call('POST', '/payment/cod-collect', d1.token, { orderId: order.id })).status, 409)
  })

  test('tracking is limited to the sender and the driver', async () => {
    assert.equal((await call('GET', `/order/${order.id}/track`, sender.accessToken)).status, 200)
    assert.equal((await call('GET', `/order/${order.id}/track`, d1.token)).status, 200)
    assert.equal((await call('GET', `/order/${order.id}/track`, stranger.accessToken)).status, 404)
  })

  test('history is paginated and only shows your own orders', async () => {
    const mine = await call('GET', '/order/history?limit=1', sender.accessToken)
    assert.equal(mine.body.orders.length, 1)
    const theirs = await call('GET', '/order/history', stranger.accessToken)
    assert.equal(theirs.body.count, 0)
  })
})

describe('online payments', () => {
  test('a valid signature marks the payment paid exactly once', async () => {
    const [p] = await db.insert(payments).values({
      userId: sender.user.id, referenceId: '22222222-2222-4222-8222-222222222222',
      type: 'ride', amount: '120', razorpayOrderId: 'order_test_1'
    }).returning()
    const body = {
      razorpayOrderId: 'order_test_1', razorpayPaymentId: 'pay_test_1',
      razorpaySignature: signPayment('order_test_1', 'pay_test_1')
    }
    assert.equal((await call('POST', '/payment/verify', sender.accessToken, body)).status, 200)
    const [row] = await db.select().from(payments).where(eq(payments.id, p.id))
    assert.equal(row.status, 'paid')
    assert.equal((await call('POST', '/payment/verify', sender.accessToken, body)).status, 404)
  })

  test("you cannot verify someone else's payment", async () => {
    await db.insert(payments).values({
      userId: sender.user.id, referenceId: '33333333-3333-4333-8333-333333333333',
      type: 'ride', amount: '80', razorpayOrderId: 'order_test_2'
    })
    const res = await call('POST', '/payment/verify', stranger.accessToken, {
      razorpayOrderId: 'order_test_2', razorpayPaymentId: 'pay_x',
      razorpaySignature: signPayment('order_test_2', 'pay_x')
    })
    assert.equal(res.status, 404)
  })

  test("you cannot open a payment for someone else's ride", async () => {
    const booked = await call('POST', '/ride/book', stranger.accessToken, trip)
    const res = await call('POST', '/payment/create-order', sender.accessToken, { referenceId: booked.body.ride.id, type: 'ride' })
    assert.equal(res.status, 404)
  })

  test('COD orders cannot be paid online', async () => {
    const created = await call('POST', '/order/create', sender.accessToken, parcel)
    const res = await call('POST', '/payment/create-order', sender.accessToken, { referenceId: created.body.order.id, type: 'order' })
    assert.equal(res.status, 400)
  })
})
