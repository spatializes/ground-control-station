import { useEffect } from 'react'
import type { Entity, Viewer } from 'cesium'

export function useCameraLock(viewer: Viewer | null, aircraft: Entity | null, isLocked: boolean): void {
  useEffect(() => {
    if (!viewer) {
      return
    }

    viewer.trackedEntity = isLocked ? aircraft ?? undefined : undefined
  }, [viewer, aircraft, isLocked])
}
