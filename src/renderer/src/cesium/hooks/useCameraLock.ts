import { useEffect, useRef } from 'react'
import { HeadingPitchRange, Math as CesiumMath } from 'cesium'
import type { Entity, Viewer } from 'cesium'
import type { TelemetryFrame } from '@shared/types'

export function useCameraLock(
  viewer: Viewer | null,
  aircraft: Entity | null,
  isLocked: boolean,
  _frame: TelemetryFrame | null
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

    const ensureTracked = (): void => {
      if (viewer.trackedEntity !== aircraft) {
        viewer.trackedEntity = aircraft
      }
    }

    // Keep lock engaged continuously so startup camera flights and manual drags do not silently break tracking.
    ensureTracked()

    if (!wasLockedRef.current) {
      void viewer.flyTo(aircraft, {
        offset: new HeadingPitchRange(0, CesiumMath.toRadians(-28), 620),
        duration: 0.8
      })
      wasLockedRef.current = true
    }

    viewer.scene.preRender.addEventListener(ensureTracked)

    return () => {
      viewer.scene.preRender.removeEventListener(ensureTracked)
    }
  }, [viewer, aircraft, isLocked])
}
