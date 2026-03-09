import { EventEmitter } from 'node:events'
import { PassThrough, Readable } from 'node:stream'
import { SerialPort } from 'serialport'
import WebSocket, { RawData } from 'ws'
import { MavLinkPacketParser, MavLinkPacketSplitter, common, minimal, send } from 'node-mavlink'
import type {
  ConnectionStatus,
  SerialConnectOptions,
  SerialPortInfo,
  TelemetryFrame,
  WebSocketConnectOptions
} from '@shared/types'
import { buildSerialDiagnosticsWarning, createDiagnostics, type LinkDiagnostics } from './core/diagnostics'
import {
  MavlinkReducer,
  MSG_ID_AHRS2,
  MSG_ID_ATTITUDE,
  MSG_ID_GLOBAL_POSITION_INT,
  MSG_ID_GPS_RAW_INT,
  MSG_ID_VFR_HUD,
  isPacketLike,
  type PacketLike
} from './core/mavlinkReducer'
import { canonicalSerialPortPath, normalizePortPath, normalizeSerialPortList } from './core/serialPath'
import { asBuffer, openSerialPortWithTimeout, openWebSocketWithTimeout } from './core/transport'

interface TelemetryEvents {
  frame: (frame: TelemetryFrame) => void
  status: (status: ConnectionStatus) => void
}

type EventName = keyof TelemetryEvents

const CONNECTION_TIMEOUT_MS = 8_000
const DIAGNOSTIC_WARNING_DELAY_MS = 5_000
const GCS_HEARTBEAT_INTERVAL_MS = 1_000
const DEFAULT_TARGET_SYSTEM_ID = 1
const DEFAULT_TARGET_COMPONENT_ID = 1

function logTelemetry(message: string, details?: unknown): void {
  if (details === undefined) {
    console.info(`[telemetry] ${message}`)
    return
  }

  console.info(`[telemetry] ${message}`, details)
}

function warnTelemetry(message: string, details?: unknown): void {
  if (details === undefined) {
    console.warn(`[telemetry] ${message}`)
    return
  }

  console.warn(`[telemetry] ${message}`, details)
}

function errorTelemetry(message: string, details?: unknown): void {
  if (details === undefined) {
    console.error(`[telemetry] ${message}`)
    return
  }

  console.error(`[telemetry] ${message}`, details)
}

function formatPortSummary(port: SerialPortInfo): string {
  const segments = [port.path]

  if (port.manufacturer) {
    segments.push(port.manufacturer)
  }

  if (port.vendorId || port.productId) {
    segments.push(`vid=${port.vendorId ?? '?'} pid=${port.productId ?? '?'}`)
  }

  return segments.join(' | ')
}

export class LiveTelemetryService {
  private readonly emitter = new EventEmitter()
  private readonly reducer: MavlinkReducer

  private serialPort: SerialPort | null = null
  private websocket: WebSocket | null = null
  private websocketStream: PassThrough | null = null

  private detachMavlinkStream: (() => void) | null = null
  private detachTransportMonitor: (() => void) | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private diagnosticsWarningTimer: ReturnType<typeof setTimeout> | null = null

  private diagnostics: LinkDiagnostics | null = null
  private lastStatus: ConnectionStatus = {
    state: 'disconnected'
  }

  constructor() {
    this.reducer = new MavlinkReducer({
      onStatus: (status) => {
        this.emitStatus(status)
      },
      onFrame: (frame) => {
        this.emitter.emit('frame', frame)
      },
      logTelemetry
    })
  }

  on<T extends EventName>(eventName: T, listener: TelemetryEvents[T]): void {
    this.emitter.on(eventName, listener)
  }

  off<T extends EventName>(eventName: T, listener: TelemetryEvents[T]): void {
    this.emitter.off(eventName, listener)
  }

  getLatestFrame(): TelemetryFrame | null {
    return this.reducer.getLatestFrame()
  }

