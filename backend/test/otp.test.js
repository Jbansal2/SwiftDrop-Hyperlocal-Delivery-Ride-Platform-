import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateOTP, validatePhone, safeEqual } from '../src/utils/otp.js'

test('OTP is always 6 digits', () => {
  for (let i = 0; i < 500; i++) assert.match(generateOTP(), /^[1-9]\d{5}$/)
})

test('OTPs are not repeated in a small sample', () => {
  const seen = new Set(Array.from({ length: 200 }, generateOTP))
  assert.ok(seen.size > 190)
})

test('validatePhone accepts indian mobiles only', () => {
  assert.equal(validatePhone('9876543210'), true)
  assert.equal(validatePhone('6000000000'), true)
  assert.equal(validatePhone('5876543210'), false)
  assert.equal(validatePhone('98765'), false)
  assert.equal(validatePhone(9876543210), false)
  assert.equal(validatePhone(undefined), false)
})

test('safeEqual compares strings without throwing on length or type mismatch', () => {
  assert.equal(safeEqual('123456', '123456'), true)
  assert.equal(safeEqual('123456', '123457'), false)
  assert.equal(safeEqual('123456', '1234567'), false)
  assert.equal(safeEqual(null, '123456'), false)
  assert.equal(safeEqual('123456', undefined), false)
})
