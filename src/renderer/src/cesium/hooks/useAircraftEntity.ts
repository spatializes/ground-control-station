import { useEffect, useRef, useState } from 'react'
import {
  Cartesian3,
  ConstantPositionProperty,
  ConstantProperty,
  Entity,
  JulianDate,
  Math as CesiumMath,
  Transforms,
  Viewer
} from 'cesium'
import type { TelemetryFrame } from '@shared/types'
import { toCesiumOrientation } from '../../lib/telemetry/toCesiumOrientation'
import {
  stabilizeLivePosition,
  type StabilizedLivePositionState
} from '../../lib/telemetry/livePositionStabilizer'

export function useAircraftEntity(viewer: Viewer | null, frame: TelemetryFrame | null): Entity | null {
  const [entity, setEntity] = useState<Entity | null>(null)
  const hasInitialFrameFocusRef = useRef(false)
  const liveStabilizedPositionRef = useRef<StabilizedLivePositionState | null>(null)

  useEffect(() => {
    if (!viewer) {
      setEntity(null)
      return
    }

    hasInitialFrameFocusRef.current = false
    liveStabilizedPositionRef.current = null

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
      liveStabilizedPositionRef.current = null
    }
  }, [viewer])

  useEffect(() => {
    if (!entity || !frame) {
      return
    }

    const hasPositionFix = frame.hasPositionFix !== false
    let position: Cartesian3

    if (hasPositionFix) {
      if (frame.source === 'live') {
        const stabilized = stabilizeLivePosition(liveStabilizedPositionRef.current, frame)
        liveStabilizedPositionRef.current = stabilized
        position = Cartesian3.fromDegrees(stabilized.longitudeDeg, stabilized.latitudeDeg, Math.max(1, stabilized.altitudeM))
      } else {
        liveStabilizedPositionRef.current = null
        position = Cartesian3.fromDegrees(frame.longitudeDeg, frame.latitudeDeg, Math.max(1, frame.altitudeM))
      }
    } else {
      position = entity.position?.getValue(JulianDate.now()) ?? Cartesian3.fromDegrees(-122.4194, 37.7749, 200)
    }

    if (hasPositionFix) {
      entity.position = new ConstantPositionProperty(position)
    }

    entity.orientation = new ConstantProperty(Transforms.headingPitchRollQuaternion(position, toCesiumOrientation(frame)))
  }, [entity, frame])

  useEffect(() => {
    if (!viewer || !frame) {
      return
    }

    if (frame.hasPositionFix === false) {
      return
    }

    if (hasInitialFrameFocusRef.current) {
      return
    }

    const focusLatitudeDeg =
      frame.source === 'live' ? liveStabilizedPositionRef.current?.latitudeDeg ?? frame.latitudeDeg : frame.latitudeDeg
    const focusLongitudeDeg =
      frame.source === 'live'
        ? liveStabilizedPositionRef.current?.longitudeDeg ?? frame.longitudeDeg
        : frame.longitudeDeg
    const focusAltitudeM =
      frame.source === 'live' ? liveStabilizedPositionRef.current?.altitudeM ?? frame.altitudeM : frame.altitudeM

    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(focusLongitudeDeg, focusLatitudeDeg, Math.max(350, focusAltitudeM + 900)),
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