  getConnectionStatus(): ConnectionStatus {
    return { ...this.lastStatus }
  }

  async listSerialPorts(): Promise<SerialPortInfo[]> {
    const ports = await SerialPort.list()
    const mappedPorts = ports.map((port) => ({
      path: port.path,
      manufacturer: port.manufacturer,
      serialNumber: port.serialNumber,
      pnpId: port.pnpId,
      vendorId: port.vendorId,
      productId: port.productId
    }))

    return normalizeSerialPortList(mappedPorts)
  }

  async connectSerial(options: SerialConnectOptions): Promise<void> {
    await this.disconnect()

    const selectedPath = options.path.trim()
    const serialPath = canonicalSerialPortPath(selectedPath)

    if (serialPath !== selectedPath) {
      logTelemetry(`Using callout serial path ${serialPath} (selected ${selectedPath})`)
    }

    logTelemetry(`Opening serial link ${serialPath} @ ${options.baudRate}`)

    this.emitStatus({
      state: 'connecting',
      transport: 'serial',
      message: `Opening ${serialPath} @ ${options.baudRate}`
    })

    const availablePorts = await this.listSerialPorts()
    logTelemetry(`Detected ${availablePorts.length} serial port(s)`, availablePorts.map(formatPortSummary))

    const normalizedRequestedPath = normalizePortPath(serialPath)
    const hasRequestedPort = availablePorts.some((port) => normalizePortPath(port.path) === normalizedRequestedPath)

    if (!hasRequestedPort) {
      throw new Error(`Serial port ${serialPath} is not available`)
    }

    const port = new SerialPort({
      path: serialPath,
      baudRate: options.baudRate,
      autoOpen: false,
      rtscts: false,
      xon: false,
      xoff: false,
      xany: false
    })

    await openSerialPortWithTimeout(port, CONNECTION_TIMEOUT_MS)
    logTelemetry(`Serial port opened: ${serialPath}`)

    this.serialPort = port
    this.diagnostics = createDiagnostics('serial')

    port.on('close', () => {
      warnTelemetry(`Serial link closed: ${options.path}`)
      this.emitStatus({
        state: 'disconnected',
        transport: 'serial',
        message: 'Serial link closed'
      })
    })

    port.on('error', (error) => {
      errorTelemetry(`Serial link error on ${options.path}`, error)
      this.emitStatus({
        state: 'error',
        transport: 'serial',
        message: error.message
      })
    })

    this.attachSerialMonitor(port, serialPath)
    this.bindMavlinkStream(port, 'serial')
    this.startHeartbeatLoop(port)
    void this.requestSerialTelemetry(
      port,
      DEFAULT_TARGET_SYSTEM_ID,
      DEFAULT_TARGET_COMPONENT_ID,
      'optimistic default target'
    )
    this.scheduleSerialDiagnosticsWarning(serialPath, options.baudRate)

    this.emitStatus({
      state: 'connected',
      transport: 'serial',
      mavlinkState: 'none',
      message: `Serial connected on ${serialPath}; waiting for MAVLink packets`
    })
  }

  async connectWebSocket(options: WebSocketConnectOptions): Promise<void> {
    await this.disconnect()

    this.emitStatus({
      state: 'connecting',
      transport: 'websocket',
      message: `Opening ${options.url}`
    })

    const socket = await openWebSocketWithTimeout(options.url, CONNECTION_TIMEOUT_MS)

    this.websocket = socket
    this.websocketStream = new PassThrough()
    this.diagnostics = createDiagnostics('websocket')
    this.bindMavlinkStream(this.websocketStream, 'websocket')

    socket.on('message', (data: RawData) => {
      const buffer = asBuffer(data)
      if (this.diagnostics?.transport === 'websocket') {
        this.diagnostics.bytesReceived += buffer.length
      }
      this.websocketStream?.write(buffer)
    })

    socket.on('close', () => {
      warnTelemetry(`WebSocket disconnected: ${options.url}`)
      this.emitStatus({
        state: 'disconnected',
        transport: 'websocket',
        message: 'WebSocket disconnected'
      })
    })

    socket.on('error', (error: Error) => {
      errorTelemetry(`WebSocket error on ${options.url}`, error)
      this.emitStatus({
        state: 'error',
        transport: 'websocket',
        message: error.message
      })
    })

    this.emitStatus({
      state: 'connected',
      transport: 'websocket',
      mavlinkState: 'none',
      message: `WebSocket connected to ${options.url}; waiting for MAVLink packets`
    })
  }

