import { makeAutoObservable } from 'mobx'
import type { TelemetryFrame, WindConfig, WindFetchState, WindMode, WindSnapshot } from '@shared/types'
import { haversineDistanceM } from '../../lib/wind/windMath'

interface WindCoordinates {
  latitudeDeg: number
  longitudeDeg: number
}

const DEFAULT_WIND: WindConfig = {
  fromDirectionDeg: 232,
  speedMps: 9
}

export const LIVE_WIND_REFRESH_INTERVAL_MS = 45_000
const LIVE_WIND_REFRESH_DISTANCE_M = 2_000

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

export function normalizeWindErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to fetch live wind'
}

export class WindDomain {
  enabled = true
  mode: WindMode = 'synthetic'
  synthetic: WindConfig = { ...DEFAULT_WIND }
  liveSnapshot: WindSnapshot | null = null
  fetchState: WindFetchState = 'idle'
  fetchError = ''
  lastFetchCoords: WindCoordinates | null = null
  isFetchInFlight = false
  lastFetchAttemptMs = 0

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true })
  }

  get effectiveWind(): WindConfig {
    if (this.mode === 'live' && this.liveSnapshot) {
      return {
        fromDirectionDeg: this.liveSnapshot.fromDirectionDeg,
        speedMps: this.liveSnapshot.speedMps
      }
    }

    return {
      fromDirectionDeg: this.synthetic.fromDirectionDeg,
      speedMps: this.synthetic.speedMps
    }
  }

  get modeBadge(): 'SYN' | 'LIVE' {
    return this.mode === 'live' ? 'LIVE' : 'SYN'
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  setMode(mode: WindMode): void {
    this.mode = mode
  }

  setSyntheticModeIdle(): void {
    this.fetchState = 'idle'
    this.fetchError = ''
  }

  beginFetch(nowMs: number): void {
    this.isFetchInFlight = true
    this.lastFetchAttemptMs = nowMs
    this.fetchState = 'loading'
    this.fetchError = ''
  }

  completeFetchSuccess(snapshot: WindSnapshot, frame: TelemetryFrame): void {
    this.liveSnapshot = snapshot
    this.fetchState = 'ready'
    this.fetchError = ''
    this.lastFetchCoords = {
      latitudeDeg: frame.latitudeDeg,
      longitudeDeg: frame.longitudeDeg
    }
  }

  completeFetchError(errorMessage: string, frame: TelemetryFrame): void {
    this.fetchState = 'error'
    this.fetchError = errorMessage
    this.lastFetchCoords = {
      latitudeDeg: frame.latitudeDeg,
      longitudeDeg: frame.longitudeDeg
    }
  }

  endFetch(): void {
    this.isFetchInFlight = false
  }

  isLiveWindActive(): boolean {
    return this.enabled && this.mode === 'live'
  }

  shouldRefresh(frame: TelemetryFrame, nowMs: number, force: boolean): boolean {
    if (force) {
      return true
    }

    const lastUpdateMs = this.liveSnapshot?.updatedAtMs ?? 0
    const referenceMs = Math.max(lastUpdateMs, this.lastFetchAttemptMs)
    const hasElapsedInterval = nowMs - referenceMs >= LIVE_WIND_REFRESH_INTERVAL_MS

    if (!this.lastFetchCoords) {
      return true
    }

    const movedDistanceM = haversineDistanceM(
      this.lastFetchCoords.latitudeDeg,
      this.lastFetchCoords.longitudeDeg,
      frame.latitudeDeg,
      frame.longitudeDeg
    )

    return hasElapsedInterval || movedDistanceM >= LIVE_WIND_REFRESH_DISTANCE_M
  }

  formatLabel(): string {
    const wind = this.effectiveWind
    return `Wind ${wind.fromDirectionDeg.toFixed(0)}° @ ${wind.speedMps.toFixed(1)} m/s`
  }

  formatStatus(nowMs: number): string {
    if (!this.enabled) {
      return 'Wind overlay is off'
    }

    if (this.mode === 'synthetic') {
      return 'Using synthetic global wind'
    }

    if (this.fetchState === 'loading') {
      return this.liveSnapshot ? 'Updating live wind...' : 'Fetching live wind...'
    }

    if (this.fetchState === 'error') {
      return this.liveSnapshot
        ? `Live fetch failed, showing last good update (${formatRelativeAge(this.liveSnapshot.updatedAtMs, nowMs)})`
        : 'Live unavailable, using synthetic wind'
    }

    if (this.liveSnapshot) {
      return `Live updated ${formatRelativeAge(this.liveSnapshot.updatedAtMs, nowMs)}`
    }

    return 'Waiting for first live wind update'
  }
}
