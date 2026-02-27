import { describe, expect, it } from 'vitest'
import type { TelemetryFrame } from '@shared/types'
import { buildAltitudeProfile } from './buildAltitudeProfile'

const FRAMES: TelemetryFrame[] = [
  {
    timestampMs: 1,
    latitudeDeg: 0,
    longitudeDeg: 0,
    altitudeM: 10,
    gpsSpeedMps: 0,
    airspeedMps: 0,
    pitchDeg: 0,
    rollDeg: 0,
    yawDeg: 0,
    source: 'csv'
  },
  {
    timestampMs: 2,
    latitudeDeg: 0,
    longitudeDeg: 0,
    altitudeM: 20,
    gpsSpeedMps: 0,
    airspeedMps: 0,
    pitchDeg: 0,
    rollDeg: 0,
    yawDeg: 0,
    source: 'csv'
  },
  {
    timestampMs: 3,
    latitudeDeg: 0,
    longitudeDeg: 0,
    altitudeM: 15,
    gpsSpeedMps: 0,
    airspeedMps: 0,
    pitchDeg: 0,
    rollDeg: 0,
    yawDeg: 0,
    source: 'csv'
  }
]

describe('buildAltitudeProfile', () => {
  it('creates path geometry and marker values', () => {
    const profile = buildAltitudeProfile(FRAMES, 1, 300, 100)
    expect(profile).not.toBeNull()
    expect(profile?.path.startsWith('M')).toBe(true)
    expect(profile?.minAltitudeM).toBe(10)
    expect(profile?.maxAltitudeM).toBe(20)
  })
})
