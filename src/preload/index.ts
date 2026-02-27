import { contextBridge, ipcRenderer } from 'electron'
import {
  TELEMETRY_CONNECT_SERIAL,
  TELEMETRY_CONNECT_WS,
  TELEMETRY_DISCONNECT,
  TELEMETRY_FRAME_EVENT,
  TELEMETRY_LIST_PORTS,
  TELEMETRY_STATUS_EVENT
} from '@shared/ipc'
import type {
  ConnectionStatus,
  GcsApi,
  SerialConnectOptions,
  SerialPortInfo,
  TelemetryFrame,
  WebSocketConnectOptions
} from '@shared/types'

const api: GcsApi = {
  listSerialPorts: () => ipcRenderer.invoke(TELEMETRY_LIST_PORTS) as Promise<SerialPortInfo[]>,
  connectSerial: (options: SerialConnectOptions) =>
    ipcRenderer.invoke(TELEMETRY_CONNECT_SERIAL, options) as Promise<void>,
  connectWebSocket: (options: WebSocketConnectOptions) =>
    ipcRenderer.invoke(TELEMETRY_CONNECT_WS, options) as Promise<void>,
  disconnectLive: () => ipcRenderer.invoke(TELEMETRY_DISCONNECT) as Promise<void>,
  onLiveTelemetry: (listener: (frame: TelemetryFrame) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, frame: TelemetryFrame): void => {
      listener(frame)
    }

    ipcRenderer.on(TELEMETRY_FRAME_EVENT, handler)

    return () => {
      ipcRenderer.off(TELEMETRY_FRAME_EVENT, handler)
    }
  },
  onConnectionStatus: (listener: (status: ConnectionStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: ConnectionStatus): void => {
      listener(status)
    }

    ipcRenderer.on(TELEMETRY_STATUS_EVENT, handler)

    return () => {
      ipcRenderer.off(TELEMETRY_STATUS_EVENT, handler)
    }
  }
}

contextBridge.exposeInMainWorld('gcsApi', api)
