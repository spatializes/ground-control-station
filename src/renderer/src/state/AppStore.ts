import { makeAutoObservable, runInAction } from 'mobx'
import type {
  ConnectionStatus,
  DataSourceKind,
  GcsApi,
  SerialPortInfo,
  TelemetryFrame,
  ThemeMode,
  WindConfig,
  WindFetchState,
  WindMode,
  WindSnapshot
} from '@shared/types'
import { loadCsv } from '../lib/csv/loadCsv'
import { clamp } from '../lib/format'
import { findReplayIndexAtCursor, interpolateFrame } from '../lib/telemetry/interpolateFrame'
import { fetchOpenMeteoWind } from '../lib/wind/fetchOpenMeteoWind'
import { haversineDistanceM } from '../lib/wind/windMath'

interface AppStoreOptions {
  api?: GcsApi | null
  csvLoader?: (path: string) => Promise<TelemetryFrame[]>
  windFetcher?: (latitudeDeg: number, longitudeDeg: number) => Promise<WindSnapshot>
  now?: () => number
}

interface WindCoordinates {
  latitudeDeg: number
  longitudeDeg: number
}

function isBluetoothIncomingPath(path: string): boolean {
  return path.toLowerCase().includes('bluetooth-incoming-port')
}

function serialPortPriority(port: SerialPortInfo): number {
  const path = port.path.toLowerCase()
  let priority = 0

  if (path.startsWith('/dev/cu.')) {
    priority += 30
  } else if (path.startsWith('/dev/tty.')) {
    priority += 20
  }

  if (path.includes('usb') || path.includes('acm') || path.includes('uart') || path.includes('serial')) {
    priority += 40
  }

  if (isBluetoothIncomingPath(path)) {
    priority -= 200
  }

  return priority
}

function sortSerialPorts(ports: SerialPortInfo[]): SerialPortInfo[] {
  return [...ports].sort((left, right) => {
    const priorityDelta = serialPortPriority(right) - serialPortPriority(left)
    if (priorityDelta !== 0) {
      return priorityDelta
    }

    return left.path.localeCompare(right.path)
  })
}

function pickDefaultSerialPath(ports: SerialPortInfo[]): string {
  const preferred = ports.find((port) => !isBluetoothIncomingPath(port.path))
  return preferred?.path ?? ports[0]?.path ?? ''
}

const DEFAULT_WIND: WindConfig = {
  fromDirectionDeg: 232,
  speedMps: 9
}

const DEFAULT_CONNECTION_STATUS: ConnectionStatus = {
  state: 'disconnected'
}

const LIVE_WIND_REFRESH_INTERVAL_MS = 45_000
const LIVE_WIND_REFRESH_DISTANCE_M = 2_000

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to fetch live wind'
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
}

