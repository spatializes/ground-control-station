import { makeAutoObservable, runInAction } from 'mobx'
import type {
  DataSourceKind,
  GcsApi,
  TelemetryFrame,
  ThemeMode,
  WindConfig,
  WindMode,
  WindSnapshot
} from '@shared/types'
import { loadCsv } from '../lib/csv/loadCsv'
import { findReplayIndexAtCursor, interpolateFrame } from '../lib/telemetry/interpolateFrame'
import { fetchOpenMeteoWind } from '../lib/wind/fetchOpenMeteoWind'
import {
  DEFAULT_CONNECT_TIMEOUT_MS,
  LiveConnectionDomain,
  logLiveConnection,
  toErrorMessage,
  withTimeout
} from './domains/LiveConnectionDomain'
import { PlaybackDomain } from './domains/PlaybackDomain'
import { UiDomain } from './domains/UiDomain'
import { LIVE_WIND_REFRESH_INTERVAL_MS, WindDomain, normalizeWindErrorMessage } from './domains/WindDomain'

interface AppStoreOptions {
  api?: GcsApi | null
  csvLoader?: (path: string) => Promise<TelemetryFrame[]>
  windFetcher?: (latitudeDeg: number, longitudeDeg: number) => Promise<WindSnapshot>
  now?: () => number
  connectTimeoutMs?: number
}

export interface AltitudePanelModel {
  frames: TelemetryFrame[]
  currentProgress: number
  currentAltitudeM: number | null
  isInteractive: boolean
  title: string
  xAxisLabel: string
  emptyMessage: string
}

export class AppStore {
  readonly playback = new PlaybackDomain()
  readonly ui = new UiDomain()
  readonly live = new LiveConnectionDomain()
  readonly wind = new WindDomain()

  loadState: 'idle' | 'loading' | 'ready' | 'error' = 'idle'
  loadError = ''

  private readonly api: GcsApi | null
  private readonly csvLoader: (path: string) => Promise<TelemetryFrame[]>
  private readonly windFetcher: (latitudeDeg: number, longitudeDeg: number) => Promise<WindSnapshot>
  private readonly now: () => number
  private readonly connectTimeoutMs: number

  private removeTelemetryListener: (() => void) | null = null
  private removeStatusListener: (() => void) | null = null
  private windRefreshTimer: ReturnType<typeof setInterval> | null = null
  private hasStarted = false

  constructor(options: AppStoreOptions = {}) {
    this.api = options.api ?? (typeof window === 'undefined' ? null : window.gcsApi ?? null)
    this.csvLoader = options.csvLoader ?? loadCsv
    this.windFetcher = options.windFetcher ?? fetchOpenMeteoWind
    this.now = options.now ?? Date.now
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS

    makeAutoObservable(
      this,
      {
        playback: false,
        ui: false,
        live: false,
        wind: false
      },
      { autoBind: true }
    )
  }

  start(): void {
    if (this.hasStarted) {
      return
    }

    this.hasStarted = true
    this.bindLiveListeners()
    this.startWindRefreshLoop()
  }

  get replayDurationMs(): number {
    return this.playback.durationMs
  }

