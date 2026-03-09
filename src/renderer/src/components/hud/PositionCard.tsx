interface PositionCardProps {
  latitudeDeg: number | null
  longitudeDeg: number | null
  hasPositionFix: boolean
  satellitesVisible: number | null
}

function formatCoordinate(value: number | null): string {
  return value === null ? '--' : value.toFixed(5)
}

function formatSatellites(value: number | null): string {
  return value === null ? '--' : value.toString()
}

export function PositionCard({ latitudeDeg, longitudeDeg, hasPositionFix, satellitesVisible }: PositionCardProps) {
  return (
    <article className="hud-card hud-card-position" aria-label="Position">
      <span className="hud-label">Position</span>
      <div className="position-row">
        <span>Lat</span>
        <strong>{hasPositionFix ? formatCoordinate(latitudeDeg) : '--'}</strong>
      </div>
      <div className="position-row">
        <span>Lon</span>
        <strong>{hasPositionFix ? formatCoordinate(longitudeDeg) : '--'}</strong>
      </div>
      <div className="position-row">
        <span>Sats</span>
        <strong>{formatSatellites(satellitesVisible)}</strong>
      </div>
      <span className={`hud-note${hasPositionFix ? ' hud-note-hidden' : ''}`} aria-hidden={hasPositionFix}>
        No GPS fix
      </span>
    </article>
  )
}
