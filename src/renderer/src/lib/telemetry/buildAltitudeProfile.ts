import type { TelemetryFrame } from '@shared/types'

export interface AltitudeProfileGeometry {
  path: string
  markerX: number
  markerY: number
  minAltitudeM: number
  maxAltitudeM: number
}

export function buildAltitudeProfile(
  frames: TelemetryFrame[],
  currentIndex: number,
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

  const pathCommands = sampledFrames.map((frame, index) => {
    const x = (index / (sampledFrames.length - 1)) * width
    const normalizedAltitude = (frame.altitudeM - minAltitudeM) / altitudeRange
    const y = height - normalizedAltitude * height
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
  })

  const clampedIndex = Math.max(0, Math.min(currentIndex, frames.length - 1))
  const markerFrame = frames[clampedIndex]
  const markerProgress = clampedIndex / (frames.length - 1)
  const markerX = markerProgress * width
  const markerY = height - ((markerFrame.altitudeM - minAltitudeM) / altitudeRange) * height

  return {
    path: pathCommands.join(' '),
    markerX,
    markerY,
    minAltitudeM,
    maxAltitudeM
  }
}
