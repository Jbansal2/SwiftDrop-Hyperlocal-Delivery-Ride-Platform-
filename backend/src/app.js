import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import 'dotenv/config'
import { testDBConnection } from './db/index.js'
import authRoutes from './routes/auth/index.js'
import driverRoutes from './routes/driver/index.js'
import adminRoutes from './routes/admin/index.js'
import rideRoutes from './routes/ride/index.js'
import orderRoutes from './routes/order/index.js'
import paymentRoutes from './routes/payment/index.js'

// Fastify instance banao
const app = Fastify({
  logger: true 
})

// Plugins register karo
await app.register(cors, {
  origin: true 
})

await app.register(jwt, {
  secret: process.env.JWT_SECRET
})
await app.register(authRoutes, { prefix: '/auth' })
await app.register(driverRoutes, { prefix: '/driver' })
await app.register(adminRoutes, { prefix: '/admin' })
await app.register(rideRoutes, { prefix: '/ride' })
await app.register(orderRoutes, { prefix: '/order' })
await app.register(paymentRoutes, { prefix: '/payment' })

// Health check route 
app.get('/', async () => {
  return {
    status: 'ok',
    app: 'SwiftDrop Backend',
    version: '1.0.0'
  }
})

// Server start
const start = async () => {
  try {
    await testDBConnection()

    await app.listen({
      port: process.env.PORT || 3000,
      host: '0.0.0.0'
    })
    console.log('SwiftDrop server running on port 3000')
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

start()