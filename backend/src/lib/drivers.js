import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { drivers } from '../db/schema/drivers.js'

export async function findDriverByUser(userId) {
  const [driver] = await db.select().from(drivers).where(eq(drivers.userId, userId)).limit(1)
  return driver ?? null
}

// drivers only exist for driver accounts; skip the query for everyone else
export async function driverFor(user) {
  return user?.role === 'driver' ? findDriverByUser(user.userId) : null
}
