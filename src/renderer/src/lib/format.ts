export function formatSigned(value: number, fractionDigits = 1): string {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${value.toFixed(fractionDigits)}`
}

export function formatMpsToKnots(metersPerSecond: number): string {
  return (metersPerSecond * 1.943844).toFixed(1)
}

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
