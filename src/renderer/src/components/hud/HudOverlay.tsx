import type { TelemetryFrame } from '@shared/types'
import { AltitudeCard } from './AltitudeCard'
import { SpeedCard } from './SpeedCard'
import { AttitudeCard } from './AttitudeCard'
import { PositionCard } from './PositionCard'

interface HudOverlayProps {
  frame: TelemetryFrame | null
}

export function HudOverlay({ frame }: HudOverlayProps) {
  return (
    <section className="hud-overlay" aria-label="Telemetry overlay">
      <AltitudeCard altitudeM={frame?.altitudeM ?? null} />
      <SpeedCard label="Ground" speedMps={frame?.gpsSpeedMps ?? null} />
      <SpeedCard label="Airspeed" speedMps={frame?.airspeedMps ?? null} />
      <AttitudeCard label="Pitch" valueDeg={frame?.pitchDeg ?? null} signed />
      <AttitudeCard label="Roll" valueDeg={frame?.rollDeg ?? null} signed />
      <AttitudeCard label="Yaw" valueDeg={frame?.yawDeg ?? null} />
      <PositionCard latitudeDeg={frame?.latitudeDeg ?? null} longitudeDeg={frame?.longitudeDeg ?? null} />
    </section>
  )
}
