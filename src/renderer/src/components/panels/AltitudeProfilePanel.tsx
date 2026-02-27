import { useMemo } from 'react'
import type { TelemetryFrame } from '@shared/types'
import { buildAltitudeProfile } from '../../lib/telemetry/buildAltitudeProfile'

interface AltitudeProfilePanelProps {
  frames: TelemetryFrame[]
  currentIndex: number
}

const PROFILE_WIDTH = 920
const PROFILE_HEIGHT = 132

export function AltitudeProfilePanel({ frames, currentIndex }: AltitudeProfilePanelProps) {
  const profile = useMemo(
    () => buildAltitudeProfile(frames, currentIndex, PROFILE_WIDTH, PROFILE_HEIGHT),
    [frames, currentIndex]
  )

  return (
    <section className="altitude-panel" aria-label="Altitude profile">
      <div className="panel-header">
        <h2>Altitude Profile</h2>
        {profile ? (
          <div className="altitude-range">
            <span>Min {profile.minAltitudeM.toFixed(1)} m</span>
            <span>Max {profile.maxAltitudeM.toFixed(1)} m</span>
          </div>
        ) : null}
      </div>

      {profile ? (
        <svg viewBox={`0 0 ${PROFILE_WIDTH} ${PROFILE_HEIGHT}`} className="altitude-svg" role="img">
          <path d={profile.path} className="altitude-path" />
          <line
            x1={profile.markerX}
            y1={0}
            x2={profile.markerX}
            y2={PROFILE_HEIGHT}
            className="altitude-marker-line"
          />
          <circle cx={profile.markerX} cy={profile.markerY} r={4} className="altitude-marker-dot" />
        </svg>
      ) : (
        <p className="panel-help">Load replay data to display the altitude profile.</p>
      )}
    </section>
  )
}
