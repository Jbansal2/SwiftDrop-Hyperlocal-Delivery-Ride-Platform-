import { verifyAccessToken } from '../utils/jwt.js'

function deny(reply, code, message) {
  // returning the reply tells fastify the hook already answered, so the chain stops
  return reply.code(code).send({ success: false, message })
}

export async function authenticate(req, reply) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return deny(reply, 401, 'Token Not Found')
  }

  const decoded = verifyAccessToken(authHeader.slice('Bearer '.length).trim())
  if (!decoded) {
    return deny(reply, 401, 'Token invalid')
  }
  req.user = decoded
}

export function requireRole(...roles) {
  return async function roleGuard(req, reply) {
    await authenticate(req, reply)
    // authenticate already sent a 401; sending a 403 on top used to crash
    // with "Reply was already sent"
    if (reply.sent) return reply
    if (!roles.includes(req.user?.role)) {
      return deny(reply, 403, `${roles.join(' / ')} access only`)
    }
  }
}

export const adminAuth = requireRole('admin')
export const driverAuth = requireRole('driver')
