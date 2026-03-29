import axios from 'axios'

const OLA_KEY = process.env.OLA_MAPS_API_KEY

// Ola Maps se distance + duration lo
export async function getDistanceAndDuration(pickupLat, pickupLng, dropLat, dropLng) {
    try {
        // Dev mode mein mock data return karo
        if (process.env.NODE_ENV === 'development' && !OLA_KEY) {
            console.log('[DEV] Using mock distance data')
            return { distanceKm: 5.2, durationMin: 18 }
        }

        const res = await axios.get('https://api.olamaps.io/routing/v1/directions', {
            params: {
                origin: `${pickupLat},${pickupLng}`,
                destination: `${dropLat},${dropLng}`,
                mode: 'two_wheeler', // bike route!
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
        return { distanceKm: 5.0, durationMin: 15 } // fallback
    }
}

// Fare calculate karo
export function calculateFare(distanceKm, durationMin, surgeMultiplier = 1.0) {
    const BASE = 20 // base fare ₹20
    const PER_KM = 8 // ₹8 per km
    const PER_MIN = 1 // ₹1 per min
    const MIN_FARE = 30 // minimum ₹30
    const COMMISSION = 0.12 // 12% platform cut

    let fare = BASE + (PER_KM * distanceKm) + (PER_MIN * durationMin)
    fare = Math.max(fare, MIN_FARE)
    fare = Math.round(fare * surgeMultiplier)

    const platformCut = Math.round(fare * COMMISSION)
    const driverEarning = fare - platformCut

    return { fare, platformCut, driverEarning }
}

// Parcel fare calculate karo — ride se alag
export function calculateParcelFare(distanceKm, weightKg = 1, isCOD = false) {
    const BASE = 30 // base fare ₹30
    const PER_KM = 10 // ₹10 per km
    const PER_KG = 5 // ₹5 per kg above 5kg
    const COD_CHARGE = 10 // ₹10 flat COD charge
    const MIN_FARE = 50 // minimum ₹50
    const COMMISSION = 0.08 // 8% platform cut

    let fare = BASE + (PER_KM * distanceKm)

    // 5kg se zyada weight charge
    if (weightKg > 5) fare += (weightKg - 5) * PER_KG

    // COD charge
    if (isCOD) fare += COD_CHARGE

    fare = Math.max(fare, MIN_FARE)
    fare = Math.round(fare)

    const platformCut = Math.round(fare * COMMISSION)
    const driverEarning = fare - platformCut

    return { fare, platformCut, driverEarning }
}