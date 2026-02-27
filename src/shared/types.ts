export type TelemetryMode = 'replay' | 'live'
export type ThemeMode = 'light' | 'dark'

export interface TelemetryFrame {
  timestampMs: number
  latitudeDeg: number
  longitudeDeg: number
  altitudeM: number
  gpsSpeedMps: number
  airspeedMps: number
  pitchDeg: number
  rollDeg: number
  yawDeg: number
  source: 'csv' | 'live'
}

export interface WindConfig {
  fromDirectionDeg: number
  speedMps: number
}

export interface SerialPortInfo {
  path: string
  manufacturer?: string
  serialNumber?: string
  pnpId?: string
  vendorId?: string
  productId?: string
}

export interface SerialConnectOptions {
  path: string
  baudRate: number
}

export interface WebSocketConnectOptions {
  url: string
}

export interface ConnectionStatus {
  state: 'disconnected' | 'connecting' | 'connected' | 'error'
  transport?: 'serial' | 'websocket'
  message?: string
}

export interface GcsApi {
  listSerialPorts: () => Promise<SerialPortInfo[]>
  connectSerial: (options: SerialConnectOptions) => Promise<void>
  connectWebSocket: (options: WebSocketConnectOptions) => Promise<void>
  disconnectLive: () => Promise<void>
  onLiveTelemetry: (listener: (frame: TelemetryFrame) => void) => () => void
  onConnectionStatus: (listener: (status: ConnectionStatus) => void) => () => void
}
