const EARTH_RADIUS_M = 6_371_000

export interface WindFlowVector {
  east: number
  north: number
}

export function normalizeDirectionDeg(directionDeg: number): number {
  const normalized = directionDeg % 360
  return normalized >= 0 ? normalized : normalized + 360
}

export function toFlowVector(fromDirectionDeg: number): WindFlowVector {
  const flowHeadingRad = ((normalizeDirectionDeg(fromDirectionDeg) + 180) * Math.PI) / 180

  return {
    east: Math.sin(flowHeadingRad),
    north: Math.cos(flowHeadingRad)
  }
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

export function haversineDistanceM(
  latitudeStartDeg: number,
  longitudeStartDeg: number,
  latitudeEndDeg: number,
  longitudeEndDeg: number
): number {
  const latitudeStartRad = toRadians(latitudeStartDeg)
  const latitudeEndRad = toRadians(latitudeEndDeg)
  const deltaLatitudeRad = toRadians(latitudeEndDeg - latitudeStartDeg)
  const deltaLongitudeRad = toRadians(longitudeEndDeg - longitudeStartDeg)

  const sinLatitude = Math.sin(deltaLatitudeRad / 2)
  const sinLongitude = Math.sin(deltaLongitudeRad / 2)

  const a =
    sinLatitude * sinLatitude +
    Math.cos(latitudeStartRad) * Math.cos(latitudeEndRad) * sinLongitude * sinLongitude

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_M * c
}

export interface LatLonPoint {
  latitudeDeg: number
  longitudeDeg: number
}

function normalizeLongitudeDeg(longitudeDeg: number): number {
  const normalized = ((longitudeDeg + 180) % 360 + 360) % 360 - 180
  return normalized === -180 ? 180 : normalized
}

export function offsetLatLonByMeters(
  latitudeDeg: number,
  longitudeDeg: number,
  eastMeters: number,
  northMeters: number
): LatLonPoint {
  const latitudeRad = toRadians(latitudeDeg)
  const deltaLatitudeDeg = (northMeters / EARTH_RADIUS_M) * (180 / Math.PI)
  const cosLatitude = Math.max(1e-6, Math.cos(latitudeRad))
  const deltaLongitudeDeg = (eastMeters / (EARTH_RADIUS_M * cosLatitude)) * (180 / Math.PI)

  return {
    latitudeDeg: Math.max(-85, Math.min(85, latitudeDeg + deltaLatitudeDeg)),
    longitudeDeg: normalizeLongitudeDeg(longitudeDeg + deltaLongitudeDeg)
  }
}
