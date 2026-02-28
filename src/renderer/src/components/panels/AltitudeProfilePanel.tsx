import type { MouseEvent as ReactMouseEvent, WheelEvent as ReactWheelEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { TelemetryFrame } from '@shared/types'
import { clamp } from '../../lib/format'
import { formatDuration } from '../../lib/format'
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

const DEFAULT_PROFILE_WIDTH = 920
const PROFILE_HEIGHT = 170
const PLOT_MARGIN_LEFT = 54
const PLOT_MARGIN_TOP = 10
const PLOT_MARGIN_RIGHT = 14
const PLOT_MARGIN_BOTTOM = 34
const PLOT_HEIGHT = PROFILE_HEIGHT - PLOT_MARGIN_TOP - PLOT_MARGIN_BOTTOM
const MARKER_RADIUS = 4

function progressFromClientX(svgElement: SVGSVGElement, clientX: number, plotWidth: number): number {
  const ctm = svgElement.getScreenCTM()
  if (!ctm) {
    return 0
  }

  const point = svgElement.createSVGPoint()
  point.x = clientX
  point.y = 0

  const svgPoint = point.matrixTransform(ctm.inverse())
  return clamp((svgPoint.x - PLOT_MARGIN_LEFT) / Math.max(1, plotWidth), 0, 1)
}

function altitudeToPlotY(altitudeM: number, minAltitudeM: number, maxAltitudeM: number): number {
  const normalizedAltitude = (altitudeM - minAltitudeM) / Math.max(1, maxAltitudeM - minAltitudeM)
  return (
    PLOT_MARGIN_TOP +
    PROFILE_VERTICAL_PADDING +
    (1 - normalizedAltitude) * Math.max(1, PLOT_HEIGHT - PROFILE_VERTICAL_PADDING * 2)
  )
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
  const plotWrapperRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [profileWidth, setProfileWidth] = useState(DEFAULT_PROFILE_WIDTH)

  useEffect(() => {
    const element = plotWrapperRef.current
    if (!element) {
      return
    }

    const syncWidth = (): void => {
      setProfileWidth(Math.max(480, Math.round(element.clientWidth)))
    }

    syncWidth()

    const observer = new ResizeObserver(() => {
      syncWidth()
    })

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [])

  const plotWidth = Math.max(1, profileWidth - PLOT_MARGIN_LEFT - PLOT_MARGIN_RIGHT)
  const profile = useMemo(() => buildAltitudeProfile(frames, plotWidth, PLOT_HEIGHT), [frames, plotWidth])
  const totalDurationMs = useMemo(() => {
    if (frames.length < 2) {
      return 0
    }

    return frames[frames.length - 1].timestampMs - frames[0].timestampMs
  }, [frames])

  const handleInteractivePointer = (event: ReactMouseEvent<SVGSVGElement>): void => {
    if (!isInteractive || !svgRef.current) {
      return
    }

    const progress = progressFromClientX(svgRef.current, event.clientX, plotWidth)
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

  const markerX = PLOT_MARGIN_LEFT + clamp(currentProgress, 0, 1) * plotWidth
  const markerY =
    profile && currentAltitudeM !== null
      ? clamp(
          altitudeToPlotY(currentAltitudeM, profile.minAltitudeM, profile.maxAltitudeM),
          PLOT_MARGIN_TOP + MARKER_RADIUS + 1,
          PLOT_MARGIN_TOP + PLOT_HEIGHT - MARKER_RADIUS - 1
        )
      : PLOT_MARGIN_TOP + PLOT_HEIGHT / 2

  const yTicks =
    profile === null
      ? []
      : [profile.maxAltitudeM, (profile.maxAltitudeM + profile.minAltitudeM) / 2, profile.minAltitudeM].map(
          (value) => ({
            value,
            y: altitudeToPlotY(value, profile.minAltitudeM, profile.maxAltitudeM)
          })
        )

  const xTicks = [0, 0.5, 1].map((progress) => ({
    key: `x-${progress.toFixed(2)}`,
    x: PLOT_MARGIN_LEFT + progress * plotWidth,
    label: formatDuration(totalDurationMs * progress)
  }))

  return (
    <section className="altitude-panel" aria-label="Altitude profile">
      <div className="panel-header">
        <h2>Altitude Profile</h2>
        <div className="altitude-controls">
          {profile ? (
            <div className="altitude-range">
              <span>Min {profile.minAltitudeM.toFixed(1)} m</span>
              <span>Max {profile.maxAltitudeM.toFixed(1)} m</span>
              <span>Span {(profile.maxAltitudeM - profile.minAltitudeM).toFixed(1)} m</span>
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
        <div ref={plotWrapperRef} className="altitude-plot-wrap">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${profileWidth} ${PROFILE_HEIGHT}`}
            className={`altitude-svg ${isInteractive ? 'interactive' : ''}`}
            role="img"
            onMouseMove={handleInteractivePointer}
            onMouseDown={handleInteractivePointer}
            onWheel={handleWheel}
          >
            {yTicks.map((tick) => (
              <g key={`alt-y-${tick.value.toFixed(2)}`}>
                <line x1={PLOT_MARGIN_LEFT} y1={tick.y} x2={PLOT_MARGIN_LEFT + plotWidth} y2={tick.y} className="altitude-grid-line" />
                <text x={PLOT_MARGIN_LEFT - 8} y={tick.y + 3} className="altitude-axis-tick" textAnchor="end">
                  {tick.value.toFixed(0)}
                </text>
              </g>
            ))}

            <text x={PLOT_MARGIN_LEFT} y={PLOT_MARGIN_TOP - 2} className="altitude-axis-caption">
              Altitude (m)
            </text>

            {xTicks.map((tick) => (
              <g key={tick.key}>
                <line
                  x1={tick.x}
                  y1={PLOT_MARGIN_TOP + PLOT_HEIGHT}
                  x2={tick.x}
                  y2={PLOT_MARGIN_TOP + PLOT_HEIGHT + 4}
                  className="altitude-x-tick"
                />
                <text x={tick.x} y={PLOT_MARGIN_TOP + PLOT_HEIGHT + 16} className="altitude-axis-tick" textAnchor="middle">
                  {tick.label}
                </text>
              </g>
            ))}

            <text x={PLOT_MARGIN_LEFT + plotWidth / 2} y={PROFILE_HEIGHT - 4} className="altitude-axis-caption" textAnchor="middle">
              Mission Time
            </text>

            <g transform={`translate(${PLOT_MARGIN_LEFT} ${PLOT_MARGIN_TOP})`}>
              <path d={profile.path} className="altitude-path" />
            </g>
            <line
              x1={markerX}
              y1={PLOT_MARGIN_TOP}
              x2={markerX}
              y2={PLOT_MARGIN_TOP + PLOT_HEIGHT}
              className="altitude-marker-line"
            />
            <circle cx={markerX} cy={markerY} r={MARKER_RADIUS} className="altitude-marker-dot" />
          </svg>
        </div>
      ) : (
        <p className="panel-help">Load replay data to display the altitude profile.</p>
      )}
    </section>
  )
}
