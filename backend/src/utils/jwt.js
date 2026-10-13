import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

export function generateAccessToken(payload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '15m' })
}

export function generateRefreshToken(payload) {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: '30d' })
}

export function verifyToken(token, secret) {
  try {
    return jwt.verify(token, secret)
  } catch {
    return null
  }
}

export const verifyAccessToken = (token) => verifyToken(token, env.JWT_SECRET)
export const verifyRefreshToken = (token) => verifyToken(token, env.JWT_REFRESH_SECRET)
