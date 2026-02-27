import { useEffect, useMemo, useRef, useState } from 'react'
import { UrlTemplateImageryProvider, Viewer } from 'cesium'
import type { TelemetryFrame, WindConfig } from '@shared/types'
import { useAircraftEntity } from './hooks/useAircraftEntity'
import { useCameraLock } from './hooks/useCameraLock'
import { useWindLayer } from './hooks/useWindLayer'

interface CesiumSceneProps {
  frame: TelemetryFrame | null
  cameraLocked: boolean
  wind: WindConfig
}

export function CesiumScene({ frame, cameraLocked, wind }: CesiumSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [viewer, setViewer] = useState<Viewer | null>(null)

  const imageryProvider = useMemo(
    () =>
      new UrlTemplateImageryProvider({
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        credit: '© OpenStreetMap contributors'
      }),
    []
  )

  const aircraft = useAircraftEntity(viewer, frame)
  useCameraLock(viewer, aircraft, cameraLocked)
  useWindLayer(viewer, frame, wind)

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    const nextViewer = new Viewer(containerRef.current, {
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      shouldAnimate: true,
      shadows: false,
      terrainProvider: undefined
    })

    nextViewer.imageryLayers.removeAll()
    nextViewer.imageryLayers.addImageryProvider(imageryProvider)

    nextViewer.scene.globe.depthTestAgainstTerrain = false
    setViewer(nextViewer)

    return () => {
      setViewer(null)
      nextViewer.destroy()
    }
  }, [imageryProvider])

  return <div ref={containerRef} className="cesium-canvas" />
}
