import { describe, expect, it, vi } from 'vitest'
import type { GcsApi, TelemetryFrame, WindSnapshot } from '@shared/types'
import { AppStore } from './AppStore'
import { LIVE_TELEMETRY_STALE_TIMEOUT_MS } from './domains/LiveConnectionDomain'

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

function createLiveFrame(timestampMs: number, altitudeM: number): TelemetryFrame {
  return {
    timestampMs,
    latitudeDeg: 26.1,
    longitudeDeg: -97.4,
    altitudeM,
    gpsSpeedMps: 15,
    airspeedMps: 16,
    pitchDeg: 1,
    rollDeg: 2,
    yawDeg: 3,
    source: 'live'
  }
}

async function waitForCondition(condition: () => boolean, timeoutMs = 500): Promise<void> {
  const startedAt = Date.now()

  while (!condition()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Condition did not become true in time')
    }

    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

async function expectNoUnhandledRejection(run: () => void, waitMs = 0): Promise<void> {
  const unhandled: unknown[] = []
  const handler = (reason: unknown): void => {
    unhandled.push(reason)
  }

  process.on('unhandledRejection', handler)

  try {
    run()
    await new Promise((resolve) => setTimeout(resolve, waitMs))
    expect(unhandled).toHaveLength(0)
  } finally {
    process.off('unhandledRejection', handler)
  }
}

describe('AppStore playback integration', () => {
  it('plays, advances, and pauses replay', () => {
    const store = new AppStore({ api: null })
    try {
      store.setReplayFrames(FRAMES)
      store.setSpeedMultiplier(1)

      store.playReplay()
      expect(store.playback.isPlaying).toBe(true)

      store.advancePlaybackBy(500)
      expect(store.playback.cursorMs).toBe(500)
      expect(store.currentFrame?.altitudeM).toBeCloseTo(50)

      store.pauseReplay()
      const pausedCursor = store.playback.cursorMs
      store.advancePlaybackBy(400)
      expect(store.playback.cursorMs).toBe(pausedCursor)
    } finally {
      store.dispose()
    }
  })

  it('scrubs deterministically by progress', () => {
    const store = new AppStore({ api: null })
    try {
      store.setReplayFrames(FRAMES)

      store.seekReplayProgress(0.75)
      expect(store.playback.cursorMs).toBeCloseTo(750)
      expect(store.currentReplayIndex).toBe(0)
    } finally {
      store.dispose()
    }
  })

  it('only allows replay playback when CSV is active source', () => {
    const store = new AppStore({ api: null })
    try {
      store.setReplayFrames(FRAMES)

      store.setSelectedSource('serial')
      store.setActiveSource('serial')
      store.playReplay()
      expect(store.playback.isPlaying).toBe(false)

      store.setSelectedSource('csv')
      store.setActiveSource('csv')
      store.playReplay()
      expect(store.playback.isPlaying).toBe(true)
    } finally {
      store.dispose()
    }
  })

  it('detaches replay frame when active source switches to live and no live frame exists', () => {
    const store = new AppStore({ api: null })
    try {
      store.setReplayFrames(FRAMES)
      expect(store.currentFrame).not.toBeNull()

      store.setActiveSource('serial')
      expect(store.currentFrame).toBeNull()
    } finally {
      store.dispose()
    }
  })

  it('keeps CSV altitude panel behavior unchanged', () => {
    const store = new AppStore({ api: null })
    try {
      store.setReplayFrames(FRAMES)

      const panel = store.altitudePanelModel
      expect(panel.title).toBe('Altitude Profile')
      expect(panel.xAxisLabel).toBe('Mission Time')
      expect(panel.isInteractive).toBe(true)
      expect(panel.frames).toBe(store.playback.frames)
      expect(panel.currentProgress).toBe(store.replayProgress)
      expect(panel.currentAltitudeM).toBe(FRAMES[0].altitudeM)
    } finally {
      store.dispose()
    }
  })

  it('uses live altitude history for altitude panel when live source is active', () => {
    const store = new AppStore({ api: null })
    try {
      store.setReplayFrames(FRAMES)
      store.setActiveSource('serial')

      const liveFrameA = createLiveFrame(10_000, 140)
      const liveFrameB = createLiveFrame(11_000, 148)
      store.live.markLatestFrame(liveFrameA)
      store.live.markLatestFrame(liveFrameB)

      const panel = store.altitudePanelModel
      expect(panel.title).toBe('Live Altitude Trend')
      expect(panel.xAxisLabel).toBe('Recent Time')
      expect(panel.isInteractive).toBe(false)
      expect(panel.frames).toEqual([liveFrameA, liveFrameB])
      expect(panel.currentProgress).toBe(1)
      expect(panel.currentAltitudeM).toBe(148)
    } finally {
      store.dispose()
    }
  })

  it('returns live altitude panel to waiting state after telemetry goes stale', async () => {
    vi.useFakeTimers()

    const store = new AppStore({ api: null })
    try {
      store.setActiveSource('serial')
      store.live.markLatestFrame(createLiveFrame(30_000, 170))
      store.live.markLatestFrame(createLiveFrame(31_000, 172))
      expect(store.altitudePanelModel.frames).toHaveLength(2)

      await vi.advanceTimersByTimeAsync(LIVE_TELEMETRY_STALE_TIMEOUT_MS)

      const panel = store.altitudePanelModel
      expect(panel.frames).toHaveLength(0)
      expect(panel.currentAltitudeM).toBeNull()
      expect(panel.emptyMessage).toBe('Waiting for live telemetry...')
    } finally {
      store.dispose()
      vi.useRealTimers()
    }
  })

  it('prefers USB-like serial ports over macOS Bluetooth incoming port by default', async () => {
    const api: GcsApi = {
      listSerialPorts: vi.fn(async () => [
        { path: '/dev/tty.Bluetooth-Incoming-Port' },
        { path: '/dev/cu.usbmodem1201' }
      ]),
      connectSerial: vi.fn(async () => undefined),
      connectWebSocket: vi.fn(async () => undefined),
      disconnectLive: vi.fn(async () => undefined),
      onLiveTelemetry: vi.fn(() => () => undefined),
      onConnectionStatus: vi.fn(() => () => undefined)
    }

    const store = new AppStore({ api })
    try {
      await store.refreshSerialPorts()
      expect(store.live.serialPath).toBe('/dev/cu.usbmodem1201')
    } finally {
      store.dispose()
    }
  })

  it('defaults serial USB connections to 115200 baud', () => {
    const store = new AppStore({ api: null })
    try {
      expect(store.live.serialBaudRate).toBe(115200)
    } finally {
      store.dispose()
    }
  })

  it('refreshes serial ports before connecting so a newly attached USB device can be used', async () => {
    const api: GcsApi = {
      listSerialPorts: vi.fn(async () => [{ path: '/dev/cu.usbmodem1201' }]),
      connectSerial: vi.fn(async () => undefined),
      connectWebSocket: vi.fn(async () => undefined),
      disconnectLive: vi.fn(async () => undefined),
      onLiveTelemetry: vi.fn(() => () => undefined),
      onConnectionStatus: vi.fn(() => () => undefined)
    }

    const store = new AppStore({ api })
    try {
      await store.connectSerial()

      expect(api.listSerialPorts).toHaveBeenCalled()
      expect(api.connectSerial).toHaveBeenCalledWith({
        path: '/dev/cu.usbmodem1201',
        baudRate: 115200
      })
    } finally {
      store.dispose()
    }
  })

  it('marks serial link connected when connect RPC resolves even if no status event arrives', async () => {
    const api: GcsApi = {
      listSerialPorts: vi.fn(async () => [{ path: '/dev/cu.usbmodem1201' }]),
      connectSerial: vi.fn(async () => undefined),
      connectWebSocket: vi.fn(async () => undefined),
      disconnectLive: vi.fn(async () => undefined),
      onLiveTelemetry: vi.fn(() => () => undefined),
      onConnectionStatus: vi.fn(() => () => undefined)
    }

    const store = new AppStore({ api })
    try {
      await store.connectSerial()

      expect(store.live.connectionStatus.state).toBe('connected')
      expect(store.live.connectionStatus.transport).toBe('serial')
      expect(store.live.connectionStatus.mavlinkState).toBe('none')
      expect(store.live.connectionStatus.message).toContain('waiting for MAVLink packets')
    } finally {
      store.dispose()
    }
  })

  it('fails serial connection with timeout instead of hanging forever', async () => {
    vi.useFakeTimers()

    const api: GcsApi = {
      listSerialPorts: vi.fn(async () => [{ path: 'COM4' }]),
      connectSerial: vi.fn(async () => new Promise<void>(() => undefined)),
      connectWebSocket: vi.fn(async () => undefined),
      disconnectLive: vi.fn(async () => undefined),
      onLiveTelemetry: vi.fn(() => () => undefined),
      onConnectionStatus: vi.fn(() => () => undefined)
    }

    const store = new AppStore({ api, connectTimeoutMs: 50 })
    try {
      store.setSerialPath('COM4')
      const connectPromise = store.connectSerial()
      await vi.advanceTimersByTimeAsync(80)
      await connectPromise

      expect(store.live.connectionStatus.state).toBe('error')
      expect(store.live.connectionStatus.message).toContain('timed out')
    } finally {
      store.dispose()
      vi.useRealTimers()
    }
  })

  it('switches to live wind mode and uses fetched wind snapshot', async () => {
    let nowMs = 100_000
    const windSnapshot: WindSnapshot = {
      source: 'open-meteo',
      fromDirectionDeg: 145,
      speedMps: 6.3,
      updatedAtMs: nowMs
    }
    const windFetcher = vi.fn(async () => windSnapshot)

    const store = new AppStore({
      api: null,
      windFetcher,
      now: () => nowMs
    })

    try {
      store.setReplayFrames(FRAMES)
      store.setWindMode('live')

      await waitForCondition(() => store.wind.fetchState === 'ready')

      expect(windFetcher).toHaveBeenCalledTimes(1)
      expect(store.effectiveWind.fromDirectionDeg).toBe(145)
      expect(store.effectiveWind.speedMps).toBe(6.3)
      expect(store.effectiveWindLabel).toContain('145')
    } finally {
      store.dispose()
    }
  })

  it('falls back to synthetic wind when first live fetch fails', async () => {
    const windFetcher = vi.fn(async () => {
      throw new Error('network down')
    })

    const store = new AppStore({
      api: null,
      windFetcher
    })

    try {
      store.setReplayFrames(FRAMES)
      store.setWindMode('live')

      await waitForCondition(() => store.wind.fetchState === 'error')

      expect(store.effectiveWind.fromDirectionDeg).toBe(store.wind.synthetic.fromDirectionDeg)
      expect(store.effectiveWind.speedMps).toBe(store.wind.synthetic.speedMps)
      expect(store.windStatusText).toContain('using synthetic')
    } finally {
      store.dispose()
    }
  })

  it('throttles live wind refreshes unless time interval or movement threshold is reached', async () => {
    let nowMs = 20_000
    const windFetcher = vi.fn(async (latitudeDeg: number, longitudeDeg: number): Promise<WindSnapshot> => {
      return {
        source: 'open-meteo',
        fromDirectionDeg: 180,
        speedMps: 8,
        updatedAtMs: nowMs + latitudeDeg + longitudeDeg
      }
    })

    const store = new AppStore({
      api: null,
      windFetcher,
      now: () => nowMs
    })

    try {
      store.setReplayFrames(FRAMES)
      store.setWindMode('live')

      await waitForCondition(() => store.wind.fetchState === 'ready')
      expect(windFetcher).toHaveBeenCalledTimes(1)

      await store.refreshLiveWindForFrame(store.currentFrame, false)
      expect(windFetcher).toHaveBeenCalledTimes(1)

      nowMs += 46_000
      await store.refreshLiveWindForFrame(store.currentFrame, false)
      expect(windFetcher).toHaveBeenCalledTimes(2)
    } finally {
      store.dispose()
    }
  })

  it('skips live wind fetches until position fix is available', async () => {
    const windFetcher = vi.fn(async (): Promise<WindSnapshot> => {
      return {
        source: 'open-meteo',
        fromDirectionDeg: 180,
        speedMps: 8,
        updatedAtMs: 1234
      }
    })

    const store = new AppStore({
      api: null,
      windFetcher
    })

    try {
      store.setWindMode('live')

      await store.refreshLiveWindForFrame(
        {
          timestampMs: 1,
          latitudeDeg: 0,
          longitudeDeg: 0,
          hasPositionFix: false,
          altitudeM: 12,
          gpsSpeedMps: 1,
          airspeedMps: 2,
          pitchDeg: 3,
          rollDeg: 4,
          yawDeg: 5,
          source: 'live'
        },
        true
      )

      expect(windFetcher).not.toHaveBeenCalled()
    } finally {
      store.dispose()
    }
  })

  it('captures serial port refresh failures without rejecting', async () => {
    const api: GcsApi = {
      listSerialPorts: vi.fn(async () => {
        throw new Error('scan failed')
      }),
      connectSerial: vi.fn(async () => undefined),
      connectWebSocket: vi.fn(async () => undefined),
      disconnectLive: vi.fn(async () => undefined),
      onLiveTelemetry: vi.fn(() => () => undefined),
      onConnectionStatus: vi.fn(() => () => undefined)
    }

    const store = new AppStore({ api })
    try {
      await expect(store.refreshSerialPorts()).resolves.toBeUndefined()
      expect(store.live.connectionStatus.state).toBe('error')
      expect(store.live.connectionStatus.transport).toBe('serial')
      expect(store.live.connectionStatus.message).toContain('scan failed')
    } finally {
      store.dispose()
    }
  })

  it('keeps live source active and reports error when disconnect fails', async () => {
    const api: GcsApi = {
      listSerialPorts: vi.fn(async () => [{ path: 'COM4' }]),
      connectSerial: vi.fn(async () => undefined),
      connectWebSocket: vi.fn(async () => undefined),
      disconnectLive: vi.fn(async () => {
        throw new Error('disconnect failed')
      }),
      onLiveTelemetry: vi.fn(() => () => undefined),
      onConnectionStatus: vi.fn(() => () => undefined)
    }

    const store = new AppStore({ api })
    try {
      store.setActiveSource('serial')
      await expect(store.disconnectLive()).resolves.toBeUndefined()
      expect(store.ui.activeSource).toBe('serial')
      expect(store.live.connectionStatus.state).toBe('error')
      expect(store.live.connectionStatus.transport).toBe('serial')
      expect(store.live.connectionStatus.message).toContain('disconnect failed')
    } finally {
      store.dispose()
    }
  })

  it('keeps current live source when switching to CSV and disconnect fails', async () => {
    const api: GcsApi = {
      listSerialPorts: vi.fn(async () => [{ path: 'COM4' }]),
      connectSerial: vi.fn(async () => undefined),
      connectWebSocket: vi.fn(async () => undefined),
      disconnectLive: vi.fn(async () => {
        throw new Error('disconnect failed')
      }),
      onLiveTelemetry: vi.fn(() => () => undefined),
      onConnectionStatus: vi.fn(() => () => undefined)
    }

    const store = new AppStore({ api })
    try {
      store.setActiveSource('serial')
      store.setSelectedSource('csv')

      await expect(store.activateSelectedSource()).resolves.toBeUndefined()

      expect(store.ui.activeSource).toBe('serial')
      expect(store.live.connectionStatus.state).toBe('error')
      expect(store.live.connectionStatus.transport).toBe('serial')
    } finally {
      store.dispose()
    }
  })

  it('captures connect failures during source activation without rejecting', async () => {
    const api: GcsApi = {
      listSerialPorts: vi.fn(async () => [{ path: 'COM4' }]),
      connectSerial: vi.fn(async () => {
        throw new Error('serial open denied')
      }),
      connectWebSocket: vi.fn(async () => undefined),
      disconnectLive: vi.fn(async () => undefined),
      onLiveTelemetry: vi.fn(() => () => undefined),
      onConnectionStatus: vi.fn(() => () => undefined)
    }

    const store = new AppStore({ api })
    try {
      store.setSelectedSource('serial')
      await expect(store.activateSelectedSource()).resolves.toBeUndefined()
      expect(store.ui.activeSource).toBe('serial')
      expect(store.live.connectionStatus.state).toBe('error')
      expect(store.live.connectionStatus.transport).toBe('serial')
      expect(store.live.connectionStatus.message).toContain('serial open denied')
    } finally {
      store.dispose()
    }
  })

  it('does not emit unhandled rejections from UI fire-and-forget paths', async () => {
    const api: GcsApi = {
      listSerialPorts: vi.fn(async () => {
        throw new Error('scan failed')
      }),
      connectSerial: vi.fn(async () => {
        throw new Error('serial open denied')
      }),
      connectWebSocket: vi.fn(async () => undefined),
      disconnectLive: vi.fn(async () => {
        throw new Error('disconnect failed')
      }),
      onLiveTelemetry: vi.fn(() => () => undefined),
      onConnectionStatus: vi.fn(() => () => undefined)
    }

    const store = new AppStore({ api })
    try {
      await expectNoUnhandledRejection(() => {
        void store.refreshSerialPorts()
      })

      store.setActiveSource('serial')
      await expectNoUnhandledRejection(() => {
        void store.disconnectLive()
      })

      store.setSelectedSource('serial')
      await expectNoUnhandledRejection(() => {
        void store.activateSelectedSource()
      })
    } finally {
      store.dispose()
    }
  })
})
