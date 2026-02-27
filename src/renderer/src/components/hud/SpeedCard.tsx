import { formatMpsToKnots } from '../../lib/format'

interface SpeedCardProps {
  label: string
  speedMps: number | null
}

function formatSpeed(speedMps: number | null): string {
  return speedMps === null ? '--' : speedMps.toFixed(1)
}

export function SpeedCard({ label, speedMps }: SpeedCardProps) {
  return (
    <article className="hud-card" aria-label={label}>
      <span className="hud-label">{label}</span>
      <div className="hud-dual-value">
        <span className="hud-value">{formatSpeed(speedMps)}</span>
        <span className="hud-unit">m/s</span>
      </div>
      <div className="hud-secondary">
        <span>{speedMps === null ? '--' : formatMpsToKnots(speedMps)}</span>
        <span>kt</span>
      </div>
    </article>
  )
}
