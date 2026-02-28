import type { MouseEvent as ReactMouseEvent, WheelEvent as ReactWheelEvent } from 'react'
import { useMemo, useRef } from 'react'
import type { TelemetryFrame } from '@shared/types'
import { clamp } from '../../lib/format'
import { buildAltitudeProfile, PROFILE_VERTICAL_PADDING } from '../../lib/telemetry/buildAltitudeProfile'

interface AltitudeProfilePanelProps {
  frames: TelemetryFrame[]
  currentProgress: number
  currentAltitudeM: number | null
  isCollapsed: boolean
  isInteractive: boolean
  onToggleCollapsed: () => void
  onHoverScrub: (progress: number) => void
}

const PROFILE_WIDTH = 920
const PROFILE_HEIGHT = 132
const MARKER_RADIUS = 4

function progressFromClientX(svgElement: SVGSVGElement, clientX: number): number {
  const ctm = svgElement.getScreenCTM()
  if (!ctm) {
    return 0
  }

  const point = svgElement.createSVGPoint()
  point.x = clientX
  point.y = 0

  const svgPoint = point.matrixTransform(ctm.inverse())
  return clamp(svgPoint.x / PROFILE_WIDTH, 0, 1)
}

export function AltitudeProfilePanel({
  frames,
  currentProgress,
  currentAltitudeM,
  isCollapsed,
  isInteractive,
  onToggleCollapsed,
  onHoverScrub
}: AltitudeProfilePanelProps) {
  const profile = useMemo(() => buildAltitudeProfile(frames, PROFILE_WIDTH, PROFILE_HEIGHT), [frames])

  const svgRef = useRef<SVGSVGElement | null>(null)

  const handleInteractivePointer = (event: ReactMouseEvent<SVGSVGElement>): void => {
    if (!isInteractive || !svgRef.current) {
      return
    }

    const progress = progressFromClientX(svgRef.current, event.clientX)
    onHoverScrub(progress)
  }

  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>): void => {
    if (!isInteractive) {
      return
    }

    event.preventDefault()
    const delta = event.deltaY > 0 ? 0.01 : -0.01
    onHoverScrub(clamp(currentProgress + delta, 0, 1))
  }

  const markerX = clamp(currentProgress, 0, 1) * PROFILE_WIDTH
  const markerY =
    profile && currentAltitudeM !== null
      ? clamp(
          PROFILE_VERTICAL_PADDING +
            (1 -
              (currentAltitudeM - profile.minAltitudeM) / Math.max(1, profile.maxAltitudeM - profile.minAltitudeM)) *
              Math.max(1, PROFILE_HEIGHT - PROFILE_VERTICAL_PADDING * 2),
          MARKER_RADIUS + 1,
          PROFILE_HEIGHT - MARKER_RADIUS - 1
        )
      : PROFILE_HEIGHT / 2

  return (
    <section className="altitude-panel" aria-label="Altitude profile">
      <div className="panel-header">
        <h2>Altitude Profile</h2>
        <div className="altitude-controls">
          {profile ? (
            <div className="altitude-range">
              <span>Min {profile.minAltitudeM.toFixed(1)} m</span>
              <span>Max {profile.maxAltitudeM.toFixed(1)} m</span>
            </div>
          ) : null}
          <button
            type="button"
            className="ghost-btn panel-close-btn"
            aria-label={isCollapsed ? 'Expand altitude profile' : 'Collapse altitude profile'}
            onClick={onToggleCollapsed}
          >
            {isCollapsed ? '+' : '-'}
          </button>
        </div>
      </div>

      {isCollapsed ? null : profile ? (
        <>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${PROFILE_WIDTH} ${PROFILE_HEIGHT}`}
            className={`altitude-svg ${isInteractive ? 'interactive' : ''}`}
            role="img"
            onMouseMove={handleInteractivePointer}
            onMouseDown={handleInteractivePointer}
            onWheel={handleWheel}
          >
            <path d={profile.path} className="altitude-path" />
            <line
              x1={markerX}
              y1={0}
              x2={markerX}
              y2={PROFILE_HEIGHT}
              className="altitude-marker-line"
            />
            <circle cx={markerX} cy={markerY} r={MARKER_RADIUS} className="altitude-marker-dot" />
          </svg>
        </>
      ) : (
        <p className="panel-help">Load replay data to display the altitude profile.</p>
      )}
    </section>
  )
}
