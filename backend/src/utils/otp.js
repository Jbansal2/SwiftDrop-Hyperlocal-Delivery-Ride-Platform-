import crypto from 'node:crypto'

// crypto.randomInt, not Math.random: OTPs gate logins and ride/parcel handover
export function generateOTP() {
  return crypto.randomInt(100000, 1000000).toString()
}

export function validatePhone(phone) {
  return typeof phone === 'string' && /^[6-9]\d{9}$/.test(phone)
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}
