import type { TelemetryFrame } from '@shared/types'
import { clampYaw } from '../telemetry/clampYaw'

interface HeaderIndex {
  timestampMs: number
  latitudeDeg: number
  longitudeDeg: number
  altitudeM: number
  gpsSpeedMps: number
  airspeedMps: number
  pitchDeg: number
  rollDeg: number
  yawDeg: number
}

function toNumber(value: string): number | null {
  const parsedValue = Number(value)
  return Number.isFinite(parsedValue) ? parsedValue : null
}

function normalizeHeader(column: string): string {
  return column.replace(/^\uFEFF/, '').trim()
}

function mapHeaders(headerRow: string): HeaderIndex {
  const headers = headerRow.split(',').map((column) => normalizeHeader(column))

  const requiredIndex = (headerName: string): number => {
    const index = headers.indexOf(headerName)
    if (index < 0) {
      throw new Error(`Missing required CSV column: ${headerName}`)
    }
    return index
  }

  return {
    timestampMs: requiredIndex('TimeStampMS'),
    latitudeDeg: requiredIndex('GPS.Lat'),
    longitudeDeg: requiredIndex('GPS.Lng'),
    altitudeM: requiredIndex('GPS.Alt'),
    gpsSpeedMps: requiredIndex('GPS.Spd'),
    airspeedMps: requiredIndex('ARSP.Airspeed'),
    pitchDeg: requiredIndex('ATT.Pitch'),
    rollDeg: requiredIndex('ATT.Roll'),
    yawDeg: requiredIndex('ATT.Yaw')
  }
}

export function parseCsv(raw: string): TelemetryFrame[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length < 2) {
    return []
  }

  const header = mapHeaders(lines[0])
  const frames: TelemetryFrame[] = []

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const values = lines[lineIndex].split(',')

    const timestampMs = toNumber(values[header.timestampMs])
    const latitudeDeg = toNumber(values[header.latitudeDeg])
    const longitudeDeg = toNumber(values[header.longitudeDeg])
    const altitudeM = toNumber(values[header.altitudeM])
    const gpsSpeedMps = toNumber(values[header.gpsSpeedMps])
    const airspeedMps = toNumber(values[header.airspeedMps])
    const pitchDeg = toNumber(values[header.pitchDeg])
    const rollDeg = toNumber(values[header.rollDeg])
    const yawDeg = toNumber(values[header.yawDeg])

    if (
      timestampMs === null ||
      latitudeDeg === null ||
      longitudeDeg === null ||
      altitudeM === null ||
      gpsSpeedMps === null ||
      airspeedMps === null ||
      pitchDeg === null ||
      rollDeg === null ||
      yawDeg === null
    ) {
      continue
    }

    frames.push({
      timestampMs,
      latitudeDeg,
      longitudeDeg,
      altitudeM,
      gpsSpeedMps,
      airspeedMps,
      pitchDeg,
      rollDeg,
      yawDeg: clampYaw(yawDeg),
      source: 'csv'
    })
  }

  return frames.sort((left, right) => left.timestampMs - right.timestampMs)
}
