import { describe, expect, it, vi } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'
import type { ConnectionStatus, SerialPortInfo, TelemetryFrame } from '@shared/types'
import { createTelemetryIpcHandlers } from './telemetryHandlers'

function createFakeEvent(): IpcMainInvokeEvent {
  return {
    sender: {
      id: 42
    }
  } as unknown as IpcMainInvokeEvent
}

function createServiceMock() {
  return {
    listSerialPorts: vi.fn(async (): Promise<SerialPortInfo[]> => []),
    connectSerial: vi.fn(async () => undefined),
    connectWebSocket: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    getConnectionStatus: vi.fn(
      (): ConnectionStatus => ({
        state: 'disconnected'
      })
    ),
    getLatestFrame: vi.fn((): TelemetryFrame | null => null)
  }
}

describe('createTelemetryIpcHandlers', () => {
  it('rejects invalid serial payloads and does not call service.connectSerial', async () => {
    const service = createServiceMock()
    const handlers = createTelemetryIpcHandlers({
      service,
      setTelemetryReceiver: vi.fn(),
      sendTelemetryStatus: vi.fn(),
      sendTelemetryFrame: vi.fn(),
      logTelemetryIpc: vi.fn()
    })

    await expect(handlers.connectSerial(createFakeEvent(), { path: '', baudRate: 115200 })).rejects.toThrow(
      'Invalid serial connect payload'
    )
    expect(service.connectSerial).not.toHaveBeenCalled()
  })

  it('rejects invalid websocket payloads and does not call service.connectWebSocket', async () => {
    const service = createServiceMock()
    const handlers = createTelemetryIpcHandlers({
      service,
      setTelemetryReceiver: vi.fn(),
      sendTelemetryStatus: vi.fn(),
      sendTelemetryFrame: vi.fn(),
      logTelemetryIpc: vi.fn()
    })

    await expect(handlers.connectWebSocket(createFakeEvent(), { url: 'http://example.com' })).rejects.toThrow(
      'Invalid WebSocket connect payload'
    )
    expect(service.connectWebSocket).not.toHaveBeenCalled()
  })

  it('accepts valid payloads and performs service calls', async () => {
    const service = createServiceMock()
    const setTelemetryReceiver = vi.fn()
    const sendTelemetryStatus = vi.fn()
    const sendTelemetryFrame = vi.fn()
    const logTelemetryIpc = vi.fn()

    const handlers = createTelemetryIpcHandlers({
      service,
      setTelemetryReceiver,
      sendTelemetryStatus,
      sendTelemetryFrame,
      logTelemetryIpc
    })

    await handlers.connectSerial(createFakeEvent(), { path: ' COM4 ', baudRate: 57600 })
    expect(service.connectSerial).toHaveBeenCalledWith({ path: 'COM4', baudRate: 57600 })

    await handlers.connectWebSocket(createFakeEvent(), { url: ' ws://127.0.0.1:14550 ' })
    expect(service.connectWebSocket).toHaveBeenCalledWith({ url: 'ws://127.0.0.1:14550' })

    expect(setTelemetryReceiver).toHaveBeenCalledTimes(2)
    expect(sendTelemetryStatus).toHaveBeenCalledTimes(2)
    expect(sendTelemetryFrame).toHaveBeenCalledTimes(2)
    expect(logTelemetryIpc).toHaveBeenCalledTimes(2)
  })
})
