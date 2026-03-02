import { EventEmitter } from 'node:events'
import { PassThrough, Readable } from 'node:stream'
import { SerialPort } from 'serialport'
import WebSocket, { RawData } from 'ws'
import { MavLinkPacketParser, MavLinkPacketSplitter, common } from 'node-mavlink'
import type {
  ConnectionStatus,
  SerialConnectOptions,
  SerialPortInfo,
  TelemetryFrame,
  WebSocketConnectOptions
} from '@shared/types'

interface TelemetryEvents {
  frame: (frame: TelemetryFrame) => void
  status: (status: ConnectionStatus) => void
}

type EventName = keyof TelemetryEvents

interface PacketLike {
  header: {
    msgid: number
  }
  payload: Buffer
  protocol: {
    data: (payload: Buffer, dataType: unknown) => unknown
  }
}

const MSG_ID_ATTITUDE = 30
const MSG_ID_GLOBAL_POSITION_INT = 33
const MSG_ID_VFR_HUD = 74
const CONNECTION_TIMEOUT_MS = 8_000

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI
}

function clampYaw(degrees: number): number {
  const wrapped = degrees % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}

function asBuffer(data: RawData): Buffer {
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

function isPacketLike(value: unknown): value is PacketLike {
  if (!value || typeof value !== 'object') {
    return false
  }

  const packet = value as Partial<PacketLike>
  return (
    typeof packet.header?.msgid === 'number' &&
    Buffer.isBuffer(packet.payload) &&
    typeof packet.protocol?.data === 'function'
  )
}

function timeoutError(operation: string): Error {
  return new Error(`${operation} timed out after ${Math.floor(CONNECTION_TIMEOUT_MS / 1000)}s`)
}

function normalizePortPath(path: string): string {
  return path.trim().toUpperCase()
}

async function openSerialPortWithTimeout(port: SerialPort, timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error(`Serial connection timed out after ${Math.floor(timeoutMs / 1000)}s`))
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

export class LiveTelemetryService {
  private readonly emitter = new EventEmitter()

  private serialPort: SerialPort | null = null
  private websocket: WebSocket | null = null
  private websocketStream: PassThrough | null = null

  private detachMavlinkStream: (() => void) | null = null

  private liveState: Partial<TelemetryFrame> = {
    source: 'live'
  }

  on<T extends EventName>(eventName: T, listener: TelemetryEvents[T]): void {
    this.emitter.on(eventName, listener)
  }

  off<T extends EventName>(eventName: T, listener: TelemetryEvents[T]): void {
    this.emitter.off(eventName, listener)
  }

  async listSerialPorts(): Promise<SerialPortInfo[]> {
    const ports = await SerialPort.list()
    return ports.map((port) => ({
      path: port.path,
      manufacturer: port.manufacturer,
      serialNumber: port.serialNumber,
      pnpId: port.pnpId,
      vendorId: port.vendorId,
      productId: port.productId
    }))
  }

  async connectSerial(options: SerialConnectOptions): Promise<void> {
    await this.disconnect()

    this.emitStatus({
      state: 'connecting',
      transport: 'serial',
      message: `Opening ${options.path} @ ${options.baudRate}`
    })

    const availablePorts = await this.listSerialPorts()
    const normalizedRequestedPath = normalizePortPath(options.path)
    const hasRequestedPort = availablePorts.some((port) => normalizePortPath(port.path) === normalizedRequestedPath)

    if (!hasRequestedPort) {
      throw new Error(`Serial port ${options.path} is not available`)
    }

    const port = new SerialPort({
      path: options.path,
      baudRate: options.baudRate,
      autoOpen: false,
      rtscts: false,
      xon: false,
      xoff: false,
      xany: false
    })

    await openSerialPortWithTimeout(port, CONNECTION_TIMEOUT_MS)

    this.serialPort = port

    port.on('close', () => {
      this.emitStatus({
        state: 'disconnected',
        transport: 'serial',
        message: 'Serial link closed'
      })
    })

    port.on('error', (error) => {
      this.emitStatus({
        state: 'error',
        transport: 'serial',
        message: error.message
      })
    })

    this.bindMavlinkStream(port, 'serial')

    this.emitStatus({
      state: 'connected',
      transport: 'serial',
      message: `Connected to ${options.path}`
    })
  }

  async connectWebSocket(options: WebSocketConnectOptions): Promise<void> {
    await this.disconnect()

    this.emitStatus({
      state: 'connecting',
      transport: 'websocket',
      message: `Opening ${options.url}`
    })

    const socket = new WebSocket(options.url)

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(timeoutError('WebSocket connection'))
      }, CONNECTION_TIMEOUT_MS)

      socket.once('open', () => {
        clearTimeout(timeout)
        resolve()
      })

      socket.once('error', (error: Error) => {
        clearTimeout(timeout)
        reject(error)
      })
    })

    this.websocket = socket
    this.websocketStream = new PassThrough()
    this.bindMavlinkStream(this.websocketStream, 'websocket')

    socket.on('message', (data: RawData) => {
      this.websocketStream?.write(asBuffer(data))
    })

    socket.on('close', () => {
      this.emitStatus({
        state: 'disconnected',
        transport: 'websocket',
        message: 'WebSocket disconnected'
      })
    })

    socket.on('error', (error: Error) => {
      this.emitStatus({
        state: 'error',
        transport: 'websocket',
        message: error.message
      })
    })

    this.emitStatus({
      state: 'connected',
      transport: 'websocket',
      message: `Connected to ${options.url}`
    })
  }

  async disconnect(): Promise<void> {
    this.detachMavlinkStream?.()
    this.detachMavlinkStream = null

    if (this.websocket) {
      const socket = this.websocket
      this.websocket = null
      socket.removeAllListeners()
      socket.terminate()
    }

    if (this.websocketStream) {
      this.websocketStream.end()
      this.websocketStream = null
    }

    if (this.serialPort) {
      const port = this.serialPort
      this.serialPort = null
      if (port.isOpen) {
        await new Promise<void>((resolve) => {
          port.close(() => resolve())
        })
      }
    }

    this.liveState = {
      source: 'live'
    }

    this.emitStatus({
      state: 'disconnected',
      message: 'Live link disconnected'
    })
  }

  private bindMavlinkStream(stream: Readable, transport: 'serial' | 'websocket'): void {
    this.detachMavlinkStream?.()

    const splitter = new MavLinkPacketSplitter()
    const parser = new MavLinkPacketParser()

    const onPacket = (packet: unknown): void => {
      if (!isPacketLike(packet)) {
        return
      }

      this.consumePacket(packet)
    }

    const onError = (error: Error): void => {
      this.emitStatus({
        state: 'error',
        transport,
        message: error.message
      })
    }

    stream.pipe(splitter).pipe(parser)

    splitter.on('error', onError)
    parser.on('error', onError)
    parser.on('data', onPacket)

    this.detachMavlinkStream = () => {
      parser.off('data', onPacket)
      parser.off('error', onError)
      splitter.off('error', onError)
      splitter.unpipe(parser)
      stream.unpipe(splitter)
    }
  }

  private consumePacket(packet: PacketLike): void {
    switch (packet.header.msgid) {
      case MSG_ID_GLOBAL_POSITION_INT: {
        const message = packet.protocol.data(packet.payload, common.GlobalPositionInt) as common.GlobalPositionInt

        this.liveState.latitudeDeg = message.lat / 1e7
        this.liveState.longitudeDeg = message.lon / 1e7
        this.liveState.altitudeM = message.alt / 1000

        const groundSpeed = Math.sqrt(message.vx * message.vx + message.vy * message.vy) / 100
        this.liveState.gpsSpeedMps = groundSpeed

        this.emitFrameIfReady()
        return
      }

      case MSG_ID_ATTITUDE: {
        const message = packet.protocol.data(packet.payload, common.Attitude) as common.Attitude

        this.liveState.pitchDeg = toDegrees(message.pitch)
        this.liveState.rollDeg = toDegrees(message.roll)
        this.liveState.yawDeg = clampYaw(toDegrees(message.yaw))

        this.emitFrameIfReady()
        return
      }

      case MSG_ID_VFR_HUD: {
        const message = packet.protocol.data(packet.payload, common.VfrHud) as common.VfrHud

        this.liveState.airspeedMps = message.airspeed
        this.liveState.gpsSpeedMps = message.groundspeed
        this.liveState.altitudeM = message.alt

        this.emitFrameIfReady()
        return
      }

      default:
        return
    }
  }

  private emitFrameIfReady(): void {
    if (this.liveState.latitudeDeg === undefined || this.liveState.longitudeDeg === undefined) {
      return
    }

    const frame: TelemetryFrame = {
      timestampMs: Date.now(),
      latitudeDeg: this.liveState.latitudeDeg,
      longitudeDeg: this.liveState.longitudeDeg,
      altitudeM: this.liveState.altitudeM ?? 0,
      gpsSpeedMps: this.liveState.gpsSpeedMps ?? 0,
      airspeedMps: this.liveState.airspeedMps ?? 0,
      pitchDeg: this.liveState.pitchDeg ?? 0,
      rollDeg: this.liveState.rollDeg ?? 0,
      yawDeg: this.liveState.yawDeg ?? 0,
      source: 'live'
    }

    this.emitter.emit('frame', frame)
  }

  private emitStatus(status: ConnectionStatus): void {
    this.emitter.emit('status', status)
  }
}
