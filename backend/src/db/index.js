import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import 'dotenv/config'

// Neon connection string
const connectionString = process.env.DATABASE_URL

// PostgreSQL client banao
const client = postgres(connectionString, {
  ssl: 'require', // Neon ke liye zaroori
  max: 10 // max 10 connections
})

// Drizzle ORM instance
export const db = drizzle(client)

// Connection test function
export async function testDBConnection() {
  try {
    await client`SELECT 1`
    console.log('Neon DB connected successfully!')
  } catch (err) {
    console.error('DB connection failed:', err)
    throw err
  }
}
