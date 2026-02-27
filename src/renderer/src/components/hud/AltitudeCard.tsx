interface AltitudeCardProps {
  altitudeM: number | null
}

function formatAltitude(altitudeM: number | null): string {
  return altitudeM === null ? '--' : altitudeM.toFixed(1)
}

export function AltitudeCard({ altitudeM }: AltitudeCardProps) {
  return (
    <article className="hud-card" aria-label="Altitude">
      <span className="hud-label">Altitude</span>
      <span className="hud-value">{formatAltitude(altitudeM)}</span>
      <span className="hud-unit">m</span>
    </article>
  )
}
