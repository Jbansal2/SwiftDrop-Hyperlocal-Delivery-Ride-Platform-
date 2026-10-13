import { test } from 'node:test'
import assert from 'node:assert/strict'
import redis from '../src/config/redis.js'
import { locations } from '../src/services/locations.js'

test('nearby maps GEOSEARCH rows to plain objects and passes lon before lat', async (t) => {
  const call = t.mock.method(redis, 'geosearch', async () => [['u1', '0.4123', ['77.2090', '28.6139']]])
  const result = await locations.nearby(28.61, 77.2, 3)
  assert.deepEqual(result, [{ userId: 'u1', distanceKm: 0.4123, lng: 77.209, lat: 28.6139 }])
  const args = call.mock.calls[0].arguments
  assert.deepEqual(args.slice(0, 7), ['drivers:online', 'FROMLONLAT', 77.2, 28.61, 'BYRADIUS', 3, 'km'])
})

test('update stores the last position with a ttl and adds to the geo set', async (t) => {
  const geo = t.mock.method(redis, 'geoadd', async () => 1)
  await locations.update('u9', 28.5, 77.1)
  assert.deepEqual(geo.mock.calls[0].arguments, ['drivers:online', 77.1, 28.5, 'u9'])
  assert.ok((await redis.ttl('driver:location:u9')) > 0)
})
