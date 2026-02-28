import type { TelemetryFrame } from '@shared/types'

export interface AltitudeProfileGeometry {
  path: string
  minAltitudeM: number
  maxAltitudeM: number
}

export const PROFILE_VERTICAL_PADDING = 6

function smoothAltitudes(values: number[], windowRadius = 2): number[] {
  if (values.length <= 2 || windowRadius <= 0) {
    return values
  }

  return values.map((_value, index) => {
    const startIndex = Math.max(0, index - windowRadius)
    const endIndex = Math.min(values.length - 1, index + windowRadius)

    let total = 0
    let count = 0

    for (let currentIndex = startIndex; currentIndex <= endIndex; currentIndex += 1) {
      total += values[currentIndex]
      count += 1
    }

    return count > 0 ? total / count : values[index]
  })
}

export function buildAltitudeProfile(
  frames: TelemetryFrame[],
  width: number,
  height: number,
  sampleLimit = 1000
): AltitudeProfileGeometry | null {
  if (frames.length < 2) {
    return null
  }

  const stride = Math.max(1, Math.floor(frames.length / sampleLimit))
  const sampledFrames: TelemetryFrame[] = []

  for (let index = 0; index < frames.length; index += stride) {
    sampledFrames.push(frames[index])
  }

  const lastFrame = frames[frames.length - 1]
  if (sampledFrames[sampledFrames.length - 1] !== lastFrame) {
    sampledFrames.push(lastFrame)
  }

  let minAltitudeM = Number.POSITIVE_INFINITY
  let maxAltitudeM = Number.NEGATIVE_INFINITY

  for (const frame of sampledFrames) {
    minAltitudeM = Math.min(minAltitudeM, frame.altitudeM)
    maxAltitudeM = Math.max(maxAltitudeM, frame.altitudeM)
  }

  const altitudeRange = Math.max(1, maxAltitudeM - minAltitudeM)
  const firstTimestampMs = sampledFrames[0].timestampMs
  const durationMs = Math.max(1, sampledFrames[sampledFrames.length - 1].timestampMs - firstTimestampMs)
  const smoothedAltitudes = smoothAltitudes(sampledFrames.map((frame) => frame.altitudeM))
  const plotHeight = Math.max(1, height - PROFILE_VERTICAL_PADDING * 2)

  const pathCommands = sampledFrames.map((frame, index) => {
    const x = ((frame.timestampMs - firstTimestampMs) / durationMs) * width
    const normalizedAltitude = (smoothedAltitudes[index] - minAltitudeM) / altitudeRange
    const y = PROFILE_VERTICAL_PADDING + (1 - normalizedAltitude) * plotHeight
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
  })

  return {
    path: pathCommands.join(' '),
    minAltitudeM,
    maxAltitudeM
  }
}