function formatRelativeAge(updatedAtMs: number, nowMs: number): string {
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - updatedAtMs) / 1000))

  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s ago`
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60)
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60)
  return `${elapsedHours}h ago`
}

export class AppStore {
  readonly playback = {
    frames: [] as TelemetryFrame[],
    cursorMs: 0,
    isPlaying: false,
    speedMultiplier: 10
  }

  readonly ui = {
    activeSource: 'csv' as DataSourceKind,
    selectedSource: 'csv' as DataSourceKind,
    cameraLocked: true,
    theme: 'light' as ThemeMode,
    isConnectionPanelOpen: false,
    isAltitudeProfileCollapsed: false,
    windPanelOpen: false
  }

  readonly live = {
    connectionStatus: DEFAULT_CONNECTION_STATUS,
    latestFrame: null as TelemetryFrame | null,
    serialPorts: [] as SerialPortInfo[],
    serialPath: '',
    serialBaudRate: 57600,
    websocketUrl: 'ws://127.0.0.1:14550'
  }

  readonly wind = {
    enabled: true,
    mode: 'synthetic' as WindMode,
    synthetic: { ...DEFAULT_WIND },
    liveSnapshot: null as WindSnapshot | null,
    fetchState: 'idle' as WindFetchState,
    fetchError: '',
    lastFetchCoords: null as WindCoordinates | null
  }

  loadState: 'idle' | 'loading' | 'ready' | 'error' = 'idle'
  loadError = ''

  private readonly api: GcsApi | null
  private readonly csvLoader: (path: string) => Promise<TelemetryFrame[]>
  private readonly windFetcher: (latitudeDeg: number, longitudeDeg: number) => Promise<WindSnapshot>
  private readonly now: () => number

  private removeTelemetryListener: (() => void) | null = null
  private removeStatusListener: (() => void) | null = null
  private windRefreshTimer: ReturnType<typeof setInterval> | null = null
  private isWindFetchInFlight = false
  private lastWindFetchAttemptMs = 0

  constructor(options: AppStoreOptions = {}) {
    this.api = options.api ?? (typeof window === 'undefined' ? null : window.gcsApi ?? null)
    this.csvLoader = options.csvLoader ?? loadCsv
    this.windFetcher = options.windFetcher ?? fetchOpenMeteoWind
    this.now = options.now ?? Date.now

    makeAutoObservable(this, {}, { autoBind: true })
    this.bindLiveListeners()
    this.startWindRefreshLoop()
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
    if (this.ui.activeSource === 'csv') {
      return this.currentReplayFrame
    }

    return this.live.latestFrame
  }

  get canPlayReplay(): boolean {
    return this.ui.activeSource === 'csv' && this.playback.frames.length > 1
  }

  get effectiveWind(): WindConfig {
    if (this.wind.mode === 'live' && this.wind.liveSnapshot) {
      return {
        fromDirectionDeg: this.wind.liveSnapshot.fromDirectionDeg,
        speedMps: this.wind.liveSnapshot.speedMps
      }
    }

    return {
      fromDirectionDeg: this.wind.synthetic.fromDirectionDeg,
      speedMps: this.wind.synthetic.speedMps
    }
  }

  get effectiveWindLabel(): string {
    const wind = this.effectiveWind
    return `Wind ${wind.fromDirectionDeg.toFixed(0)}° @ ${wind.speedMps.toFixed(1)} m/s`
  }

  get windModeBadge(): 'SYN' | 'LIVE' {
    return this.wind.mode === 'live' ? 'LIVE' : 'SYN'
  }

  get windStatusText(): string {
    if (!this.wind.enabled) {
      return 'Wind overlay is off'
    }

    if (this.wind.mode === 'synthetic') {
      return 'Using synthetic global wind'
    }

    if (this.wind.fetchState === 'loading') {
      return this.wind.liveSnapshot ? 'Updating live wind...' : 'Fetching live wind...'
    }

    if (this.wind.fetchState === 'error') {
      return this.wind.liveSnapshot
        ? `Live fetch failed, showing last good update (${formatRelativeAge(this.wind.liveSnapshot.updatedAtMs, this.now())})`
        : 'Live unavailable, using synthetic wind'
    }

    if (this.wind.liveSnapshot) {
      return `Live updated ${formatRelativeAge(this.wind.liveSnapshot.updatedAtMs, this.now())}`
    }

    return 'Waiting for first live wind update'
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
    this.stopWindRefreshLoop()
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

  setSelectedSource(source: DataSourceKind): void {
    this.ui.selectedSource = source
  }

  async activateSelectedSource(): Promise<void> {
    if (this.ui.selectedSource === 'csv') {
      await this.disconnectLive()
      runInAction(() => {
        this.ui.activeSource = 'csv'
      })
      return
    }

    if (this.ui.selectedSource === 'serial') {
      runInAction(() => {
        this.setActiveSource('serial')
        this.live.latestFrame = null
      })
      await this.connectSerial()
      return
    }

    runInAction(() => {
      this.setActiveSource('websocket')
      this.live.latestFrame = null
    })
    await this.connectWebSocket()
  }

  setActiveSource(source: DataSourceKind): void {
    this.ui.activeSource = source
    if (source !== 'csv') {
      this.pauseReplay()
    }
  }

  setConnectionPanelOpen(isOpen: boolean): void {
    this.ui.isConnectionPanelOpen = isOpen
  }

  setWindPanelOpen(isOpen: boolean): void {
    this.ui.windPanelOpen = isOpen
  }

  setAltitudeProfileCollapsed(isCollapsed: boolean): void {
    this.ui.isAltitudeProfileCollapsed = isCollapsed
  }

  scrubReplayByProgress(progress: number): void {
    if (this.ui.activeSource !== 'csv') {
      return
    }

    this.pauseReplay()
    this.seekReplayProgress(progress)
  }

  setTheme(theme: ThemeMode): void {
    this.ui.theme = theme
  }

  setCameraLocked(isLocked: boolean): void {
    this.ui.cameraLocked = isLocked
  }

  setSpeedMultiplier(multiplier: number): void {
    this.playback.speedMultiplier = clamp(multiplier, 0.25, 10)
  }

  setWindEnabled(enabled: boolean): void {
    this.wind.enabled = enabled

    if (enabled && this.wind.mode === 'live') {
      void this.refreshLiveWindForCurrentFrame(true)
    }
  }

  setWindMode(mode: WindMode): void {
    this.wind.mode = mode

    if (mode === 'synthetic') {
      this.wind.fetchState = 'idle'
      this.wind.fetchError = ''
      return
    }

    void this.refreshLiveWindForCurrentFrame(true)
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
    void this.refreshLiveWindForCurrentFrame(false)
  }

  advancePlaybackBy(deltaMs: number): void {
    if (!this.playback.isPlaying || this.playback.frames.length < 2) {
      return
    }

    const nextCursorMs = this.playback.cursorMs + deltaMs * this.playback.speedMultiplier

    if (nextCursorMs >= this.replayDurationMs) {
      this.playback.cursorMs = this.replayDurationMs
      this.pauseReplay()
      void this.refreshLiveWindForCurrentFrame(false)
      return
    }

    this.playback.cursorMs = Math.max(0, nextCursorMs)
    void this.refreshLiveWindForCurrentFrame(false)
  }

  async refreshLiveWindForFrame(frame: TelemetryFrame | null, force = false): Promise<void> {
    if (!frame || !this.isLiveWindActive || this.isWindFetchInFlight) {
      return
    }

    const nowMs = this.now()
    if (!force && !this.shouldRefreshLiveWind(frame, nowMs)) {
      return
    }

    this.isWindFetchInFlight = true
    this.lastWindFetchAttemptMs = nowMs
    this.wind.fetchState = 'loading'
    this.wind.fetchError = ''

    try {
      const snapshot = await this.windFetcher(frame.latitudeDeg, frame.longitudeDeg)

      runInAction(() => {
        this.wind.liveSnapshot = snapshot
        this.wind.fetchState = 'ready'
        this.wind.fetchError = ''
        this.wind.lastFetchCoords = {
          latitudeDeg: frame.latitudeDeg,
          longitudeDeg: frame.longitudeDeg
        }
      })
    } catch (error) {
      runInAction(() => {
        this.wind.fetchState = 'error'
        this.wind.fetchError = normalizeErrorMessage(error)
        this.wind.lastFetchCoords = {
          latitudeDeg: frame.latitudeDeg,
          longitudeDeg: frame.longitudeDeg
        }
      })
    } finally {
      this.isWindFetchInFlight = false
    }
  }

  async refreshSerialPorts(): Promise<void> {
    if (!this.api) {
      return
    }

    const ports = sortSerialPorts(await this.api.listSerialPorts())
    runInAction(() => {
      this.live.serialPorts = ports
      const hasCurrentPort = ports.some((port) => port.path === this.live.serialPath)
      if (!hasCurrentPort) {
        this.live.serialPath = pickDefaultSerialPath(ports)
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
    if (!this.live.serialPath) {
      this.live.connectionStatus = {
        state: 'error',
        transport: 'serial',
        message: 'Select a serial port before connecting'
      }
      return
    }

    if (!this.api) {
      this.live.connectionStatus = {
        state: 'error',
        transport: 'serial',
        message: 'Live telemetry API unavailable'
      }
      return
    }

    runInAction(() => {
      this.live.connectionStatus = {
        state: 'connecting',
        transport: 'serial',
        message: `Opening ${this.live.serialPath} @ ${this.live.serialBaudRate}`
      }
    })

    try {
      await this.api.connectSerial({
        path: this.live.serialPath,
        baudRate: this.live.serialBaudRate
      })

      runInAction(() => {
        this.ui.activeSource = 'serial'
      })
    } catch (error) {
      runInAction(() => {
        this.live.connectionStatus = {
          state: 'error',
          transport: 'serial',
          message: toErrorMessage(error, 'Unable to open serial connection')
        }
      })
    }
  }

  async connectWebSocket(): Promise<void> {
    const websocketUrl = this.live.websocketUrl.trim()
    if (!websocketUrl) {
      this.live.connectionStatus = {
        state: 'error',
        transport: 'websocket',
        message: 'Enter a WebSocket URL before connecting'
      }
      return
    }

    if (!this.api) {
      this.live.connectionStatus = {
        state: 'error',
        transport: 'websocket',
        message: 'Live telemetry API unavailable'
      }
      return
    }

    runInAction(() => {
      this.live.connectionStatus = {
        state: 'connecting',
        transport: 'websocket',
        message: `Opening ${websocketUrl}`
      }
    })

    try {
      await this.api.connectWebSocket({
        url: websocketUrl
      })

      runInAction(() => {
        this.ui.activeSource = 'websocket'
      })
    } catch (error) {
      runInAction(() => {
        this.live.connectionStatus = {
          state: 'error',
          transport: 'websocket',
          message: toErrorMessage(error, 'Unable to open WebSocket connection')
        }
      })
    }
  }

  async disconnectLive(): Promise<void> {
    if (!this.api) {
      this.ui.activeSource = 'csv'
      this.live.latestFrame = null
      this.live.connectionStatus = DEFAULT_CONNECTION_STATUS
      return
    }

    await this.api.disconnectLive()

    runInAction(() => {
      this.live.latestFrame = null
      if (this.ui.activeSource !== 'csv') {
        this.ui.activeSource = 'csv'
      }
    })
  }

  private get isLiveWindActive(): boolean {
    return this.wind.enabled && this.wind.mode === 'live'
  }

  private shouldRefreshLiveWind(frame: TelemetryFrame, nowMs: number): boolean {
    const lastUpdateMs = this.wind.liveSnapshot?.updatedAtMs ?? 0
    const referenceMs = Math.max(lastUpdateMs, this.lastWindFetchAttemptMs)
    const hasElapsedInterval = nowMs - referenceMs >= LIVE_WIND_REFRESH_INTERVAL_MS

    if (!this.wind.lastFetchCoords) {
      return true
    }

    const movedDistanceM = haversineDistanceM(
      this.wind.lastFetchCoords.latitudeDeg,
      this.wind.lastFetchCoords.longitudeDeg,
      frame.latitudeDeg,
      frame.longitudeDeg
    )

    return hasElapsedInterval || movedDistanceM >= LIVE_WIND_REFRESH_DISTANCE_M
  }

  private async refreshLiveWindForCurrentFrame(force: boolean): Promise<void> {
    await this.refreshLiveWindForFrame(this.currentFrame, force)
  }

  private startWindRefreshLoop(): void {
    this.stopWindRefreshLoop()

    this.windRefreshTimer = setInterval(() => {
      void this.refreshLiveWindForCurrentFrame(false)
    }, LIVE_WIND_REFRESH_INTERVAL_MS)
  }

  private stopWindRefreshLoop(): void {
    if (!this.windRefreshTimer) {
      return
    }

    clearInterval(this.windRefreshTimer)
    this.windRefreshTimer = null
  }

  private bindLiveListeners(): void {
    if (!this.api) {
      return
    }

    this.removeTelemetryListener = this.api.onLiveTelemetry((frame) => {
      runInAction(() => {
        this.live.latestFrame = frame
      })

      void this.refreshLiveWindForFrame(frame, false)
    })

    this.removeStatusListener = this.api.onConnectionStatus((status) => {
      runInAction(() => {
        this.live.connectionStatus = status
      })
    })
  }
}
