interface PositionCardProps {
  latitudeDeg: number | null
  longitudeDeg: number | null
}

function formatCoordinate(value: number | null): string {
  return value === null ? '--' : value.toFixed(5)
}

export function PositionCard({ latitudeDeg, longitudeDeg }: PositionCardProps) {
  return (
    <article className="hud-card hud-card-position" aria-label="Position">
      <span className="hud-label">Position</span>
      <div className="position-row">
        <span>Lat</span>
        <strong>{formatCoordinate(latitudeDeg)}</strong>
      </div>
      <div className="position-row">
        <span>Lon</span>
        <strong>{formatCoordinate(longitudeDeg)}</strong>
      </div>
    </article>
  )
}
