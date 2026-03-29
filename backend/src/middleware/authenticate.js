import { verifyToken } from '../utils/jwt.js'

export async function authenticate(req, reply) {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({
        success: false,
        message: 'Token Not Found'
      })
    }
    const token = authHeader.split(' ')[1]
    const decoded = verifyToken(token, process.env.JWT_SECRET)

    if (!decoded) {
      return reply.code(401).send({
        success: false,
        message: 'Token invalid'
      })
    }
    req.user = decoded

  } catch (err) {
    return reply.code(401).send({
      success: false,
      message: 'Authentication failed'
    })
  }
}
export async function adminAuth(req, reply) {
  await authenticate(req, reply)
  if (req.user?.role !== 'admin') {
    return reply.code(403).send({
      success: false,
      message: 'Admin access only'
    })
  }
}
export async function driverAuth(req, reply) {
  await authenticate(req, reply)

  if (req.user?.role !== 'driver') {
    return reply.code(403).send({
      success: false,
      message: 'Driver access only'
    })
  }
}