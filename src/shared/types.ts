export type TelemetryMode = 'replay' | 'live'
export type ThemeMode = 'light' | 'dark'
export type DataSourceKind = 'csv' | 'serial' | 'websocket'
export type WindMode = 'synthetic' | 'live'
export type WindFetchState = 'idle' | 'loading' | 'ready' | 'error'

export interface TelemetryFrame {
  timestampMs: number
  latitudeDeg: number
  longitudeDeg: number
  hasPositionFix?: boolean
  satellitesVisible?: number
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

export interface WindSnapshot extends WindConfig {
  source: 'synthetic' | 'open-meteo'
  updatedAtMs: number
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
  mavlinkState?: 'none' | 'packets' | 'telemetry'
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
