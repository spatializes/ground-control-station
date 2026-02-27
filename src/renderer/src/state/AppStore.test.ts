import { describe, expect, it } from 'vitest'
import type { TelemetryFrame } from '@shared/types'
import { AppStore } from './AppStore'

const FRAMES: TelemetryFrame[] = [
  {
    timestampMs: 1000,
    latitudeDeg: 26,
    longitudeDeg: -97,
    altitudeM: 0,
    gpsSpeedMps: 1,
    airspeedMps: 2,
    pitchDeg: 0,
    rollDeg: 0,
    yawDeg: 0,
    source: 'csv'
  },
  {
    timestampMs: 2000,
    latitudeDeg: 27,
    longitudeDeg: -96,
    altitudeM: 100,
    gpsSpeedMps: 3,
    airspeedMps: 4,
    pitchDeg: 10,
    rollDeg: 11,
    yawDeg: 12,
    source: 'csv'
  }
]

describe('AppStore playback integration', () => {
  it('plays, advances, and pauses replay', () => {
    const store = new AppStore({ api: null })
    store.setReplayFrames(FRAMES)

    store.playReplay()
    expect(store.playback.isPlaying).toBe(true)

    store.advancePlaybackBy(500)
    expect(store.playback.cursorMs).toBe(500)
    expect(store.currentFrame?.altitudeM).toBeCloseTo(50)

    store.pauseReplay()
    const pausedCursor = store.playback.cursorMs
    store.advancePlaybackBy(400)
    expect(store.playback.cursorMs).toBe(pausedCursor)
  })

  it('scrubs deterministically by progress', () => {
    const store = new AppStore({ api: null })
    store.setReplayFrames(FRAMES)

    store.seekReplayProgress(0.75)
    expect(store.playback.cursorMs).toBeCloseTo(750)
    expect(store.currentReplayIndex).toBe(0)
  })

  it('only allows replay playback when CSV is active source', () => {
    const store = new AppStore({ api: null })
    store.setReplayFrames(FRAMES)

    store.setSelectedSource('serial')
    store.setActiveSource('serial')
    store.playReplay()
    expect(store.playback.isPlaying).toBe(false)

    store.setSelectedSource('csv')
    store.setActiveSource('csv')
    store.playReplay()
    expect(store.playback.isPlaying).toBe(true)
  })
})
