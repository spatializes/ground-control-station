import type { IpcMainInvokeEvent } from 'electron'
import {
  TELEMETRY_CONNECT_SERIAL,
  TELEMETRY_CONNECT_WS,
  TELEMETRY_DISCONNECT,
  TELEMETRY_LIST_PORTS
} from '@shared/ipc'
import type {
  ConnectionStatus,
  SerialConnectOptions,
  SerialPortInfo,
  TelemetryFrame,
  WebSocketConnectOptions
} from '@shared/types'
import { assertSerialConnectOptions, assertWebSocketConnectOptions } from './validators'

interface TelemetryServiceContract {
  listSerialPorts: () => Promise<SerialPortInfo[]>
  connectSerial: (options: SerialConnectOptions) => Promise<void>
  connectWebSocket: (options: WebSocketConnectOptions) => Promise<void>
  disconnect: () => Promise<void>
  getConnectionStatus: () => ConnectionStatus
  getLatestFrame: () => TelemetryFrame | null
}

interface TelemetryHandlerOptions {
  service: TelemetryServiceContract
  setTelemetryReceiver: (sender: IpcMainInvokeEvent['sender'], reason: string) => void
  sendTelemetryStatus: (statusOverride?: ConnectionStatus) => void
  sendTelemetryFrame: (frameOverride?: TelemetryFrame | null) => void
  logTelemetryIpc: (message: string, details?: unknown) => void
}

export function createTelemetryIpcHandlers({
  service,
  setTelemetryReceiver,
  sendTelemetryStatus,
  sendTelemetryFrame,
  logTelemetryIpc
}: TelemetryHandlerOptions) {
  return {
    listPorts: async (event: IpcMainInvokeEvent): Promise<SerialPortInfo[]> => {
      setTelemetryReceiver(event.sender, TELEMETRY_LIST_PORTS)
      return service.listSerialPorts()
    },

    connectSerial: async (event: IpcMainInvokeEvent, payload: unknown): Promise<void> => {
      setTelemetryReceiver(event.sender, TELEMETRY_CONNECT_SERIAL)
      const options = assertSerialConnectOptions(payload)
      logTelemetryIpc('Serial connect requested', options)
      await service.connectSerial(options)
      sendTelemetryStatus()
      sendTelemetryFrame()
    },

    connectWebSocket: async (event: IpcMainInvokeEvent, payload: unknown): Promise<void> => {
      setTelemetryReceiver(event.sender, TELEMETRY_CONNECT_WS)
      const options = assertWebSocketConnectOptions(payload)
      logTelemetryIpc('WebSocket connect requested', options)
      await service.connectWebSocket(options)
      sendTelemetryStatus()
      sendTelemetryFrame()
    },

    disconnect: async (event: IpcMainInvokeEvent): Promise<void> => {
      setTelemetryReceiver(event.sender, TELEMETRY_DISCONNECT)
      logTelemetryIpc('Live disconnect requested')
      await service.disconnect()
      sendTelemetryStatus()
    }
  }
}
