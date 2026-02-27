import { useEffect, useRef } from 'react'
import { HeadingPitchRange, Math as CesiumMath } from 'cesium'
import type { Entity, Viewer } from 'cesium'
import type { TelemetryFrame } from '@shared/types'

export function useCameraLock(
  viewer: Viewer | null,
  aircraft: Entity | null,
  isLocked: boolean,
  frame: TelemetryFrame | null
): void {
  const wasLockedRef = useRef(false)

  useEffect(() => {
    if (!viewer) {
      return
    }

    if (!isLocked) {
      viewer.trackedEntity = undefined
      wasLockedRef.current = false
      return
    }

    if (!aircraft) {
      viewer.trackedEntity = undefined
      return
    }

    // Re-assert lock on every telemetry update in case camera flight/manual operations clear tracking.
    viewer.trackedEntity = aircraft

    if (!wasLockedRef.current) {
      void viewer.flyTo(aircraft, {
        offset: new HeadingPitchRange(0, CesiumMath.toRadians(-28), 620),
        duration: 0.8
      })
      wasLockedRef.current = true
    }
  }, [viewer, aircraft, isLocked, frame?.timestampMs])
}
