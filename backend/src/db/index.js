import { env } from '../config/env.js'
import { childLogger } from '../lib/logger.js'

const log = childLogger('db')

let db, ping, close, migrateSchema

if (env.DATABASE_URL.startsWith('pglite:')) {
  // in-process postgres (WASM) for tests: real SQL, no server, nothing to install
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const { migrate } = await import('drizzle-orm/pglite/migrator')
  const client = new PGlite()
  db = drizzle(client)
  ping = () => client.query('SELECT 1')
  close = () => client.close()
  migrateSchema = () => migrate(db, { migrationsFolder: new URL('./migrations', import.meta.url).pathname })
} else {
  const { default: postgres } = await import('postgres')
  const { drizzle } = await import('drizzle-orm/postgres-js')
  // postgres-js connects lazily, on the first query
  const client = postgres(env.DATABASE_URL, {
    ssl: env.DATABASE_SSL === 'disable' ? false : env.DATABASE_SSL,
    max: 10
  })
  db = drizzle(client)
  ping = () => client`SELECT 1`
  close = () => client.end({ timeout: 5 })
  migrateSchema = async () => {
    const { migrate } = await import('drizzle-orm/postgres-js/migrator')
    await migrate(db, { migrationsFolder: new URL('./migrations', import.meta.url).pathname })
  }
}

export { db }

export async function testDBConnection() {
  try {
    await ping()
    log.info('database connected')
  } catch (err) {
    log.error({ err }, 'database connection failed')
    throw err
  }
}

export const pingDB = () => ping()
export const closeDB = () => close()
export const runMigrations = () => migrateSchema()
