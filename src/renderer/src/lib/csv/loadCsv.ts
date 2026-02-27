import type { TelemetryFrame } from '@shared/types'
import { parseCsv } from './parseCsv'

export async function loadCsv(path: string): Promise<TelemetryFrame[]> {
  const response = await fetch(path)

  if (!response.ok) {
    throw new Error(`Failed to load CSV from ${path}: ${response.status} ${response.statusText}`)
  }

  const raw = await response.text()
  return parseCsv(raw)
}
