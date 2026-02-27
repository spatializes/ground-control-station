import type { TelemetryFrame } from '@shared/types'
import { clampYaw } from './clampYaw'

function interpolateValue(start: number, end: number, progress: number): number {
  return start + (end - start) * progress
}

function interpolateYaw(startYaw: number, endYaw: number, progress: number): number {
  const delta = ((endYaw - startYaw + 540) % 360) - 180
  return clampYaw(startYaw + delta * progress)
}

function findFrameIndexAtOrBefore(frames: TelemetryFrame[], absoluteCursorMs: number): number {
  let low = 0
  let high = frames.length - 1

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const middleTimestamp = frames[middle].timestampMs

    if (middleTimestamp === absoluteCursorMs) {
      return middle
    }

    if (middleTimestamp < absoluteCursorMs) {
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  return Math.max(0, high)
}

export function interpolateFrame(frames: TelemetryFrame[], cursorMs: number): TelemetryFrame | null {
  if (frames.length === 0) {
    return null
  }

  const startTimestampMs = frames[0].timestampMs
  const endTimestampMs = frames[frames.length - 1].timestampMs
  const absoluteCursorMs = Math.min(endTimestampMs, Math.max(startTimestampMs, startTimestampMs + cursorMs))

  if (absoluteCursorMs <= startTimestampMs) {
    return { ...frames[0] }
  }

  if (absoluteCursorMs >= endTimestampMs) {
    return { ...frames[frames.length - 1] }
  }

  const previousIndex = findFrameIndexAtOrBefore(frames, absoluteCursorMs)
  const nextIndex = Math.min(frames.length - 1, previousIndex + 1)

  const previous = frames[previousIndex]
  const next = frames[nextIndex]

  const segmentDuration = Math.max(1, next.timestampMs - previous.timestampMs)
  const segmentProgress = (absoluteCursorMs - previous.timestampMs) / segmentDuration

  return {
    timestampMs: absoluteCursorMs,
    latitudeDeg: interpolateValue(previous.latitudeDeg, next.latitudeDeg, segmentProgress),
    longitudeDeg: interpolateValue(previous.longitudeDeg, next.longitudeDeg, segmentProgress),
    altitudeM: interpolateValue(previous.altitudeM, next.altitudeM, segmentProgress),
    gpsSpeedMps: interpolateValue(previous.gpsSpeedMps, next.gpsSpeedMps, segmentProgress),
    airspeedMps: interpolateValue(previous.airspeedMps, next.airspeedMps, segmentProgress),
    pitchDeg: interpolateValue(previous.pitchDeg, next.pitchDeg, segmentProgress),
    rollDeg: interpolateValue(previous.rollDeg, next.rollDeg, segmentProgress),
    yawDeg: interpolateYaw(previous.yawDeg, next.yawDeg, segmentProgress),
    source: previous.source
  }
}

export function findReplayIndexAtCursor(frames: TelemetryFrame[], cursorMs: number): number {
  if (frames.length === 0) {
    return 0
  }

  const absoluteCursorMs = Math.min(
    frames[frames.length - 1].timestampMs,
    Math.max(frames[0].timestampMs, frames[0].timestampMs + cursorMs)
  )

  return findFrameIndexAtOrBefore(frames, absoluteCursorMs)
}
