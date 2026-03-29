import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import 'dotenv/config'
const connectionString = process.env.DATABASE_URL
const client = postgres(connectionString, {
  ssl: 'require',
  max: 10
})
export const db = drizzle(client)
export async function testDBConnection() {
  try {
    await client`SELECT 1`
    console.log('Neon DB connected successfully!')
  } catch (err) {
    console.error('DB connection failed:', err)
    throw err
  }
}
