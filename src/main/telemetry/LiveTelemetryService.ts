import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { PassThrough, Readable } from 'node:stream'
import { SerialPort } from 'serialport'
import WebSocket, { RawData } from 'ws'
import { MavLinkPacketParser, MavLinkPacketSplitter, ardupilotmega, common, minimal, send } from 'node-mavlink'
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
    sysid: number
    compid: number
  }
  payload: Buffer
  protocol: {
    data: (payload: Buffer, dataType: unknown) => unknown
  }
}

interface LinkDiagnostics {
  transport: 'serial' | 'websocket'
  bytesReceived: number
  packetsReceived: number
  framesEmitted: number
  targetSystemId: number | null
  targetComponentId: number | null
  requestedTelemetryKey: string | null
  noGpsStatusEmitted: boolean
  positionFixStatusEmitted: boolean
}

const MSG_ID_HEARTBEAT = 0
const MSG_ID_GPS_RAW_INT = 24
const MSG_ID_ATTITUDE = 30
const MSG_ID_GLOBAL_POSITION_INT = 33
const MSG_ID_VFR_HUD = 74
const MSG_ID_COMMAND_ACK = 77
const MSG_ID_AHRS2 = 178
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

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI
}

function clampYaw(degrees: number): number {
  const wrapped = degrees % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}

