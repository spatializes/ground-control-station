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

interface StabilizedPosition {
  latitudeDeg: number
  longitudeDeg: number
  altitudeM: number
}

const EARTH_RADIUS_M = 6_371_000
const LIVE_STATIONARY_SPEED_MPS = 0.8
const LIVE_STATIONARY_DISTANCE_M = 1.6
const LIVE_STATIONARY_HORIZONTAL_DEADBAND_M = 0.9
const LIVE_MOVING_HORIZONTAL_DEADBAND_M = 0.2
const LIVE_STATIONARY_ALTITUDE_DEADBAND_M = 0.9
const LIVE_MOVING_ALTITUDE_DEADBAND_M = 0.25
const LIVE_STATIONARY_POSITION_ALPHA = 0.22
const LIVE_MOVING_POSITION_ALPHA = 0.5
const LIVE_STATIONARY_ALTITUDE_ALPHA = 0.12
const LIVE_MOVING_ALTITUDE_ALPHA = 0.36

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

function horizontalDistanceM(
  latitudeStartDeg: number,
  longitudeStartDeg: number,
  latitudeEndDeg: number,
  longitudeEndDeg: number
): number {
  const latitudeStartRad = toRadians(latitudeStartDeg)
  const latitudeEndRad = toRadians(latitudeEndDeg)
  const deltaLatitudeRad = toRadians(latitudeEndDeg - latitudeStartDeg)
  const deltaLongitudeRad = toRadians(longitudeEndDeg - longitudeStartDeg)

  const sinLatitude = Math.sin(deltaLatitudeRad / 2)
  const sinLongitude = Math.sin(deltaLongitudeRad / 2)
  const a =
    sinLatitude * sinLatitude +
    Math.cos(latitudeStartRad) * Math.cos(latitudeEndRad) * sinLongitude * sinLongitude

  return EARTH_RADIUS_M * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

function lerp(currentValue: number, targetValue: number, alpha: number): number {
  return currentValue + (targetValue - currentValue) * alpha
}

function stabilizeLivePosition(previous: StabilizedPosition | null, frame: TelemetryFrame): StabilizedPosition {
  const raw: StabilizedPosition = {
    latitudeDeg: frame.latitudeDeg,
    longitudeDeg: frame.longitudeDeg,
    altitudeM: frame.altitudeM
  }

  if (!previous) {
    return raw
  }

  const horizontalDeltaM = horizontalDistanceM(
    previous.latitudeDeg,
    previous.longitudeDeg,
    raw.latitudeDeg,
    raw.longitudeDeg
  )
  const altitudeDeltaM = Math.abs(raw.altitudeM - previous.altitudeM)
  const speedMps = Math.max(frame.gpsSpeedMps, frame.airspeedMps)
  const isStationary = speedMps < LIVE_STATIONARY_SPEED_MPS && horizontalDeltaM < LIVE_STATIONARY_DISTANCE_M

  const horizontalDeadbandM = isStationary
    ? LIVE_STATIONARY_HORIZONTAL_DEADBAND_M
    : LIVE_MOVING_HORIZONTAL_DEADBAND_M
  const altitudeDeadbandM = isStationary
    ? LIVE_STATIONARY_ALTITUDE_DEADBAND_M
    : LIVE_MOVING_ALTITUDE_DEADBAND_M

  const positionAlpha = isStationary ? LIVE_STATIONARY_POSITION_ALPHA : LIVE_MOVING_POSITION_ALPHA
  const altitudeAlpha = isStationary ? LIVE_STATIONARY_ALTITUDE_ALPHA : LIVE_MOVING_ALTITUDE_ALPHA

  const targetLatitudeDeg = horizontalDeltaM < horizontalDeadbandM ? previous.latitudeDeg : raw.latitudeDeg
  const targetLongitudeDeg = horizontalDeltaM < horizontalDeadbandM ? previous.longitudeDeg : raw.longitudeDeg
  const targetAltitudeM = altitudeDeltaM < altitudeDeadbandM ? previous.altitudeM : raw.altitudeM

  return {
    latitudeDeg: lerp(previous.latitudeDeg, targetLatitudeDeg, positionAlpha),
    longitudeDeg: lerp(previous.longitudeDeg, targetLongitudeDeg, positionAlpha),
    altitudeM: lerp(previous.altitudeM, targetAltitudeM, altitudeAlpha)
  }
}

export function useAircraftEntity(viewer: Viewer | null, frame: TelemetryFrame | null): Entity | null {
  const [entity, setEntity] = useState<Entity | null>(null)
  const hasInitialFrameFocusRef = useRef(false)
  const liveStabilizedPositionRef = useRef<StabilizedPosition | null>(null)

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
