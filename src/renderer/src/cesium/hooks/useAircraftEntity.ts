import { useEffect, useState } from 'react'
import {
  Cartesian3,
  ConstantPositionProperty,
  ConstantProperty,
  Entity,
  Math as CesiumMath,
  Transforms,
  Viewer
} from 'cesium'
import type { TelemetryFrame } from '@shared/types'
import { toCesiumOrientation } from '../../lib/telemetry/toCesiumOrientation'

export function useAircraftEntity(viewer: Viewer | null, frame: TelemetryFrame | null): Entity | null {
  const [entity, setEntity] = useState<Entity | null>(null)

  useEffect(() => {
    if (!viewer) {
      setEntity(null)
      return
    }

    const aircraft = viewer.entities.add({
      name: 'Aircraft',
      position: Cartesian3.fromDegrees(-122.4194, 37.7749, 200),
      model: {
        uri: '/models/Cesium_Air.glb',
        minimumPixelSize: 80,
        maximumScale: 240,
        scale: 1.3
      }
    })

    setEntity(aircraft)

    return () => {
      viewer.entities.remove(aircraft)
      setEntity(null)
    }
  }, [viewer])

  useEffect(() => {
    if (!entity || !frame) {
      return
    }

    const altitudeM = Math.max(1, frame.altitudeM)
    const position = Cartesian3.fromDegrees(frame.longitudeDeg, frame.latitudeDeg, altitudeM)
    entity.position = new ConstantPositionProperty(position)
    entity.orientation = new ConstantProperty(Transforms.headingPitchRollQuaternion(position, toCesiumOrientation(frame)))
  }, [entity, frame])

  useEffect(() => {
    if (!viewer || !frame) {
      return
    }

    if (viewer.camera.positionCartographic.height > 200000) {
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(frame.longitudeDeg, frame.latitudeDeg, Math.max(350, frame.altitudeM + 900)),
        orientation: {
          heading: CesiumMath.toRadians(frame.yawDeg),
          pitch: CesiumMath.toRadians(-25),
          roll: 0
        },
        duration: 0.6
      })
    }
  }, [viewer, frame])

  return entity
}
