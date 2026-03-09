import type { SerialConnectOptions, WebSocketConnectOptions } from '@shared/types'

const MAX_SERIAL_PATH_LENGTH = 260
const MIN_BAUD_RATE = 1_200
const MAX_BAUD_RATE = 3_000_000
const MAX_WEBSOCKET_URL_LENGTH = 2_048

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function assertSerialConnectOptions(payload: unknown): SerialConnectOptions {
  if (!isRecord(payload)) {
    throw new Error('Invalid serial connect payload: expected object')
  }

  const path = payload.path
  const baudRate = payload.baudRate

  if (typeof path !== 'string') {
    throw new Error('Invalid serial connect payload: path must be a string')
  }

  const trimmedPath = path.trim()
  if (trimmedPath.length === 0 || trimmedPath.length > MAX_SERIAL_PATH_LENGTH) {
    throw new Error('Invalid serial connect payload: path must be non-empty and <= 260 characters')
  }

  if (typeof baudRate !== 'number' || !Number.isInteger(baudRate)) {
    throw new Error('Invalid serial connect payload: baudRate must be an integer')
  }

  if (baudRate < MIN_BAUD_RATE || baudRate > MAX_BAUD_RATE) {
    throw new Error('Invalid serial connect payload: baudRate must be between 1200 and 3000000')
  }

  return {
    path: trimmedPath,
    baudRate
  }
}

export function assertWebSocketConnectOptions(payload: unknown): WebSocketConnectOptions {
  if (!isRecord(payload)) {
    throw new Error('Invalid WebSocket connect payload: expected object')
  }

  const url = payload.url
  if (typeof url !== 'string') {
    throw new Error('Invalid WebSocket connect payload: url must be a string')
  }

  const trimmedUrl = url.trim()
  if (trimmedUrl.length === 0 || trimmedUrl.length > MAX_WEBSOCKET_URL_LENGTH) {
    throw new Error('Invalid WebSocket connect payload: url must be non-empty and <= 2048 characters')
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(trimmedUrl)
  } catch {
    throw new Error('Invalid WebSocket connect payload: url must be a valid URL')
  }

  if (parsedUrl.protocol !== 'ws:' && parsedUrl.protocol !== 'wss:') {
    throw new Error('Invalid WebSocket connect payload: protocol must be ws or wss')
  }

  return {
    url: trimmedUrl
  }
}
