import 'dotenv/config'

const isTest = process.env.NODE_ENV === 'test'

// tests run with no real services, so they get throwaway values
const testDefaults = {
  DATABASE_URL: 'pglite:memory',
  REDIS_URL: 'mock',
  JWT_SECRET: 'test-access-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
  RAZORPAY_KEY_ID: 'rzp_test_key',
  RAZORPAY_KEY_SECRET: 'rzp_test_secret'
}

const REQUIRED = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET']

function read(name, fallback) {
  const value = process.env[name]
  if (value !== undefined && value !== '') return value
  if (isTest && testDefaults[name] !== undefined) return testDefaults[name]
  return fallback
}

const missing = REQUIRED.filter((name) => !read(name))
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}. See backend/.env.example`)
}

export const env = Object.freeze({
  NODE_ENV: read('NODE_ENV', 'development'),
  PORT: Number(read('PORT', 3000)),
  LOG_LEVEL: read('LOG_LEVEL', isTest ? 'silent' : 'info'),
  DATABASE_URL: read('DATABASE_URL'),
  // "require" for Neon / hosted Postgres, "disable" for the local compose db
  DATABASE_SSL: read('DATABASE_SSL', 'require'),
  REDIS_URL: read('REDIS_URL', 'redis://localhost:6379'),
  JWT_SECRET: read('JWT_SECRET'),
  JWT_REFRESH_SECRET: read('JWT_REFRESH_SECRET'),
  CORS_ORIGINS: read('CORS_ORIGINS', ''),
  FAST2SMS_API_KEY: read('FAST2SMS_API_KEY', ''),
  OLA_MAPS_API_KEY: read('OLA_MAPS_API_KEY', ''),
  RAZORPAY_KEY_ID: read('RAZORPAY_KEY_ID', ''),
  RAZORPAY_KEY_SECRET: read('RAZORPAY_KEY_SECRET', ''),
  CLOUDINARY_CLOUD_NAME: read('CLOUDINARY_CLOUD_NAME', ''),
  CLOUDINARY_API_KEY: read('CLOUDINARY_API_KEY', ''),
  CLOUDINARY_API_SECRET: read('CLOUDINARY_API_SECRET', '')
})

export const isProduction = env.NODE_ENV === 'production'
export const isDevelopment = env.NODE_ENV === 'development'