function hasPositionFix(state: Partial<TelemetryFrame>): boolean {
  return state.hasPositionFix !== false && state.latitudeDeg !== undefined && state.longitudeDeg !== undefined
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
    typeof packet.header?.sysid === 'number' &&
    typeof packet.header?.compid === 'number' &&
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

function toMacCalloutPath(path: string): string | null {
  const trimmed = path.trim()
  if (!trimmed.startsWith('/dev/tty.')) {
    return null
  }

  return `/dev/cu.${trimmed.slice('/dev/tty.'.length)}`
}

function canonicalSerialPortPath(path: string): string {
  const calloutPath = toMacCalloutPath(path)
  if (!calloutPath) {
    return path
  }

  return existsSync(calloutPath) ? calloutPath : path
}

function normalizeSerialPortList(ports: SerialPortInfo[]): SerialPortInfo[] {
  const byPath = new Map<string, SerialPortInfo>()

  for (const port of ports) {
    const canonicalPath = canonicalSerialPortPath(port.path)
    const normalizedPath = normalizePortPath(canonicalPath)
    const nextPort = canonicalPath === port.path ? port : { ...port, path: canonicalPath }
    byPath.set(normalizedPath, nextPort)
  }

  return [...byPath.values()]
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
  private detachTransportMonitor: (() => void) | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private diagnosticsWarningTimer: ReturnType<typeof setTimeout> | null = null

  private liveState: Partial<TelemetryFrame> = {
    source: 'live'
  }
  private diagnostics: LinkDiagnostics | null = null
  private latestFrame: TelemetryFrame | null = null
  private lastStatus: ConnectionStatus = {
    state: 'disconnected'
  }
  private hasGlobalPositionAltitude = false

  on<T extends EventName>(eventName: T, listener: TelemetryEvents[T]): void {
    this.emitter.on(eventName, listener)
  }

  off<T extends EventName>(eventName: T, listener: TelemetryEvents[T]): void {
    this.emitter.off(eventName, listener)
  }

  getLatestFrame(): TelemetryFrame | null {
    return this.latestFrame ? { ...this.latestFrame } : null
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
    this.diagnostics = this.createDiagnostics('serial')

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
    this.diagnostics = this.createDiagnostics('websocket')
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

    this.liveState = {
      source: 'live'
    }
    this.diagnostics = null
    this.latestFrame = null
    this.hasGlobalPositionAltitude = false

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
        this.consumePacket(packet)
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

  private createDiagnostics(transport: 'serial' | 'websocket'): LinkDiagnostics {
    return {
      transport,
      bytesReceived: 0,
      packetsReceived: 0,
      framesEmitted: 0,
      targetSystemId: null,
      targetComponentId: null,
      requestedTelemetryKey: null,
      noGpsStatusEmitted: false,
      positionFixStatusEmitted: false
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
      if (!diagnostics || diagnostics.transport !== 'serial' || diagnostics.framesEmitted > 0) {
        return
      }

      let message: string

      if (diagnostics.bytesReceived === 0) {
        message = `Connected to ${path}, but no serial data has arrived yet. Check the USB cable, port, and flight-controller MAVLink output.`
      } else if (diagnostics.packetsReceived === 0) {
        message =
          `Serial bytes are arriving on ${path}, but no MAVLink packets decoded at ${baudRate} baud. USB flight controllers commonly use 115200.`
      } else {
        message =
          `MAVLink packets are arriving on ${path}, but no GPS frame has been emitted yet. Waiting for GLOBAL_POSITION_INT or GPS_RAW_INT.`
      }

      warnTelemetry(message, diagnostics)
      this.emitStatus({
        state: 'connected',
        transport: 'serial',
        mavlinkState: diagnostics.packetsReceived > 0 ? 'packets' : 'none',
        message
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

  private consumePacket(packet: PacketLike): void {
    switch (packet.header.msgid) {
      case MSG_ID_HEARTBEAT: {
        const message = packet.protocol.data(packet.payload, minimal.Heartbeat) as minimal.Heartbeat

        if (this.diagnostics?.packetsReceived === 1) {
          logTelemetry('Heartbeat received from flight controller', {
            sysid: packet.header.sysid,
            compid: packet.header.compid,
            type: message.type,
            autopilot: message.autopilot,
            systemStatus: message.systemStatus
          })
        }
        return
      }

      case MSG_ID_COMMAND_ACK: {
        const message = packet.protocol.data(packet.payload, common.CommandAck) as common.CommandAck
        logTelemetry('Flight controller command ack', {
          command: message.command,
          result: message.result,
          progress: message.progress,
          resultParam2: message.resultParam2,
          targetSystem: message.targetSystem,
          targetComponent: message.targetComponent
        })
        return
      }

      case MSG_ID_GPS_RAW_INT: {
        const message = packet.protocol.data(packet.payload, common.GpsRawInt) as common.GpsRawInt
        const hasFix = message.fixType >= common.GpsFixType.GPS_FIX_TYPE_2D_FIX
        this.liveState.hasPositionFix = hasFix

        if (message.satellitesVisible !== 255) {
          this.liveState.satellitesVisible = message.satellitesVisible
        }

        if (hasFix) {
          this.liveState.latitudeDeg = message.lat / 1e7
          this.liveState.longitudeDeg = message.lon / 1e7
        }

        if (!this.hasGlobalPositionAltitude) {
          this.liveState.altitudeM = message.alt / 1000
        }

        if (message.vel !== 0xffff) {
          this.liveState.gpsSpeedMps = message.vel / 100
        }

        this.emitFrameIfReady()
        return
      }

      case MSG_ID_GLOBAL_POSITION_INT: {
        const message = packet.protocol.data(packet.payload, common.GlobalPositionInt) as common.GlobalPositionInt
        const hasCoordinates = message.lat !== 0 || message.lon !== 0

        if (hasCoordinates) {
          this.liveState.latitudeDeg = message.lat / 1e7
          this.liveState.longitudeDeg = message.lon / 1e7
          this.liveState.hasPositionFix = true
        } else if (this.liveState.hasPositionFix !== true) {
          this.liveState.hasPositionFix = false
        }

        this.liveState.altitudeM = message.alt / 1000
        this.hasGlobalPositionAltitude = true

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
        if (!this.hasGlobalPositionAltitude) {
          this.liveState.altitudeM = message.alt
        }

        this.emitFrameIfReady()
        return
      }

      case MSG_ID_AHRS2: {
        const message = packet.protocol.data(packet.payload, ardupilotmega.Ahrs2) as ardupilotmega.Ahrs2
        const hasCoordinates = message.lat !== 0 || message.lng !== 0

        this.liveState.pitchDeg = toDegrees(message.pitch)
        this.liveState.rollDeg = toDegrees(message.roll)
        this.liveState.yawDeg = clampYaw(toDegrees(message.yaw))
        this.liveState.altitudeM = message.altitude
        this.hasGlobalPositionAltitude = true

        if (hasCoordinates) {
          this.liveState.latitudeDeg = message.lat / 1e7
          this.liveState.longitudeDeg = message.lng / 1e7
          this.liveState.hasPositionFix = true
        }

        this.emitFrameIfReady()
        return
      }

      default:
        return
    }
  }

  private emitFrameIfReady(): void {
    const diagnostics = this.diagnostics
    const hasFix = hasPositionFix(this.liveState)
    const latitudeDeg = hasFix ? this.liveState.latitudeDeg ?? 0 : this.latestFrame?.latitudeDeg ?? 0
    const longitudeDeg = hasFix ? this.liveState.longitudeDeg ?? 0 : this.latestFrame?.longitudeDeg ?? 0
    const frame: TelemetryFrame = {
      timestampMs: Date.now(),
      latitudeDeg,
      longitudeDeg,
      hasPositionFix: hasFix,
      satellitesVisible: this.liveState.satellitesVisible,
      altitudeM: this.liveState.altitudeM ?? 0,
      gpsSpeedMps: this.liveState.gpsSpeedMps ?? 0,
      airspeedMps: this.liveState.airspeedMps ?? 0,
      pitchDeg: this.liveState.pitchDeg ?? 0,
      rollDeg: this.liveState.rollDeg ?? 0,
      yawDeg: this.liveState.yawDeg ?? 0,
      source: 'live'
    }

    if (diagnostics) {
      diagnostics.framesEmitted += 1
      if (diagnostics.framesEmitted === 1) {
        logTelemetry('Emitting first live telemetry frame', {
          transport: diagnostics.transport,
          hasPositionFix: frame.hasPositionFix,
          latitudeDeg: frame.latitudeDeg,
          longitudeDeg: frame.longitudeDeg,
          altitudeM: frame.altitudeM,
          gpsSpeedMps: frame.gpsSpeedMps,
          targetSystemId: diagnostics.targetSystemId,
          targetComponentId: diagnostics.targetComponentId
        })

      }

      if (!hasFix && !diagnostics.noGpsStatusEmitted) {
        diagnostics.noGpsStatusEmitted = true
        const satellitesText =
          frame.satellitesVisible === undefined ? '' : ` (${frame.satellitesVisible} satellites visible)`
        this.emitStatus({
          state: 'connected',
          transport: diagnostics.transport,
          mavlinkState: 'telemetry',
          message:
            `Receiving attitude/speed telemetry from system ${diagnostics.targetSystemId ?? '?'} component ${diagnostics.targetComponentId ?? '?'}; no GPS fix yet` +
            satellitesText
        })
      }

      if (hasFix && !diagnostics.positionFixStatusEmitted) {
        diagnostics.positionFixStatusEmitted = true
        this.emitStatus({
          state: 'connected',
          transport: diagnostics.transport,
          mavlinkState: 'telemetry',
          message: `Receiving live telemetry from system ${diagnostics.targetSystemId ?? '?'} component ${diagnostics.targetComponentId ?? '?'}`
        })
      }
    }

    this.latestFrame = frame
    this.emitter.emit('frame', frame)
  }

  private emitStatus(status: ConnectionStatus): void {
    this.lastStatus = { ...status }
    this.emitter.emit('status', status)
  }
}
