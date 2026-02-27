import { HeadingPitchRoll, Math as CesiumMath } from 'cesium'
import type { TelemetryFrame } from '@shared/types'

export function toCesiumOrientation(frame: TelemetryFrame): HeadingPitchRoll {
  return new HeadingPitchRoll(
    CesiumMath.toRadians(frame.yawDeg),
    CesiumMath.toRadians(frame.pitchDeg),
    CesiumMath.toRadians(frame.rollDeg)
  )
}
