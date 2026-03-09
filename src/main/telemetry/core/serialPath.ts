import { existsSync } from 'node:fs'
import type { SerialPortInfo } from '@shared/types'

export function normalizePortPath(path: string): string {
  return path.trim().toUpperCase()
}

function toMacCalloutPath(path: string): string | null {
  const trimmed = path.trim()
  if (!trimmed.startsWith('/dev/tty.')) {
    return null
  }

  return `/dev/cu.${trimmed.slice('/dev/tty.'.length)}`
}

export function canonicalSerialPortPath(path: string): string {
  const calloutPath = toMacCalloutPath(path)
  if (!calloutPath) {
    return path
  }

  return existsSync(calloutPath) ? calloutPath : path
}

export function normalizeSerialPortList(ports: SerialPortInfo[]): SerialPortInfo[] {
  const byPath = new Map<string, SerialPortInfo>()

  for (const port of ports) {
    const canonicalPath = canonicalSerialPortPath(port.path)
    const normalizedPath = normalizePortPath(canonicalPath)
    const nextPort = canonicalPath === port.path ? port : { ...port, path: canonicalPath }
    byPath.set(normalizedPath, nextPort)
  }

  return [...byPath.values()]
}
