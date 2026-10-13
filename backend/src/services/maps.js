import axios from 'axios'
import { env, isProduction } from '../config/env.js'
import { childLogger } from '../lib/logger.js'

const log = childLogger('maps')
export async function getDistanceAndDuration(pickupLat, pickupLng, dropLat, dropLng) {
    try {
        if (!isProduction && !env.OLA_MAPS_API_KEY) {
            log.debug('no OLA_MAPS_API_KEY, using mock distance')
            return { distanceKm: 5.2, durationMin: 18 }
        }

        const res = await axios.get('https://api.olamaps.io/routing/v1/directions', {
            params: {
                origin: `${pickupLat},${pickupLng}`,
                destination: `${dropLat},${dropLng}`,
                mode: 'two_wheeler',
                api_key: env.OLA_MAPS_API_KEY
            },
            timeout: 10_000
        })
        const route = res.data.routes[0]
        return {
            distanceKm: +(route.legs[0].distance / 1000).toFixed(2),
            durationMin: Math.ceil(route.legs[0].duration / 60)
        }
    } catch (err) {
        log.warn({ err: err.message }, 'ola maps failed, using fallback distance')
        return { distanceKm: 5.0, durationMin: 15 }
    }
}
export function calculateFare(distanceKm, durationMin, surgeMultiplier = 1.0) {
    const BASE = 20
    const PER_KM = 8
    const PER_MIN = 1
    const MIN_FARE = 30
    const COMMISSION = 0.12

    let fare = BASE + (PER_KM * distanceKm) + (PER_MIN * durationMin)
    fare = Math.max(fare, MIN_FARE)
    fare = Math.round(fare * surgeMultiplier)

    const platformCut = Math.round(fare * COMMISSION)
    const driverEarning = fare - platformCut

    return { fare, platformCut, driverEarning }
}
export function calculateParcelFare(distanceKm, weightKg = 1, isCOD = false) {
    const BASE = 30
    const PER_KM = 10
    const PER_KG = 5
    const COD_CHARGE = 10
    const MIN_FARE = 50
    const COMMISSION = 0.08

    let fare = BASE + (PER_KM * distanceKm)

    if (weightKg > 5) fare += (weightKg - 5) * PER_KG
    if (isCOD) fare += COD_CHARGE

    fare = Math.max(fare, MIN_FARE)
    fare = Math.round(fare)

    const platformCut = Math.round(fare * COMMISSION)
    const driverEarning = fare - platformCut

    return { fare, platformCut, driverEarning }
}