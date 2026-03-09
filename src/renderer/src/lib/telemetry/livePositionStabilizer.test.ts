import { describe, expect, it } from 'vitest'
import type { TelemetryFrame } from '@shared/types'
import { haversineDistanceM, offsetLatLonByMeters } from '../wind/windMath'
import { stabilizeLivePosition } from './livePositionStabilizer'

function createFrame(overrides: Partial<TelemetryFrame> = {}): TelemetryFrame {
  return {
    timestampMs: 1_000,
    latitudeDeg: 30.2672,
    longitudeDeg: -97.7431,
    hasPositionFix: true,
    satellitesVisible: 4,
    altitudeM: 200,
    gpsSpeedMps: 0,
    airspeedMps: 0,
    pitchDeg: 0,
    rollDeg: 0,
    yawDeg: 0,
    source: 'live',
    ...overrides
  }
}

describe('stabilizeLivePosition', () => {
  it('passes through the first live frame', () => {
    const frame = createFrame()
    const stabilized = stabilizeLivePosition(null, frame)

    expect(stabilized.latitudeDeg).toBe(frame.latitudeDeg)
    expect(stabilized.longitudeDeg).toBe(frame.longitudeDeg)
    expect(stabilized.altitudeM).toBe(frame.altitudeM)
    expect(stabilized.stationaryLockEngaged).toBe(false)
  })

  it('engages stationary lock and holds small low-sat jitter', () => {
    const initialFrame = createFrame({ timestampMs: 1_000 })
    const initial = stabilizeLivePosition(null, initialFrame)

    const jitter = offsetLatLonByMeters(initial.latitudeDeg, initial.longitudeDeg, 3.5, 2.5)
    const jitterFrame = createFrame({
      timestampMs: 1_100,
      latitudeDeg: jitter.latitudeDeg,
      longitudeDeg: jitter.longitudeDeg
    })
    const stabilized = stabilizeLivePosition(initial, jitterFrame)

    const traveledM = haversineDistanceM(
      initial.latitudeDeg,
      initial.longitudeDeg,
      stabilized.latitudeDeg,
      stabilized.longitudeDeg
    )

    expect(stabilized.stationaryLockEngaged).toBe(true)
    expect(traveledM).toBeLessThan(0.2)
  })

  it('releases stationary lock and starts moving when drift is large', () => {
    const frameA = createFrame({ timestampMs: 1_000 })
    const stateA = stabilizeLivePosition(null, frameA)

    const smallJitter = offsetLatLonByMeters(stateA.latitudeDeg, stateA.longitudeDeg, 3, 1)
    const frameB = createFrame({
      timestampMs: 1_100,
      latitudeDeg: smallJitter.latitudeDeg,
      longitudeDeg: smallJitter.longitudeDeg
    })
    const stateB = stabilizeLivePosition(stateA, frameB)
    expect(stateB.stationaryLockEngaged).toBe(true)

    const bigDrift = offsetLatLonByMeters(stateB.latitudeDeg, stateB.longitudeDeg, 14, 0)
    const frameC = createFrame({
      timestampMs: 1_200,
      latitudeDeg: bigDrift.latitudeDeg,
      longitudeDeg: bigDrift.longitudeDeg
    })
    const stateC = stabilizeLivePosition(stateB, frameC)

    const movedM = haversineDistanceM(stateB.latitudeDeg, stateB.longitudeDeg, stateC.latitudeDeg, stateC.longitudeDeg)
    expect(stateC.stationaryLockEngaged).toBe(false)
    expect(movedM).toBeGreaterThan(0.8)
  })

  it('rejects implausible jumps for degraded stationary GPS', () => {
    const frameA = createFrame({ timestampMs: 1_000 })
    const stateA = stabilizeLivePosition(null, frameA)

    const hugeJump = offsetLatLonByMeters(stateA.latitudeDeg, stateA.longitudeDeg, 120, 0)
    const frameB = createFrame({
      timestampMs: 1_100,
      latitudeDeg: hugeJump.latitudeDeg,
      longitudeDeg: hugeJump.longitudeDeg
    })
    const stateB = stabilizeLivePosition(stateA, frameB)

    const movedM = haversineDistanceM(stateA.latitudeDeg, stateA.longitudeDeg, stateB.latitudeDeg, stateB.longitudeDeg)
    expect(movedM).toBeLessThan(0.2)
  })

  it('tracks movement normally with stronger GPS and motion', () => {
    const frameA = createFrame({
      timestampMs: 1_000,
      satellitesVisible: 9,
      gpsSpeedMps: 12
    })
    const stateA = stabilizeLivePosition(null, frameA)

    const moved = offsetLatLonByMeters(stateA.latitudeDeg, stateA.longitudeDeg, 14, 0)
    const frameB = createFrame({
      timestampMs: 2_000,
      latitudeDeg: moved.latitudeDeg,
      longitudeDeg: moved.longitudeDeg,
      satellitesVisible: 9,
      gpsSpeedMps: 12
    })
    const stateB = stabilizeLivePosition(stateA, frameB)
    const movedM = haversineDistanceM(stateA.latitudeDeg, stateA.longitudeDeg, stateB.latitudeDeg, stateB.longitudeDeg)

    expect(movedM).toBeGreaterThan(3.5)
  })
})
