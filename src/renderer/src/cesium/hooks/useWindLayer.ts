import { useEffect, useRef } from 'react'
import {
  Cartesian3,
  Color,
  ConstantProperty,
  Matrix4,
  PolylineGlowMaterialProperty,
  Transforms,
  Viewer
} from 'cesium'
import type { Entity } from 'cesium'
import type { TelemetryFrame, WindConfig } from '@shared/types'

interface WindSlot {
  entity: Entity
  eastOffsetM: number
  northOffsetM: number
  upOffsetM: number
}

const WIND_SLOT_COUNT = 20

function createWindSlots(viewer: Viewer): WindSlot[] {
  const slots: WindSlot[] = []

  for (let index = 0; index < WIND_SLOT_COUNT; index += 1) {
    const angle = (index * 2 * Math.PI) / WIND_SLOT_COUNT
    const radius = 90 + (index % 5) * 18

    const entity = viewer.entities.add({
      polyline: {
        positions: [Cartesian3.ZERO, Cartesian3.ZERO],
        width: 2,
        material: new PolylineGlowMaterialProperty({
          color: new Color(0.2, 0.7, 0.98, 0.7),
          glowPower: 0.2
        })
      }
    })

    slots.push({
      entity,
      eastOffsetM: Math.cos(angle) * radius,
      northOffsetM: Math.sin(angle) * radius,
      upOffsetM: 16 + (index % 4) * 8
    })
  }

  return slots
}

export function useWindLayer(viewer: Viewer | null, frame: TelemetryFrame | null, wind: WindConfig): void {
  const slotsRef = useRef<WindSlot[]>([])

  useEffect(() => {
    if (!viewer) {
      return
    }

    const slots = createWindSlots(viewer)
    slotsRef.current = slots

    return () => {
      for (const slot of slots) {
        viewer.entities.remove(slot.entity)
      }
      slotsRef.current = []
    }
  }, [viewer])

  useEffect(() => {
    if (!frame) {
      return
    }

    const slots = slotsRef.current
    if (slots.length === 0) {
      return
    }

    const anchor = Cartesian3.fromDegrees(frame.longitudeDeg, frame.latitudeDeg, Math.max(1, frame.altitudeM))
    const transform = Transforms.eastNorthUpToFixedFrame(anchor)

    const flowHeadingRad = ((wind.fromDirectionDeg + 180) * Math.PI) / 180
    const eastFlow = Math.sin(flowHeadingRad)
    const northFlow = Math.cos(flowHeadingRad)

    const flowLength = 20 + wind.speedMps * 2
    const tickSeconds = performance.now() / 1000

    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index]
      const phase = ((tickSeconds * wind.speedMps * 9 + index * 11) % 30) - 15

      const startLocal = new Cartesian3(
        slot.eastOffsetM + phase * eastFlow,
        slot.northOffsetM + phase * northFlow,
        slot.upOffsetM
      )

      const endLocal = new Cartesian3(
        startLocal.x + eastFlow * flowLength,
        startLocal.y + northFlow * flowLength,
        slot.upOffsetM
      )

      const startWorld = Matrix4.multiplyByPoint(transform, startLocal, new Cartesian3())
      const endWorld = Matrix4.multiplyByPoint(transform, endLocal, new Cartesian3())

      slot.entity.polyline!.positions = new ConstantProperty([startWorld, endWorld])
    }
  }, [frame, wind])
}
