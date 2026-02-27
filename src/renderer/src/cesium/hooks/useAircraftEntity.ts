import { useEffect, useRef, useState } from 'react'
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
  const hasInitialFrameFocusRef = useRef(false)

  useEffect(() => {
    if (!viewer) {
      setEntity(null)
      return
    }

    hasInitialFrameFocusRef.current = false

    const aircraft = viewer.entities.add({
      name: 'Aircraft',
      position: Cartesian3.fromDegrees(-122.4194, 37.7749, 200),
      model: {
        uri: './models/CesiumDrone.glb',
        minimumPixelSize: 110,
        maximumScale: 320,
        scale: 2.1
      },
      viewFrom: new ConstantProperty(new Cartesian3(-520, -120, 260))
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

    if (hasInitialFrameFocusRef.current) {
      return
    }

    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(frame.longitudeDeg, frame.latitudeDeg, Math.max(350, frame.altitudeM + 900)),
      orientation: {
        heading: CesiumMath.toRadians(frame.yawDeg),
        pitch: CesiumMath.toRadians(-25),
        roll: 0
      },
      duration: 0.6
    })

    hasInitialFrameFocusRef.current = true
  }, [viewer, frame])

  return entity
}
