import { useEffect, useRef } from 'react'
import {
  BillboardCollection,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  HorizontalOrigin,
  SceneTransforms,
  VerticalOrigin,
  Viewer
} from 'cesium'
import type { Billboard } from 'cesium'
import type { TelemetryFrame, ThemeMode, WindConfig } from '@shared/types'
import { haversineDistanceM, offsetLatLonByMeters, toFlowVector } from '../../lib/wind/windMath'

interface WindParticle {
  billboard: Billboard
  color: Color
  basePixelSize: number
  latitudeDeg: number
  longitudeDeg: number
  altitudeM: number
  ageSeconds: number
  lifeSeconds: number
  curlPhase: number
  curlStrength: number
  rotationRad: number
  worldPosition: Cartesian3
  previousWorldPosition: Cartesian3
  screenPosition: Cartesian2
  previousScreenPosition: Cartesian2
}

interface WindLayerState {
  collection: BillboardCollection
  particles: WindParticle[]
  tickSeconds: number
  lastTickMs: number
  screenCenter: Cartesian2
  scratchCartographic: Cartographic
}

interface WindFieldSettings {
  activeParticleCount: number
  radiusMinM: number
  radiusMaxM: number
  altitudeMinM: number
  altitudeMaxM: number
  speedBoost: number
  alphaMin: number
  alphaMax: number
  pixelScale: number
  tailScale: number
}

const WIND_PARTICLE_POOL_SIZE = 260
const WIND_ENTRY_ARC_RAD = Math.PI * 0.85
const WIND_BASE_FLOW_MPS = 4.8
const WIND_SPEED_SCALE = 2.65

const ZOOM_HEIGHT_MIN_M = 120
const ZOOM_HEIGHT_MAX_M = 220_000

const LIGHT_WIND_COLOR = new Color(0.31, 0.72, 0.97, 1)
const DARK_WIND_COLOR = new Color(0.47, 0.89, 1, 1)

function toWindowCoordinates(viewer: Viewer, worldPosition: Cartesian3, result: Cartesian2): Cartesian2 | undefined {
  const sceneTransforms = SceneTransforms as unknown as {
    worldToWindowCoordinates?: (scene: Viewer['scene'], position: Cartesian3, output?: Cartesian2) => Cartesian2 | undefined
  }

  if (sceneTransforms.worldToWindowCoordinates) {
    return sceneTransforms.worldToWindowCoordinates(viewer.scene, worldPosition, result)
  }

  const sceneWithFallback = viewer.scene as unknown as {
    cartesianToCanvasCoordinates?: (position: Cartesian3, output?: Cartesian2) => Cartesian2 | undefined
  }

  return sceneWithFallback.cartesianToCanvasCoordinates?.(worldPosition, result)
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress
}

function randomInRange(minimum: number, maximum: number): number {
  return minimum + (maximum - minimum) * Math.random()
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI
}

function createWindSpriteCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 24

  const context = canvas.getContext('2d')
  if (!context) {
    return canvas
  }

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.lineCap = 'round'
  context.lineWidth = 8

  const gradient = context.createLinearGradient(6, 12, 118, 12)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0)')
  gradient.addColorStop(0.45, 'rgba(255, 255, 255, 0.10)')
  gradient.addColorStop(0.78, 'rgba(255, 255, 255, 0.50)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0.96)')

  context.strokeStyle = gradient
  context.beginPath()
  context.moveTo(7, 12)
  context.lineTo(116, 12)
  context.stroke()

  context.fillStyle = 'rgba(255, 255, 255, 1)'
  context.beginPath()
  context.arc(116, 12, 4.8, 0, Math.PI * 2)
  context.fill()

  return canvas
}

function buildFieldSettings(cameraHeightM: number): WindFieldSettings {
  const minLog = Math.log10(ZOOM_HEIGHT_MIN_M)
  const maxLog = Math.log10(ZOOM_HEIGHT_MAX_M)
  const zoomProgress = clampNumber((Math.log10(Math.max(cameraHeightM, ZOOM_HEIGHT_MIN_M)) - minLog) / (maxLog - minLog), 0, 1)

  return {
    activeParticleCount: Math.round(lerp(90, 250, zoomProgress)),
    radiusMinM: lerp(80, 3_000, zoomProgress),
    radiusMaxM: lerp(500, 180_000, zoomProgress),
    altitudeMinM: lerp(14, 80, zoomProgress),
    altitudeMaxM: lerp(58, 1_000, zoomProgress),
    speedBoost: lerp(1.4, 6.6, zoomProgress),
    alphaMin: lerp(0.19, 0.09, zoomProgress),
    alphaMax: lerp(0.57, 0.27, zoomProgress),
    pixelScale: lerp(0.95, 1.9, zoomProgress),
    tailScale: lerp(1.05, 2.15, zoomProgress)
  }
}

