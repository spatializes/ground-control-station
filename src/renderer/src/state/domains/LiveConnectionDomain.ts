import { makeAutoObservable } from 'mobx'
import type { ConnectionStatus, SerialPortInfo, TelemetryFrame } from '@shared/types'

export const DEFAULT_CONNECT_TIMEOUT_MS = 10_000

function isBluetoothIncomingPath(path: string): boolean {
  return path.toLowerCase().includes('bluetooth-incoming-port')
}

function serialPortPriority(port: SerialPortInfo): number {
  const path = port.path.toLowerCase()
  let priority = 0

  if (path.startsWith('/dev/cu.')) {
    priority += 30
  } else if (path.startsWith('/dev/tty.')) {
    priority += 20
  }

  if (path.includes('usb') || path.includes('acm') || path.includes('uart') || path.includes('serial')) {
    priority += 40
  }

  if (isBluetoothIncomingPath(path)) {
    priority -= 200
  }

  return priority
}

function sortSerialPorts(ports: SerialPortInfo[]): SerialPortInfo[] {
  return [...ports].sort((left, right) => {
    const priorityDelta = serialPortPriority(right) - serialPortPriority(left)
    if (priorityDelta !== 0) {
      return priorityDelta
    }

    return left.path.localeCompare(right.path)
  })
}

function pickDefaultSerialPath(ports: SerialPortInfo[]): string {
  const preferred = ports.find((port) => !isBluetoothIncomingPath(port.path))
  return preferred?.path ?? ports[0]?.path ?? ''
}

function stringifyLogDetails(details: unknown): string {
  if (details === undefined) {
    return ''
  }

  try {
    return JSON.stringify(details)
  } catch {
    return String(details)
  }
}

export function logLiveConnection(message: string, details?: unknown): void {
  const detailsText = stringifyLogDetails(details)
  console.info(detailsText.length > 0 ? `[live-ui] ${message} ${detailsText}` : `[live-ui] ${message}`)
}

export function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${Math.floor(timeoutMs / 1000)}s`))
    }, timeoutMs)

    promise
      .then((value) => {
        clearTimeout(timeout)
        resolve(value)
      })
      .catch((error: unknown) => {
        clearTimeout(timeout)
        reject(error)
      })
  })
}

export function createDisconnectedStatus(): ConnectionStatus {
  return { state: 'disconnected' }
}

export class LiveConnectionDomain {
  connectionStatus: ConnectionStatus = createDisconnectedStatus()
  latestFrame: TelemetryFrame | null = null
  serialPorts: SerialPortInfo[] = []
  serialPath = ''
  serialBaudRate = 115200
  websocketUrl = 'ws://127.0.0.1:14550'

  private connectionAttemptId = 0
  hasLoggedFirstLiveFrame = false

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true })
  }

  beginConnectionAttempt(): number {
    this.connectionAttemptId += 1
    this.hasLoggedFirstLiveFrame = false
    return this.connectionAttemptId
  }

  markFirstLiveFrameLogged(): void {
    this.hasLoggedFirstLiveFrame = true
  }

  isCurrentConnectionAttempt(attemptId: number): boolean {
    return this.connectionAttemptId === attemptId
  }

  markDisconnected(): void {
    this.connectionStatus = createDisconnectedStatus()
  }

  markLatestFrame(frame: TelemetryFrame | null): void {
    this.latestFrame = frame
  }

  setConnectionStatus(status: ConnectionStatus): void {
    this.connectionStatus = status
  }

  setSerialPorts(ports: SerialPortInfo[]): void {
    const sortedPorts = sortSerialPorts(ports)
    this.serialPorts = sortedPorts

    const hasCurrentPort = sortedPorts.some((port) => port.path === this.serialPath)
    if (!hasCurrentPort) {
      this.serialPath = pickDefaultSerialPath(sortedPorts)
    }
  }

  setSerialPath(path: string): void {
    this.serialPath = path
  }

  setSerialBaudRate(baudRate: number): void {
    if (Number.isFinite(baudRate) && baudRate > 0) {
      this.serialBaudRate = baudRate
    }
  }

  setWebSocketUrl(url: string): void {
    this.websocketUrl = url
  }
}
