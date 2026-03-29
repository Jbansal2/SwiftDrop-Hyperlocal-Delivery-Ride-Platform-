import axios from 'axios'

const OLA_KEY = process.env.OLA_MAPS_API_KEY
export async function getDistanceAndDuration(pickupLat, pickupLng, dropLat, dropLng) {
    try {
        if (process.env.NODE_ENV === 'development' && !OLA_KEY) {
            console.log('[DEV] Using mock distance data')
            return { distanceKm: 5.2, durationMin: 18 }
        }

        const res = await axios.get('https://api.olamaps.io/routing/v1/directions', {
            params: {
                origin: `${pickupLat},${pickupLng}`,
                destination: `${dropLat},${dropLng}`,
                mode: 'two_wheeler',
                api_key: OLA_KEY
            }
        })
        const route = res.data.routes[0]
        return {
            distanceKm: +(route.legs[0].distance / 1000).toFixed(2),
            durationMin: Math.ceil(route.legs[0].duration / 60)
        }
    } catch (err) {
        console.error('Ola Maps error:', err.message)
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