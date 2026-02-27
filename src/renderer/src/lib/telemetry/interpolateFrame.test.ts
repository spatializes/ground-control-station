import { describe, expect, it } from 'vitest'
import type { TelemetryFrame } from '@shared/types'
import { findReplayIndexAtCursor, interpolateFrame } from './interpolateFrame'

const FRAMES: TelemetryFrame[] = [
  {
    timestampMs: 1000,
    latitudeDeg: 26,
    longitudeDeg: -97,
    altitudeM: 10,
    gpsSpeedMps: 5,
    airspeedMps: 6,
    pitchDeg: 1,
    rollDeg: 2,
    yawDeg: 350,
    source: 'csv'
  },
  {
    timestampMs: 2000,
    latitudeDeg: 27,
    longitudeDeg: -96,
    altitudeM: 20,
    gpsSpeedMps: 7,
    airspeedMps: 8,
    pitchDeg: 3,
    rollDeg: 4,
    yawDeg: 10,
    source: 'csv'
  }
]

describe('interpolateFrame', () => {
  it('interpolates numeric telemetry at cursor', () => {
    const frame = interpolateFrame(FRAMES, 500)
    expect(frame).not.toBeNull()
    expect(frame?.altitudeM).toBeCloseTo(15)
    expect(frame?.latitudeDeg).toBeCloseTo(26.5)
  })

  it('interpolates yaw through shortest path', () => {
    const frame = interpolateFrame(FRAMES, 500)
    expect(frame).not.toBeNull()
    expect(frame?.yawDeg).toBe(0)
  })

  it('finds index at cursor', () => {
    expect(findReplayIndexAtCursor(FRAMES, 0)).toBe(0)
    expect(findReplayIndexAtCursor(FRAMES, 900)).toBe(0)
    expect(findReplayIndexAtCursor(FRAMES, 1000)).toBe(1)
  })
})