  async disconnect(): Promise<void> {
    this.detachTransportMonitor?.()
    this.detachTransportMonitor = null

    this.detachMavlinkStream?.()
    this.detachMavlinkStream = null

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }

    if (this.diagnosticsWarningTimer) {
      clearTimeout(this.diagnosticsWarningTimer)
      this.diagnosticsWarningTimer = null
    }

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

    this.diagnostics = null
    this.reducer.reset()

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

      try {
        this.observePacket(packet, transport)
        this.reducer.consumePacket(packet, this.diagnostics)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to decode MAVLink packet'
        errorTelemetry(`Failed to decode MAVLink packet ${packet.header.msgid}`, error)
        this.emitStatus({
          state: 'error',
          transport,
          message
        })
      }
    }

    const onError = (error: Error): void => {
      errorTelemetry(`MAVLink stream error (${transport})`, error)
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

  private attachSerialMonitor(port: SerialPort, path: string): void {
    this.detachTransportMonitor?.()

    const onData = (chunk: Buffer): void => {
      const diagnostics = this.diagnostics
      if (!diagnostics || diagnostics.transport !== 'serial') {
        return
      }

      diagnostics.bytesReceived += chunk.length
      if (diagnostics.bytesReceived === chunk.length) {
        logTelemetry(`Received first serial bytes from ${path}`, { chunkBytes: chunk.length })
      }
    }

    port.on('data', onData)

    this.detachTransportMonitor = () => {
      port.off('data', onData)
    }
  }

  private startHeartbeatLoop(port: SerialPort): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
    }

    const sendHeartbeat = (): void => {
      void this.sendGroundStationHeartbeat(port)
    }

    sendHeartbeat()
    this.heartbeatTimer = setInterval(sendHeartbeat, GCS_HEARTBEAT_INTERVAL_MS)
  }

  private async sendGroundStationHeartbeat(port: SerialPort): Promise<void> {
    if (port !== this.serialPort || !port.isOpen) {
      return
    }

    const heartbeat = new minimal.Heartbeat()
    heartbeat.type = minimal.MavType.GCS
    heartbeat.autopilot = minimal.MavAutopilot.INVALID
    heartbeat.baseMode = 0 as minimal.MavModeFlag
    heartbeat.customMode = 0
    heartbeat.systemStatus = minimal.MavState.ACTIVE

    try {
      await send(port, heartbeat)
    } catch (error) {
      warnTelemetry('Unable to send GCS heartbeat', error)
    }
  }

  private scheduleSerialDiagnosticsWarning(path: string, baudRate: number): void {
    if (this.diagnosticsWarningTimer) {
      clearTimeout(this.diagnosticsWarningTimer)
    }

    this.diagnosticsWarningTimer = setTimeout(() => {
      const diagnostics = this.diagnostics
      if (!diagnostics) {
        return
      }

      const warning = buildSerialDiagnosticsWarning(diagnostics, path, baudRate)
      if (!warning) {
        return
      }

      warnTelemetry(warning.message, diagnostics)
      this.emitStatus({
        state: 'connected',
        transport: 'serial',
        mavlinkState: warning.mavlinkState,
        message: warning.message
      })
    }, DIAGNOSTIC_WARNING_DELAY_MS)
  }

  private observePacket(packet: PacketLike, transport: 'serial' | 'websocket'): void {
    const diagnostics = this.diagnostics
    if (!diagnostics || diagnostics.transport !== transport) {
      return
    }

    diagnostics.packetsReceived += 1
    diagnostics.targetSystemId = packet.header.sysid
    diagnostics.targetComponentId = packet.header.compid

    if (diagnostics.packetsReceived === 1) {
      logTelemetry(`Received first MAVLink packet on ${transport}`, {
        msgid: packet.header.msgid,
        sysid: packet.header.sysid,
        compid: packet.header.compid
      })

      this.emitStatus({
        state: 'connected',
        transport,
        mavlinkState: 'packets',
        message: `Connected and receiving MAVLink packets from system ${packet.header.sysid} component ${packet.header.compid}`
      })
    }

    const serialPort = this.serialPort
    const shouldRefreshSerialTelemetryTarget = transport === 'serial' && serialPort !== null && serialPort.isOpen

    if (shouldRefreshSerialTelemetryTarget) {
      const targetSystemId = packet.header.sysid > 0 ? packet.header.sysid : DEFAULT_TARGET_SYSTEM_ID
      const targetComponentId =
        packet.header.compid === minimal.MavComponent.AUTOPILOT1
          ? packet.header.compid
          : DEFAULT_TARGET_COMPONENT_ID

      void this.requestSerialTelemetry(
        serialPort,
        targetSystemId,
        targetComponentId,
        `detected incoming MAVLink msgid ${packet.header.msgid} from system ${packet.header.sysid} component ${packet.header.compid}`
      )
    }
  }

  private async requestSerialTelemetry(
    port: SerialPort,
    targetSystemId: number,
    targetComponentId: number,
    reason: string
  ): Promise<void> {
    const diagnostics = this.diagnostics
    if (!diagnostics || diagnostics.transport !== 'serial' || port !== this.serialPort || !port.isOpen) {
      return
    }

    const requestKey = `${targetSystemId}:${targetComponentId}`
    if (diagnostics.requestedTelemetryKey === requestKey) {
      return
    }

    diagnostics.requestedTelemetryKey = requestKey
    diagnostics.targetSystemId = targetSystemId
    diagnostics.targetComponentId = targetComponentId

    logTelemetry(`Requesting telemetry from system ${targetSystemId} component ${targetComponentId} (${reason})`)

    try {
      const intervalRequests = [
        { msgId: MSG_ID_GLOBAL_POSITION_INT, hz: 5 },
        { msgId: MSG_ID_GPS_RAW_INT, hz: 2 },
        { msgId: MSG_ID_ATTITUDE, hz: 10 },
        { msgId: MSG_ID_VFR_HUD, hz: 5 },
        { msgId: MSG_ID_AHRS2, hz: 5 }
      ]

      for (const request of intervalRequests) {
        const command = new common.SetMessageIntervalCommand(targetSystemId, targetComponentId)
        command.messageId = request.msgId
        command.interval = Math.round(1_000_000 / request.hz)
        await send(port, command)
      }

      const streamRequests = [
        { streamId: common.MavDataStream.POSITION, hz: 5 },
        { streamId: common.MavDataStream.EXTRA1, hz: 10 },
        { streamId: common.MavDataStream.EXTRA2, hz: 5 }
      ]

      for (const request of streamRequests) {
        const command = new common.RequestDataStream()
        command.targetSystem = targetSystemId
        command.targetComponent = targetComponentId
        command.reqStreamId = request.streamId
        command.reqMessageRate = request.hz
        command.startStop = 1
        await send(port, command)
      }
    } catch (error) {
      if (this.diagnostics?.requestedTelemetryKey === requestKey) {
        this.diagnostics.requestedTelemetryKey = null
      }

      warnTelemetry(`Unable to request telemetry from system ${targetSystemId} component ${targetComponentId}`, error)
    }
  }

  private emitStatus(status: ConnectionStatus): void {
    this.lastStatus = { ...status }
    this.emitter.emit('status', status)
  }
}