  get replayProgress(): number {
    return this.playback.progress
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

  get altitudePanelModel(): AltitudePanelModel {
    if (this.ui.activeSource === 'csv') {
      return {
        frames: this.playback.frames,
        currentProgress: this.replayProgress,
        currentAltitudeM: this.playback.frames[this.currentReplayIndex]?.altitudeM ?? null,
        isInteractive: true,
        title: 'Altitude Profile',
        xAxisLabel: 'Mission Time',
        emptyMessage: 'Load replay data to display the altitude profile.'
      }
    }

    const hasUsableLiveHistory = this.live.latestFrame !== null && this.live.liveAltitudeHistory.length > 1

    return {
      frames: hasUsableLiveHistory ? this.live.liveAltitudeHistory : [],
      currentProgress: 1,
      currentAltitudeM: hasUsableLiveHistory ? this.live.latestFrame?.altitudeM ?? null : null,
      isInteractive: false,
      title: 'Live Altitude Trend',
      xAxisLabel: 'Recent Time',
      emptyMessage: 'Waiting for live telemetry...'
    }
  }

  get effectiveWind(): WindConfig {
    return this.wind.effectiveWind
  }

  get effectiveWindLabel(): string {
    return this.wind.formatLabel()
  }

  get windModeBadge(): 'SYN' | 'LIVE' {
    return this.wind.modeBadge
  }

  get windStatusText(): string {
    return this.wind.formatStatus(this.now())
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
    this.hasStarted = false
    this.pauseReplay()
    this.stopWindRefreshLoop()
    this.removeTelemetryListener?.()
    this.removeTelemetryListener = null
    this.removeStatusListener?.()
    this.removeStatusListener = null
    this.live.dispose()
  }

  setReplayFrames(frames: TelemetryFrame[]): void {
    this.playback.setFrames(frames)
  }

  setSelectedSource(source: DataSourceKind): void {
    this.ui.setSelectedSource(source)
  }

  async activateSelectedSource(): Promise<void> {
    if (this.ui.selectedSource === 'csv') {
      const attemptId = this.live.beginConnectionAttempt()
      const didDisconnect = await this.disconnectLiveByAttempt(attemptId)
      if (!didDisconnect) {
        return
      }

      this.ui.setActiveSource('csv')
      return
    }

    if (this.ui.selectedSource === 'serial') {
      const attemptId = this.live.beginConnectionAttempt()
      this.setActiveSource('serial')
      await this.connectSerial(attemptId)
      return
    }

    const attemptId = this.live.beginConnectionAttempt()
    this.setActiveSource('websocket')
    await this.connectWebSocket(attemptId)
  }

  setActiveSource(source: DataSourceKind): void {
    this.ui.setActiveSource(source)
    if (source !== 'csv') {
      this.live.resetLiveTelemetry()
      this.pauseReplay()
      return
    }

    this.live.markDisconnected()
  }

  setConnectionPanelOpen(isOpen: boolean): void {
    this.ui.setConnectionPanelOpen(isOpen)
  }

  setWindPanelOpen(isOpen: boolean): void {
    this.ui.setWindPanelOpen(isOpen)
  }

  setAltitudeProfileCollapsed(isCollapsed: boolean): void {
    this.ui.setAltitudeProfileCollapsed(isCollapsed)
  }

  scrubReplayByProgress(progress: number): void {
    if (this.ui.activeSource !== 'csv') {
      return
    }

    this.pauseReplay()
    this.seekReplayProgress(progress)
  }

  setTheme(theme: ThemeMode): void {
    this.ui.setTheme(theme)
  }

  setCameraLocked(isLocked: boolean): void {
    this.ui.setCameraLocked(isLocked)
  }

  setSpeedMultiplier(multiplier: number): void {
    this.playback.setSpeedMultiplier(multiplier)
  }

  setWindEnabled(enabled: boolean): void {
    this.wind.setEnabled(enabled)

    if (enabled && this.wind.mode === 'live') {
      this.queueLiveWindRefreshForCurrentFrame(true, 'setWindEnabled')
    }
  }

  setWindMode(mode: WindMode): void {
    this.wind.setMode(mode)

    if (mode === 'synthetic') {
      this.wind.setSyntheticModeIdle()
      return
    }

    this.queueLiveWindRefreshForCurrentFrame(true, 'setWindMode')
  }

  toggleReplay(): void {
    if (this.playback.isPlaying) {
      this.pauseReplay()
      return
    }

    this.playReplay()
  }

  playReplay(): void {
    this.playback.play(this.canPlayReplay)
  }

  pauseReplay(): void {
    this.playback.pause()
  }

  seekReplayProgress(progress: number): void {
    this.playback.seekProgress(progress)
    this.queueLiveWindRefreshForCurrentFrame(false, 'seekReplayProgress')
  }

  advancePlaybackBy(deltaMs: number): void {
    const { reachedEnd } = this.playback.advanceBy(deltaMs)

    if (reachedEnd || this.playback.isPlaying) {
      this.queueLiveWindRefreshForCurrentFrame(false, 'advancePlaybackBy')
    }
  }

  async refreshLiveWindForFrame(frame: TelemetryFrame | null, force = false): Promise<void> {
    if (!frame || !this.wind.isLiveWindActive() || this.wind.isFetchInFlight) {
      return
    }

    if (frame.hasPositionFix === false) {
      return
    }

    const nowMs = this.now()
    if (!this.wind.shouldRefresh(frame, nowMs, force)) {
      return
    }

    this.wind.beginFetch(nowMs)

    try {
      const snapshot = await this.windFetcher(frame.latitudeDeg, frame.longitudeDeg)

      runInAction(() => {
        this.wind.completeFetchSuccess(snapshot, frame)
      })
    } catch (error) {
      runInAction(() => {
        this.wind.completeFetchError(normalizeWindErrorMessage(error), frame)
      })
    } finally {
      runInAction(() => {
        this.wind.endFetch()
      })
    }
  }

  async refreshSerialPorts(): Promise<void> {
    if (!this.api) {
      return
    }

    try {
      const ports = await this.api.listSerialPorts()
      runInAction(() => {
        this.live.setSerialPorts(ports)
      })
    } catch (error) {
      const message = toErrorMessage(error, 'Unable to list serial ports')
      runInAction(() => {
        this.live.setConnectionStatus({
          state: 'error',
          transport: 'serial',
          message
        })
      })
      logLiveConnection('Serial port refresh failed', {
        error: message
      })
    }
  }

  setSerialPath(path: string): void {
    this.live.setSerialPath(path)
  }

  setSerialBaudRate(baudRate: number): void {
    this.live.setSerialBaudRate(baudRate)
  }

  setWebSocketUrl(url: string): void {
    this.live.setWebSocketUrl(url)
  }

  async connectSerial(attemptId = this.live.beginConnectionAttempt()): Promise<void> {
    logLiveConnection('Starting serial connect attempt', {
      attemptId,
      selectedPath: this.live.serialPath,
      baudRate: this.live.serialBaudRate
    })

    if (!this.api) {
      if (this.live.isCurrentConnectionAttempt(attemptId)) {
        this.live.setConnectionStatus({
          state: 'error',
          transport: 'serial',
          message: 'Live telemetry API unavailable'
        })
      }
      return
    }

    try {
      await this.refreshSerialPorts()

      if (!this.live.serialPath) {
        throw new Error('No serial ports detected. Plug the drone in over USB and try again.')
      }

      const path = this.live.serialPath
      const baudRate = this.live.serialBaudRate

      if (this.live.isCurrentConnectionAttempt(attemptId)) {
        this.live.setConnectionStatus({
          state: 'connecting',
          transport: 'serial',
          message: `Opening ${path} @ ${baudRate}`
        })
      }

      logLiveConnection('Invoking serial connect RPC', { attemptId, path, baudRate })

      await withTimeout(
        this.api.connectSerial({
          path,
          baudRate
        }),
        this.connectTimeoutMs,
        'Serial connection'
      )

      runInAction(() => {
        if (!this.live.isCurrentConnectionAttempt(attemptId)) {
          return
        }

        this.ui.setActiveSource('serial')

        // Fallback when IPC status events are delayed or dropped.
        if (this.live.connectionStatus.state === 'connecting') {
          this.live.setConnectionStatus({
            state: 'connected',
            transport: 'serial',
            mavlinkState: 'none',
            message: `Serial connected on ${path}; waiting for MAVLink packets`
          })
        }
      })

      logLiveConnection('Serial connect RPC resolved', {
        attemptId,
        path,
        status: this.live.connectionStatus
      })
    } catch (error) {
      runInAction(() => {
        if (!this.live.isCurrentConnectionAttempt(attemptId)) {
          return
        }

        this.live.setConnectionStatus({
          state: 'error',
          transport: 'serial',
          message: toErrorMessage(error, 'Unable to open serial connection')
        })
      })

      logLiveConnection('Serial connect failed', {
        attemptId,
        error: toErrorMessage(error, 'Unable to open serial connection')
      })
    }
  }

  async connectWebSocket(attemptId = this.live.beginConnectionAttempt()): Promise<void> {
    const websocketUrl = this.live.websocketUrl.trim()
    if (!websocketUrl) {
      if (this.live.isCurrentConnectionAttempt(attemptId)) {
        this.live.setConnectionStatus({
          state: 'error',
          transport: 'websocket',
          message: 'Enter a WebSocket URL before connecting'
        })
      }
      return
    }

    if (!this.api) {
      if (this.live.isCurrentConnectionAttempt(attemptId)) {
        this.live.setConnectionStatus({
          state: 'error',
          transport: 'websocket',
          message: 'Live telemetry API unavailable'
        })
      }
      return
    }

    if (this.live.isCurrentConnectionAttempt(attemptId)) {
      this.live.setConnectionStatus({
        state: 'connecting',
        transport: 'websocket',
        message: `Opening ${websocketUrl}`
      })
    }

    logLiveConnection('Invoking WebSocket connect RPC', { attemptId, websocketUrl })

    try {
      await withTimeout(
        this.api.connectWebSocket({
          url: websocketUrl
        }),
        this.connectTimeoutMs,
        'WebSocket connection'
      )

      runInAction(() => {
        if (!this.live.isCurrentConnectionAttempt(attemptId)) {
          return
        }

        this.ui.setActiveSource('websocket')

        // Fallback when IPC status events are delayed or dropped.
        if (this.live.connectionStatus.state === 'connecting') {
          this.live.setConnectionStatus({
            state: 'connected',
            transport: 'websocket',
            mavlinkState: 'none',
            message: `WebSocket connected to ${websocketUrl}; waiting for MAVLink packets`
          })
        }
      })

      logLiveConnection('WebSocket connect RPC resolved', {
        attemptId,
        websocketUrl,
        status: this.live.connectionStatus
      })
    } catch (error) {
      runInAction(() => {
        if (!this.live.isCurrentConnectionAttempt(attemptId)) {
          return
        }

        this.live.setConnectionStatus({
          state: 'error',
          transport: 'websocket',
          message: toErrorMessage(error, 'Unable to open WebSocket connection')
        })
      })

      logLiveConnection('WebSocket connect failed', {
        attemptId,
        error: toErrorMessage(error, 'Unable to open WebSocket connection')
      })
    }
  }

  async disconnectLive(): Promise<void> {
    const attemptId = this.live.beginConnectionAttempt()
    await this.disconnectLiveByAttempt(attemptId)
  }

  private async disconnectLiveByAttempt(attemptId: number): Promise<boolean> {
    if (!this.api) {
      this.ui.setActiveSource('csv')
      this.live.markDisconnected()
      return true
    }

    try {
      await this.api.disconnectLive()
    } catch (error) {
      const message = toErrorMessage(error, 'Unable to disconnect live connection')
      runInAction(() => {
        if (!this.live.isCurrentConnectionAttempt(attemptId)) {
          return
        }

        this.live.setConnectionStatus({
          state: 'error',
          transport: this.ui.activeSource === 'websocket' ? 'websocket' : 'serial',
          message
        })
      })

      logLiveConnection('Disconnect live failed', {
        attemptId,
        error: message
      })
      return false
    }

    runInAction(() => {
      if (!this.live.isCurrentConnectionAttempt(attemptId)) {
        return
      }

      if (this.ui.activeSource !== 'csv') {
        this.ui.setActiveSource('csv')
      }
      this.live.markDisconnected()
    })

    return true
  }

  private queueLiveWindRefreshForCurrentFrame(force: boolean, reason: string): void {
    this.queueLiveWindRefreshForFrame(this.currentFrame, force, reason)
  }

  private queueLiveWindRefreshForFrame(frame: TelemetryFrame | null, force: boolean, reason: string): void {
    void this.refreshLiveWindForFrame(frame, force).catch((error) => {
      logLiveConnection('Unexpected live wind refresh failure', {
        reason,
        error: toErrorMessage(error, 'Unknown live wind refresh error')
      })
    })
  }

  private startWindRefreshLoop(): void {
    this.stopWindRefreshLoop()

    this.windRefreshTimer = setInterval(() => {
      this.queueLiveWindRefreshForCurrentFrame(false, 'refresh-loop')
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
        this.live.markLatestFrame(frame)
      })

      if (!this.live.hasLoggedFirstLiveFrame) {
        this.live.markFirstLiveFrameLogged()
        logLiveConnection('Received first live frame in renderer', {
          source: this.ui.activeSource,
          hasPositionFix: frame.hasPositionFix !== false,
          latitudeDeg: frame.latitudeDeg,
          longitudeDeg: frame.longitudeDeg,
          altitudeM: frame.altitudeM
        })
      }

      this.queueLiveWindRefreshForFrame(frame, false, 'live-telemetry')
    })

    this.removeStatusListener = this.api.onConnectionStatus((status) => {
      logLiveConnection('Received connection status event', {
        activeSource: this.ui.activeSource,
        status
      })

      runInAction(() => {
        if (this.ui.activeSource === 'csv') {
          if (status.state === 'disconnected') {
            this.live.markDisconnected()
          }
          return
        }

        if (status.transport && status.transport !== this.ui.activeSource && status.state !== 'disconnected') {
          logLiveConnection('Ignoring status event for inactive source', {
            activeSource: this.ui.activeSource,
            status
          })
          return
        }

        this.live.setConnectionStatus(status)
      })
    })
  }
}
