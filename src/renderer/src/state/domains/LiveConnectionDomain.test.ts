import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TelemetryFrame } from '@shared/types'
import {
  LIVE_ALTITUDE_HISTORY_WINDOW_MS,
  LIVE_TELEMETRY_STALE_TIMEOUT_MS,
  LiveConnectionDomain
} from './LiveConnectionDomain'

function createLiveFrame(timestampMs: number, altitudeM: number): TelemetryFrame {
  return {
    timestampMs,
    latitudeDeg: 26,
    longitudeDeg: -97,
    altitudeM,
    gpsSpeedMps: 12,
    airspeedMps: 14,
    pitchDeg: 1,
    rollDeg: 2,
    yawDeg: 3,
    source: 'live'
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('LiveConnectionDomain live altitude history', () => {
  it('keeps only frames inside the rolling altitude history window', () => {
    const domain = new LiveConnectionDomain()
    try {
      domain.markLatestFrame(createLiveFrame(0, 10))
      domain.markLatestFrame(createLiveFrame(60_000, 20))
      domain.markLatestFrame(createLiveFrame(LIVE_ALTITUDE_HISTORY_WINDOW_MS, 30))
      domain.markLatestFrame(createLiveFrame(LIVE_ALTITUDE_HISTORY_WINDOW_MS + 10_000, 40))

      expect(domain.liveAltitudeHistory.map((frame) => frame.timestampMs)).toEqual([60_000, 120_000, 130_000])
    } finally {
      domain.dispose()
    }
  })

  it('clears live telemetry after the stale timeout elapses', () => {
    vi.useFakeTimers()

    const domain = new LiveConnectionDomain()
    try {
      domain.markLatestFrame(createLiveFrame(10_000, 55))
      expect(domain.latestFrame?.altitudeM).toBe(55)
      expect(domain.liveAltitudeHistory).toHaveLength(1)

      vi.advanceTimersByTime(LIVE_TELEMETRY_STALE_TIMEOUT_MS - 1)
      expect(domain.latestFrame?.altitudeM).toBe(55)
      expect(domain.liveAltitudeHistory).toHaveLength(1)

      vi.advanceTimersByTime(1)
      expect(domain.latestFrame).toBeNull()
      expect(domain.liveAltitudeHistory).toHaveLength(0)
    } finally {
      domain.dispose()
    }
  })

  it('resetLiveTelemetry clears latest frame and history immediately', () => {
    vi.useFakeTimers()

    const domain = new LiveConnectionDomain()
    try {
      domain.markLatestFrame(createLiveFrame(20_000, 90))
      expect(domain.latestFrame).not.toBeNull()

      domain.resetLiveTelemetry()
      expect(domain.latestFrame).toBeNull()
      expect(domain.liveAltitudeHistory).toHaveLength(0)

      vi.advanceTimersByTime(LIVE_TELEMETRY_STALE_TIMEOUT_MS)
      expect(domain.latestFrame).toBeNull()
      expect(domain.liveAltitudeHistory).toHaveLength(0)
    } finally {
      domain.dispose()
    }
  })

  it('beginConnectionAttempt resets live telemetry history', () => {
    const domain = new LiveConnectionDomain()
    try {
      domain.markLatestFrame(createLiveFrame(5_000, 42))
      expect(domain.liveAltitudeHistory).toHaveLength(1)

      domain.beginConnectionAttempt()
      expect(domain.latestFrame).toBeNull()
      expect(domain.liveAltitudeHistory).toHaveLength(0)
    } finally {
      domain.dispose()
    }
  })
})