function resolveWindCenter(
  viewer: Viewer,
  frame: TelemetryFrame,
  screenCenter: Cartesian2,
  scratchCartographic: Cartographic
): { latitudeDeg: number; longitudeDeg: number } {
  const canvas = viewer.scene.canvas
  screenCenter.x = canvas.clientWidth * 0.5
  screenCenter.y = canvas.clientHeight * 0.5

  const picked = viewer.camera.pickEllipsoid(screenCenter, viewer.scene.globe.ellipsoid)
  if (picked) {
    const cartographic = Cartographic.fromCartesian(picked, undefined, scratchCartographic)
    if (cartographic) {
      return {
        latitudeDeg: radiansToDegrees(cartographic.latitude),
        longitudeDeg: radiansToDegrees(cartographic.longitude)
      }
    }
  }

  return {
    latitudeDeg: frame.latitudeDeg,
    longitudeDeg: frame.longitudeDeg
  }
}

function resetParticle(
  particle: WindParticle,
  centerLatitudeDeg: number,
  centerLongitudeDeg: number,
  flowHeadingRad: number,
  settings: WindFieldSettings,
  leadingEdge: boolean
): void {
  const spawnHeadingRad = leadingEdge
    ? flowHeadingRad + Math.PI + (Math.random() - 0.5) * WIND_ENTRY_ARC_RAD
    : Math.random() * Math.PI * 2

  const spawnRadiusM = leadingEdge
    ? randomInRange(settings.radiusMinM, settings.radiusMaxM) * randomInRange(0.74, 1)
    : randomInRange(settings.radiusMinM, settings.radiusMaxM)

  const eastOffsetM = Math.sin(spawnHeadingRad) * spawnRadiusM
  const northOffsetM = Math.cos(spawnHeadingRad) * spawnRadiusM
  const shifted = offsetLatLonByMeters(centerLatitudeDeg, centerLongitudeDeg, eastOffsetM, northOffsetM)

  particle.latitudeDeg = shifted.latitudeDeg
  particle.longitudeDeg = shifted.longitudeDeg
  particle.altitudeM = randomInRange(settings.altitudeMinM, settings.altitudeMaxM)
  particle.ageSeconds = 0
  particle.lifeSeconds = randomInRange(1.9, 3.9)
}

function createWindParticles(collection: BillboardCollection, image: HTMLCanvasElement): WindParticle[] {
  const particles: WindParticle[] = []

  for (let index = 0; index < WIND_PARTICLE_POOL_SIZE; index += 1) {
    const basePixelSize = randomInRange(2.4, 3.8)
    const color = Color.clone(LIGHT_WIND_COLOR)

    const billboard = collection.add({
      image,
      position: Cartesian3.ZERO,
      width: 30,
      height: basePixelSize * 1.55,
      color,
      show: true,
      horizontalOrigin: HorizontalOrigin.RIGHT,
      verticalOrigin: VerticalOrigin.CENTER,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    })

    particles.push({
      billboard,
      color,
      basePixelSize,
      latitudeDeg: 0,
      longitudeDeg: 0,
      altitudeM: 20,
      ageSeconds: randomInRange(0, 3),
      lifeSeconds: randomInRange(1.9, 3.9),
      curlPhase: randomInRange(0, Math.PI * 2),
      curlStrength: randomInRange(0.58, 1.45),
      rotationRad: 0,
      worldPosition: new Cartesian3(),
      previousWorldPosition: new Cartesian3(),
      screenPosition: new Cartesian2(),
      previousScreenPosition: new Cartesian2()
    })
  }

  return particles
}

