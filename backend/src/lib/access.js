// who may see or touch a ride / order. kept pure so it is unit tested directly.

export function isOwner(record, user) {
  return Boolean(record && user && record.userId === user.userId)
}

export function isAssignedDriver(record, driver) {
  return Boolean(record && driver && record.driverId && record.driverId === driver.id)
}

export function canView(record, user, driver) {
  if (!record || !user) return false
  return user.role === 'admin' || isOwner(record, user) || isAssignedDriver(record, driver)
}

// the rider hands the start OTP to the driver in person; the driver must never
// be able to read it from the API, otherwise the OTP check proves nothing
export function redactRideFor(ride, user) {
  if (isOwner(ride, user) || user?.role === 'admin') return ride
  const { startOtp: _startOtp, ...rest } = ride
  return rest
}

export function redactOrderFor(order, user) {
  if (isOwner(order, user) || user?.role === 'admin') return order
  const { pickupOtp: _p, deliveryOtp: _d, ...rest } = order
  return rest
}

export const RIDE_CANCELLABLE = ['searching', 'accepted', 'arrived']
export const ORDER_CANCELLABLE = ['pending', 'accepted']
