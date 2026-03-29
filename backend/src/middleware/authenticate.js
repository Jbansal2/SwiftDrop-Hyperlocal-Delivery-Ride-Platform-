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

    // Bearer hata ke sirf token lo
    const token = authHeader.split(' ')[1]

    // Token verify karo
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

// Admin only middleware
export async function adminAuth(req, reply) {
  // Pehle normal auth check karo
  await authenticate(req, reply)

  // Phir admin role check karo
  if (req.user?.role !== 'admin') {
    return reply.code(403).send({
      success: false,
      message: 'Admin access only'
    })
  }
}

// Driver only middleware
export async function driverAuth(req, reply) {
  await authenticate(req, reply)

  if (req.user?.role !== 'driver') {
    return reply.code(403).send({
      success: false,
      message: 'Driver access only'
    })
  }
}