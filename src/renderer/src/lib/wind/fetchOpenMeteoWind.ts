import type { WindSnapshot } from '@shared/types'
import { normalizeDirectionDeg } from './windMath'

interface OpenMeteoCurrentWeatherPayload {
  wind_speed_10m?: unknown
  wind_direction_10m?: unknown
}

interface OpenMeteoPayload {
  current?: OpenMeteoCurrentWeatherPayload
}

function requireFiniteNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Open-Meteo response missing ${fieldName}`)
  }

  return value
}

export function parseOpenMeteoWindPayload(payload: unknown, updatedAtMs = Date.now()): WindSnapshot {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Open-Meteo response was not an object')
  }

  const data = payload as OpenMeteoPayload
  if (!data.current) {
    throw new Error('Open-Meteo response missing current section')
  }

  const speedMps = Math.max(0, requireFiniteNumber(data.current.wind_speed_10m, 'current.wind_speed_10m'))
  const fromDirectionDeg = normalizeDirectionDeg(
    requireFiniteNumber(data.current.wind_direction_10m, 'current.wind_direction_10m')
  )

  return {
    source: 'open-meteo',
    speedMps,
    fromDirectionDeg,
    updatedAtMs
  }
}

export async function fetchOpenMeteoWind(
  latitudeDeg: number,
  longitudeDeg: number,
  fetchImpl: typeof fetch = fetch
): Promise<WindSnapshot> {
  const params = new URLSearchParams({
    latitude: latitudeDeg.toFixed(6),
    longitude: longitudeDeg.toFixed(6),
    current: 'wind_speed_10m,wind_direction_10m',
    wind_speed_unit: 'ms'
  })

  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`
  const response = await fetchImpl(url)

  if (!response.ok) {
    throw new Error(`Open-Meteo request failed (${response.status})`)
  }

  const payload = await response.json()
  return parseOpenMeteoWindPayload(payload)
}
