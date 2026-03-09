import { SerialPort } from 'serialport'
import WebSocket, { RawData } from 'ws'

export function timeoutError(operation: string, timeoutMs: number): Error {
  return new Error(`${operation} timed out after ${Math.floor(timeoutMs / 1000)}s`)
}

export function asBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) {
    return data
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data)
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data)
  }

  return Buffer.from(data)
}

export async function openSerialPortWithTimeout(port: SerialPort, timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(timeoutError('Serial connection', timeoutMs))
    }, timeoutMs)

    const cleanup = (): void => {
      clearTimeout(timeout)
      port.off('open', onOpen)
      port.off('error', onError)
    }

    const onOpen = (): void => {
      cleanup()
      resolve()
    }

    const onError = (error: Error): void => {
      cleanup()
      reject(error)
    }

    port.once('open', onOpen)
    port.once('error', onError)

    try {
      port.open()
    } catch (error) {
      cleanup()
      reject(error)
    }
  })
}

export async function openWebSocketWithTimeout(url: string, timeoutMs: number): Promise<WebSocket> {
  const socket = new WebSocket(url)

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(timeoutError('WebSocket connection', timeoutMs))
    }, timeoutMs)

    socket.once('open', () => {
      clearTimeout(timeout)
      resolve()
    })

    socket.once('error', (error: Error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })

  return socket
}
