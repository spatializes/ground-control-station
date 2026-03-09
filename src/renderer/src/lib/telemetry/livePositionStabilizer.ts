import type { TelemetryFrame } from '@shared/types'
import { haversineDistanceM } from '../wind/windMath'

export interface StabilizedLivePositionState {
  latitudeDeg: number
  longitudeDeg: number
  altitudeM: number
  timestampMs: number
  stationaryLockEngaged: boolean
}

const STATIONARY_SPEED_THRESHOLD_MPS = 1.0
const LOW_SATELLITE_THRESHOLD = 5
const OUTLIER_MIN_JUMP_M = 8
const OUTLIER_SPEED_MULTIPLIER = 2
const OUTLIER_MARGIN_M = 5
const STATIONARY_LOCK_HOLD_RADIUS_M = 8
const STATIONARY_LOCK_RELEASE_RADIUS_M = 10
const STATIONARY_HORIZONTAL_DEADBAND_M = 1.1
const MOVING_HORIZONTAL_DEADBAND_M = 0.3
const STATIONARY_ALTITUDE_DEADBAND_M = 1.0
const MOVING_ALTITUDE_DEADBAND_M = 0.3
const MIN_DELTA_SECONDS = 0.05
const MAX_DELTA_SECONDS = 3

function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.max(minValue, Math.min(maxValue, value))
}

function lerp(currentValue: number, targetValue: number, alpha: number): number {
  return currentValue + (targetValue - currentValue) * alpha
}

function toSatelliteCount(frame: TelemetryFrame): number {
  const satellites = frame.satellitesVisible
  if (typeof satellites !== 'number' || !Number.isFinite(satellites)) {
    return Number.POSITIVE_INFINITY
  }

  return satellites
}

function resolvePositionAlpha(satelliteCount: number, isStationary: boolean): number {
  if (satelliteCount <= 4) {
    return isStationary ? 0.08 : 0.14
  }

  if (satelliteCount <= 6) {
    return isStationary ? 0.12 : 0.22
  }

  return isStationary ? 0.18 : 0.34
}

function resolveAltitudeAlpha(isStationary: boolean): number {
  return isStationary ? 0.12 : 0.34
}

function resolveDeltaSeconds(previousTimestampMs: number, nextTimestampMs: number): number {
  const deltaSeconds = (nextTimestampMs - previousTimestampMs) / 1000
  return clamp(deltaSeconds, MIN_DELTA_SECONDS, MAX_DELTA_SECONDS)
}

export function stabilizeLivePosition(
  previousState: StabilizedLivePositionState | null,
  frame: TelemetryFrame
): StabilizedLivePositionState {
  if (!previousState) {
    return {
      latitudeDeg: frame.latitudeDeg,
      longitudeDeg: frame.longitudeDeg,
      altitudeM: frame.altitudeM,
      timestampMs: frame.timestampMs,
      stationaryLockEngaged: false
    }
  }

  const speedMps = Math.max(0, frame.gpsSpeedMps, frame.airspeedMps)
  const satelliteCount = toSatelliteCount(frame)
  const isStationary = speedMps <= STATIONARY_SPEED_THRESHOLD_MPS
  const hasPoorGps = satelliteCount <= LOW_SATELLITE_THRESHOLD
  const deltaSeconds = resolveDeltaSeconds(previousState.timestampMs, frame.timestampMs)

  const horizontalJumpM = haversineDistanceM(
    previousState.latitudeDeg,
    previousState.longitudeDeg,
    frame.latitudeDeg,
    frame.longitudeDeg
  )

  let stationaryLockEngaged = false
  if (hasPoorGps && isStationary) {
    if (previousState.stationaryLockEngaged) {
      stationaryLockEngaged = horizontalJumpM <= STATIONARY_LOCK_RELEASE_RADIUS_M
    } else {
      stationaryLockEngaged = horizontalJumpM <= STATIONARY_LOCK_HOLD_RADIUS_M
    }
  }

  const stationaryLockBroken = previousState.stationaryLockEngaged && !stationaryLockEngaged
  const maxPlausibleJumpM = Math.max(
    OUTLIER_MIN_JUMP_M,
    speedMps * deltaSeconds * OUTLIER_SPEED_MULTIPLIER + OUTLIER_MARGIN_M
  )
  const shouldRejectOutlier =
    horizontalJumpM > maxPlausibleJumpM &&
    !stationaryLockEngaged &&
    !(hasPoorGps && isStationary && stationaryLockBroken)

  const horizontalDeadbandM = isStationary ? STATIONARY_HORIZONTAL_DEADBAND_M : MOVING_HORIZONTAL_DEADBAND_M
  const altitudeDeadbandM = isStationary ? STATIONARY_ALTITUDE_DEADBAND_M : MOVING_ALTITUDE_DEADBAND_M
  const altitudeDeltaM = Math.abs(frame.altitudeM - previousState.altitudeM)

  const holdHorizontal = stationaryLockEngaged || shouldRejectOutlier
  const targetLatitudeDeg =
    holdHorizontal || horizontalJumpM < horizontalDeadbandM ? previousState.latitudeDeg : frame.latitudeDeg
  const targetLongitudeDeg =
    holdHorizontal || horizontalJumpM < horizontalDeadbandM ? previousState.longitudeDeg : frame.longitudeDeg
  const targetAltitudeM =
    shouldRejectOutlier || altitudeDeltaM < altitudeDeadbandM ? previousState.altitudeM : frame.altitudeM

  const nextTimestampMs =
    frame.timestampMs >= previousState.timestampMs ? frame.timestampMs : previousState.timestampMs + 1
  const positionAlpha = resolvePositionAlpha(satelliteCount, isStationary)

  return {
    latitudeDeg: lerp(previousState.latitudeDeg, targetLatitudeDeg, positionAlpha),
    longitudeDeg: lerp(previousState.longitudeDeg, targetLongitudeDeg, positionAlpha),
    altitudeM: lerp(previousState.altitudeM, targetAltitudeM, resolveAltitudeAlpha(isStationary)),
    timestampMs: nextTimestampMs,
    stationaryLockEngaged
  }
}
