import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculateFare, calculateParcelFare } from '../src/services/maps.js'

test('ride fare = base + per km + per min, split 88/12', () => {
  // 20 + 8*5 + 1*10 = 70
  assert.deepEqual(calculateFare(5, 10), { fare: 70, platformCut: 8, driverEarning: 62 })
})

test('ride fare never drops below the minimum', () => {
  assert.equal(calculateFare(0.1, 1).fare, 30)
})

test('surge multiplies the fare', () => {
  assert.equal(calculateFare(5, 10, 1.5).fare, 105)
})

test('driver earning + platform cut always equals the fare', () => {
  for (const [km, min, surge] of [[1, 3, 1], [7.3, 22, 1.2], [15, 40, 2]]) {
    const { fare, platformCut, driverEarning } = calculateFare(km, min, surge)
    assert.equal(platformCut + driverEarning, fare)
  }
})

test('parcel fare: weight above 5kg is charged per kg', () => {
  // 30 + 10*5 = 80, +3kg*5 = 95
  assert.equal(calculateParcelFare(5, 5).fare, 80)
  assert.equal(calculateParcelFare(5, 8).fare, 95)
})

test('parcel fare: COD adds a flat charge', () => {
  assert.equal(calculateParcelFare(5, 1, true).fare - calculateParcelFare(5, 1, false).fare, 10)
})

test('parcel fare minimum is 50', () => {
  assert.equal(calculateParcelFare(0.5).fare, 50)
})
