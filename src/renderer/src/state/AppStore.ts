import { makeAutoObservable, runInAction } from 'mobx'
import type {
  ConnectionStatus,
  GcsApi,
  SerialPortInfo,
  TelemetryFrame,
  TelemetryMode,
  ThemeMode,
  WindConfig
} from '@shared/types'
import { loadCsv } from '../lib/csv/loadCsv'
import { clamp } from '../lib/format'
import { findReplayIndexAtCursor, interpolateFrame } from '../lib/telemetry/interpolateFrame'

interface AppStoreOptions {
  api?: GcsApi | null
  csvLoader?: (path: string) => Promise<TelemetryFrame[]>
}

const DEFAULT_WIND: WindConfig = {
  fromDirectionDeg: 232,
  speedMps: 9
}

const DEFAULT_CONNECTION_STATUS: ConnectionStatus = {
  state: 'disconnected'
}

export class AppStore {
  readonly playback = {
    frames: [] as TelemetryFrame[],
    cursorMs: 0,
    isPlaying: false,
    speedMultiplier: 1
  }

  readonly ui = {
    mode: 'replay' as TelemetryMode,
    cameraLocked: true,
    theme: 'light' as ThemeMode
  }

  readonly live = {
    connectionStatus: DEFAULT_CONNECTION_STATUS,
    latestFrame: null as TelemetryFrame | null,
    serialPorts: [] as SerialPortInfo[],
    serialPath: '',
    serialBaudRate: 57600,
    websocketUrl: 'ws://127.0.0.1:14550'
  }

  readonly wind: WindConfig = DEFAULT_WIND

  loadState: 'idle' | 'loading' | 'ready' | 'error' = 'idle'
  loadError = ''

  private readonly api: GcsApi | null
  private readonly csvLoader: (path: string) => Promise<TelemetryFrame[]>

  private removeTelemetryListener: (() => void) | null = null
  private removeStatusListener: (() => void) | null = null

  constructor(options: AppStoreOptions = {}) {
    this.api = options.api ?? (typeof window === 'undefined' ? null : window.gcsApi ?? null)
    this.csvLoader = options.csvLoader ?? loadCsv

    makeAutoObservable(this, {}, { autoBind: true })
    this.bindLiveListeners()
  }

  get replayDurationMs(): number {
    if (this.playback.frames.length < 2) {
      return 0
    }

    return this.playback.frames[this.playback.frames.length - 1].timestampMs - this.playback.frames[0].timestampMs
  }

  get replayProgress(): number {
    if (this.replayDurationMs <= 0) {
      return 0
    }

    return this.playback.cursorMs / this.replayDurationMs
  }

  get currentReplayIndex(): number {
    return findReplayIndexAtCursor(this.playback.frames, this.playback.cursorMs)
  }

  get currentReplayFrame(): TelemetryFrame | null {
    return interpolateFrame(this.playback.frames, this.playback.cursorMs)
  }

  get currentFrame(): TelemetryFrame | null {
    if (this.ui.mode === 'live' && this.live.latestFrame) {
      return this.live.latestFrame
    }

    return this.currentReplayFrame
  }

  get canPlayReplay(): boolean {
    return this.ui.mode === 'replay' && this.playback.frames.length > 1
  }

  async initializeReplay(): Promise<void> {
    this.loadState = 'loading'
    this.loadError = ''

    try {
      const frames = await this.csvLoader('./data/ground-control-test-data.csv')
      runInAction(() => {
        this.setReplayFrames(frames)
        this.loadState = 'ready'
      })
    } catch (error) {
      runInAction(() => {
        this.loadState = 'error'
        this.loadError = error instanceof Error ? error.message : 'Unable to load replay CSV'
      })
    }
  }

  dispose(): void {
    this.pauseReplay()
    this.removeTelemetryListener?.()
    this.removeTelemetryListener = null
    this.removeStatusListener?.()
    this.removeStatusListener = null
  }

  setReplayFrames(frames: TelemetryFrame[]): void {
    this.playback.frames = frames
    this.playback.cursorMs = 0
    this.playback.isPlaying = false
  }

  setMode(mode: TelemetryMode): void {
    this.ui.mode = mode
    if (mode === 'live') {
      this.pauseReplay()
    }
  }

  setTheme(theme: ThemeMode): void {
    this.ui.theme = theme
  }

  setCameraLocked(isLocked: boolean): void {
    this.ui.cameraLocked = isLocked
  }

  setSpeedMultiplier(multiplier: number): void {
    this.playback.speedMultiplier = clamp(multiplier, 0.25, 4)
  }

  toggleReplay(): void {
    if (this.playback.isPlaying) {
      this.pauseReplay()
      return
    }

    this.playReplay()
  }

  playReplay(): void {
    if (!this.canPlayReplay) {
      return
    }

    if (this.playback.cursorMs >= this.replayDurationMs) {
      this.playback.cursorMs = 0
    }

    this.playback.isPlaying = true
  }

  pauseReplay(): void {
    this.playback.isPlaying = false
  }

  seekReplayProgress(progress: number): void {
    if (this.playback.frames.length < 2) {
      return
    }

    const clampedProgress = clamp(progress, 0, 1)
    this.playback.cursorMs = this.replayDurationMs * clampedProgress
  }

  advancePlaybackBy(deltaMs: number): void {
    if (!this.playback.isPlaying || this.playback.frames.length < 2) {
      return
    }

    const nextCursorMs = this.playback.cursorMs + deltaMs * this.playback.speedMultiplier

    if (nextCursorMs >= this.replayDurationMs) {
      this.playback.cursorMs = this.replayDurationMs
      this.pauseReplay()
      return
    }

    this.playback.cursorMs = Math.max(0, nextCursorMs)
  }

  async refreshSerialPorts(): Promise<void> {
    if (!this.api) {
      return
    }

    const ports = await this.api.listSerialPorts()
    runInAction(() => {
      this.live.serialPorts = ports
      if (!this.live.serialPath && ports.length > 0) {
        this.live.serialPath = ports[0].path
      }
    })
  }

  setSerialPath(path: string): void {
    this.live.serialPath = path
  }

  setSerialBaudRate(baudRate: number): void {
    if (Number.isFinite(baudRate) && baudRate > 0) {
      this.live.serialBaudRate = baudRate
    }
  }

  setWebSocketUrl(url: string): void {
    this.live.websocketUrl = url
  }

  async connectSerial(): Promise<void> {
    if (!this.api || !this.live.serialPath) {
      return
    }

    await this.api.connectSerial({
      path: this.live.serialPath,
      baudRate: this.live.serialBaudRate
    })

    runInAction(() => {
      this.ui.mode = 'live'
    })
  }

  async connectWebSocket(): Promise<void> {
    if (!this.api || !this.live.websocketUrl.trim()) {
      return
    }

    await this.api.connectWebSocket({
      url: this.live.websocketUrl.trim()
    })

    runInAction(() => {
      this.ui.mode = 'live'
    })
  }

  async disconnectLive(): Promise<void> {
    if (!this.api) {
      return
    }

    await this.api.disconnectLive()
  }

  private bindLiveListeners(): void {
    if (!this.api) {
      return
    }

    this.removeTelemetryListener = this.api.onLiveTelemetry((frame) => {
      runInAction(() => {
        this.live.latestFrame = frame
      })
    })

    this.removeStatusListener = this.api.onConnectionStatus((status) => {
      runInAction(() => {
        this.live.connectionStatus = status
      })
    })
  }
}
