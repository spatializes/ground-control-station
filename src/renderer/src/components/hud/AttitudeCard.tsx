import { formatSigned } from '../../lib/format'

interface AttitudeCardProps {
  label: string
  valueDeg: number | null
  signed?: boolean
}

function formatAttitude(valueDeg: number | null, signed: boolean): string {
  if (valueDeg === null) {
    return '--'
  }

  return signed ? formatSigned(valueDeg, 1) : valueDeg.toFixed(1)
}

export function AttitudeCard({ label, valueDeg, signed = false }: AttitudeCardProps) {
  return (
    <article className="hud-card" aria-label={label}>
      <span className="hud-label">{label}</span>
      <span className="hud-value">{formatAttitude(valueDeg, signed)}</span>
      <span className="hud-unit">deg</span>
    </article>
  )
}