export function useWindLayer(
  viewer: Viewer | null,
  frame: TelemetryFrame | null,
  wind: WindConfig,
  enabled: boolean,
  theme: ThemeMode
): void {
  const stateRef = useRef<WindLayerState | null>(null)
  const frameRef = useRef<TelemetryFrame | null>(frame)
  const windRef = useRef<WindConfig>(wind)
  const enabledRef = useRef(enabled)
  const themeRef = useRef<ThemeMode>(theme)

  useEffect(() => {
    frameRef.current = frame
  }, [frame])

  useEffect(() => {
    windRef.current = wind
  }, [wind])

  useEffect(() => {
    enabledRef.current = enabled

    const state = stateRef.current
    if (state) {
      state.collection.show = enabled
    }
  }, [enabled])

  useEffect(() => {
    themeRef.current = theme
  }, [theme])

  useEffect(() => {
    if (!viewer) {
      return
    }

    const sprite = createWindSpriteCanvas()
    const collection = new BillboardCollection()
    viewer.scene.primitives.add(collection)

    const particles = createWindParticles(collection, sprite)
    const state: WindLayerState = {
      collection,
      particles,
      tickSeconds: 0,
      lastTickMs: performance.now(),
      screenCenter: new Cartesian2(),
      scratchCartographic: new Cartographic()
    }

    stateRef.current = state

    const onPreRender = (): void => {
      const activeFrame = frameRef.current
      if (!activeFrame) {
        collection.show = false
        return
      }

      const overlayEnabled = enabledRef.current
      collection.show = overlayEnabled
      if (!overlayEnabled) {
        return
      }

      const nowMs = performance.now()
      const deltaSeconds = Math.min(0.05, Math.max(0.001, (nowMs - state.lastTickMs) / 1000))
      state.lastTickMs = nowMs
      state.tickSeconds += deltaSeconds

      const settings = buildFieldSettings(viewer.camera.positionCartographic.height)
      const center = resolveWindCenter(viewer, activeFrame, state.screenCenter, state.scratchCartographic)

      const activeWind = windRef.current
      const flowHeadingRad = ((activeWind.fromDirectionDeg + 180) * Math.PI) / 180
      const flowVector = toFlowVector(activeWind.fromDirectionDeg)
      const flowSpeedMps = (WIND_BASE_FLOW_MPS + activeWind.speedMps * WIND_SPEED_SCALE) * settings.speedBoost
      const baseColor = themeRef.current === 'dark' ? DARK_WIND_COLOR : LIGHT_WIND_COLOR

      for (let index = 0; index < state.particles.length; index += 1) {
        const particle = state.particles[index]
        const isActive = index < settings.activeParticleCount

        particle.billboard.show = isActive
        if (!isActive) {
          continue
        }

        if (particle.latitudeDeg === 0 && particle.longitudeDeg === 0) {
          resetParticle(particle, center.latitudeDeg, center.longitudeDeg, flowHeadingRad, settings, false)
        }

        const previousLatitudeDeg = particle.latitudeDeg
        const previousLongitudeDeg = particle.longitudeDeg

        particle.ageSeconds += deltaSeconds

        const driftEastMps =
          flowVector.east * flowSpeedMps +
          Math.sin(state.tickSeconds * 0.95 + particle.curlPhase + particle.latitudeDeg * 0.23) *
            particle.curlStrength *
            settings.speedBoost
        const driftNorthMps =
          flowVector.north * flowSpeedMps +
          Math.cos(state.tickSeconds * 0.88 + particle.curlPhase + particle.longitudeDeg * 0.23) *
            particle.curlStrength *
            settings.speedBoost

        const shifted = offsetLatLonByMeters(
          particle.latitudeDeg,
          particle.longitudeDeg,
          driftEastMps * deltaSeconds,
          driftNorthMps * deltaSeconds
        )

        particle.latitudeDeg = shifted.latitudeDeg
        particle.longitudeDeg = shifted.longitudeDeg

        const distanceFromCenterM = haversineDistanceM(
          center.latitudeDeg,
          center.longitudeDeg,
          particle.latitudeDeg,
          particle.longitudeDeg
        )

        if (particle.ageSeconds >= particle.lifeSeconds || distanceFromCenterM > settings.radiusMaxM * 1.05) {
          resetParticle(particle, center.latitudeDeg, center.longitudeDeg, flowHeadingRad, settings, true)
        }

        Cartesian3.fromDegrees(
          previousLongitudeDeg,
          previousLatitudeDeg,
          particle.altitudeM,
          undefined,
          particle.previousWorldPosition
        )

        Cartesian3.fromDegrees(particle.longitudeDeg, particle.latitudeDeg, particle.altitudeM, undefined, particle.worldPosition)

        particle.billboard.position = particle.worldPosition

        const currentScreen = toWindowCoordinates(viewer, particle.worldPosition, particle.screenPosition)
        const previousScreen = toWindowCoordinates(viewer, particle.previousWorldPosition, particle.previousScreenPosition)

        if (currentScreen && previousScreen) {
          const deltaX = currentScreen.x - previousScreen.x
          const deltaY = currentScreen.y - previousScreen.y
          const deltaMagnitude = Math.hypot(deltaX, deltaY)

          if (deltaMagnitude > 0.001) {
            // Cesium billboard rotation uses a math-style axis (Y up),
            // while window coordinates use Y down.
            particle.rotationRad = Math.atan2(-deltaY, deltaX)
          }
        }

        const driftSpeedMps = Math.hypot(driftEastMps, driftNorthMps)
        const tailLengthPx = clampNumber((10 + driftSpeedMps * 0.88) * settings.tailScale, 12, 68)

        particle.billboard.rotation = particle.rotationRad
        particle.billboard.width = tailLengthPx
        particle.billboard.height = particle.basePixelSize * settings.pixelScale * 1.33

        const lifeProgress = particle.ageSeconds / particle.lifeSeconds
        const fadeEnvelope = 1 - Math.abs(lifeProgress * 2 - 1)
        const alpha = clampNumber(settings.alphaMin + fadeEnvelope * (settings.alphaMax - settings.alphaMin), 0, 1)

        particle.color.red = baseColor.red
        particle.color.green = baseColor.green
        particle.color.blue = baseColor.blue
        particle.color.alpha = alpha
      }
    }

    viewer.scene.preRender.addEventListener(onPreRender)

    return () => {
      viewer.scene.preRender.removeEventListener(onPreRender)
      viewer.scene.primitives.remove(collection)
      stateRef.current = null
    }
  }, [viewer])
}
