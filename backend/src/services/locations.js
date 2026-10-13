import redis from '../config/redis.js'

const KEY = 'drivers:online'
const LOCATION_TTL = 300

// one object so tests can stub the geo calls (the in-memory redis has no GEO commands)
export const locations = {
  async update(userId, lat, lng) {
    await redis.setex(`driver:location:${userId}`, LOCATION_TTL, JSON.stringify({ lat, lng, updatedAt: new Date() }))
    await redis.geoadd(KEY, lng, lat, userId)
  },

  async remove(userId) {
    await redis.zrem(KEY, userId)
  },

  // GEOSEARCH replaces GEORADIUS, which is deprecated since redis 6.2
  async nearby(lat, lng, radiusKm, limit = 5) {
    const rows = await redis.geosearch(
      KEY,
      'FROMLONLAT',
      lng,
      lat,
      'BYRADIUS',
      radiusKm,
      'km',
      'ASC',
      'COUNT',
      limit,
      'WITHCOORD',
      'WITHDIST'
    )
    return rows.map(([userId, dist, [lon, la]]) => ({
      userId,
      distanceKm: Number(dist),
      lng: Number(lon),
      lat: Number(la)
    }))
  }
}
