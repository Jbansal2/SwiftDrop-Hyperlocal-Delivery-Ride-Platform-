import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canView, isOwner, isAssignedDriver, redactRideFor, redactOrderFor } from '../src/lib/access.js'

const rider = { userId: 'u1', role: 'sender' }
const stranger = { userId: 'u2', role: 'sender' }
const driverUser = { userId: 'u3', role: 'driver' }
const admin = { userId: 'u4', role: 'admin' }
const driver = { id: 'd1', userId: 'u3' }
const otherDriver = { id: 'd2', userId: 'u5' }
const ride = { id: 'r1', userId: 'u1', driverId: 'd1', startOtp: '123456', status: 'accepted' }

test('owner, assigned driver and admin can view a ride', () => {
  assert.equal(canView(ride, rider, null), true)
  assert.equal(canView(ride, driverUser, driver), true)
  assert.equal(canView(ride, admin, null), true)
})

test('other users and other drivers cannot view a ride', () => {
  assert.equal(canView(ride, stranger, null), false)
  assert.equal(canView(ride, { userId: 'u5', role: 'driver' }, otherDriver), false)
  assert.equal(canView(undefined, rider, null), false)
})

test('an unassigned ride is not visible to a driver via a null driverId match', () => {
  assert.equal(isAssignedDriver({ ...ride, driverId: null }, { id: null }), false)
})

test('isOwner needs both sides', () => {
  assert.equal(isOwner(ride, rider), true)
  assert.equal(isOwner(ride, null), false)
})

test('the driver never sees the start OTP, the rider does', () => {
  assert.equal(redactRideFor(ride, driverUser).startOtp, undefined)
  assert.equal(redactRideFor(ride, rider).startOtp, '123456')
})

test('order OTPs are hidden from the driver', () => {
  const order = { id: 'o1', userId: 'u1', driverId: 'd1', pickupOtp: '111111', deliveryOtp: '222222' }
  const seen = redactOrderFor(order, driverUser)
  assert.equal(seen.pickupOtp, undefined)
  assert.equal(seen.deliveryOtp, undefined)
  assert.equal(redactOrderFor(order, rider).deliveryOtp, '222222')
})
