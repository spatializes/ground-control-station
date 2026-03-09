import { ardupilotmega, common, minimal } from 'node-mavlink'
import type { ConnectionStatus, TelemetryFrame } from '@shared/types'
import type { LinkDiagnostics } from './diagnostics'

export interface PacketLike {
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

export const MSG_ID_HEARTBEAT = 0
export const MSG_ID_GPS_RAW_INT = 24
export const MSG_ID_ATTITUDE = 30
export const MSG_ID_GLOBAL_POSITION_INT = 33
export const MSG_ID_VFR_HUD = 74
export const MSG_ID_COMMAND_ACK = 77
export const MSG_ID_AHRS2 = 178

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

export function isPacketLike(value: unknown): value is PacketLike {
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

interface MavlinkReducerOptions {
  onStatus: (status: ConnectionStatus) => void
  onFrame: (frame: TelemetryFrame) => void
  logTelemetry: (message: string, details?: unknown) => void
  now?: () => number
}

export class MavlinkReducer {
  private liveState: Partial<TelemetryFrame> = {
    source: 'live'
  }
  private latestFrame: TelemetryFrame | null = null
  private hasGlobalPositionAltitude = false
  private readonly onStatus: (status: ConnectionStatus) => void
  private readonly onFrame: (frame: TelemetryFrame) => void
  private readonly logTelemetry: (message: string, details?: unknown) => void
  private readonly now: () => number

  constructor(options: MavlinkReducerOptions) {
    this.onStatus = options.onStatus
    this.onFrame = options.onFrame
    this.logTelemetry = options.logTelemetry
    this.now = options.now ?? Date.now
  }

  getLatestFrame(): TelemetryFrame | null {
    return this.latestFrame ? { ...this.latestFrame } : null
  }

  reset(): void {
    this.liveState = {
      source: 'live'
    }
    this.latestFrame = null
    this.hasGlobalPositionAltitude = false
  }

  consumePacket(packet: PacketLike, diagnostics: LinkDiagnostics | null): void {
    switch (packet.header.msgid) {
      case MSG_ID_HEARTBEAT: {
        const message = packet.protocol.data(packet.payload, minimal.Heartbeat) as minimal.Heartbeat

        if (diagnostics?.packetsReceived === 1) {
          this.logTelemetry('Heartbeat received from flight controller', {
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
        this.logTelemetry('Flight controller command ack', {
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

        this.emitFrameIfReady(diagnostics)
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

        this.emitFrameIfReady(diagnostics)
        return
      }

      case MSG_ID_ATTITUDE: {
        const message = packet.protocol.data(packet.payload, common.Attitude) as common.Attitude

        this.liveState.pitchDeg = toDegrees(message.pitch)
        this.liveState.rollDeg = toDegrees(message.roll)
        this.liveState.yawDeg = clampYaw(toDegrees(message.yaw))

        this.emitFrameIfReady(diagnostics)
        return
      }

      case MSG_ID_VFR_HUD: {
        const message = packet.protocol.data(packet.payload, common.VfrHud) as common.VfrHud

        this.liveState.airspeedMps = message.airspeed
        this.liveState.gpsSpeedMps = message.groundspeed
        if (!this.hasGlobalPositionAltitude) {
          this.liveState.altitudeM = message.alt
        }

        this.emitFrameIfReady(diagnostics)
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

        this.emitFrameIfReady(diagnostics)
        return
      }

      default:
        return
    }
  }

  private emitFrameIfReady(diagnostics: LinkDiagnostics | null): void {
    const hasFix = hasPositionFix(this.liveState)
    const latitudeDeg = hasFix ? this.liveState.latitudeDeg ?? 0 : this.latestFrame?.latitudeDeg ?? 0
    const longitudeDeg = hasFix ? this.liveState.longitudeDeg ?? 0 : this.latestFrame?.longitudeDeg ?? 0
    const frame: TelemetryFrame = {
      timestampMs: this.now(),
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
        this.logTelemetry('Emitting first live telemetry frame', {
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
        const satellitesText = frame.satellitesVisible === undefined ? '' : ` (${frame.satellitesVisible} satellites visible)`
        this.onStatus({
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
        this.onStatus({
          state: 'connected',
          transport: diagnostics.transport,
          mavlinkState: 'telemetry',
          message: `Receiving live telemetry from system ${diagnostics.targetSystemId ?? '?'} component ${diagnostics.targetComponentId ?? '?'}`
        })
      }
    }

    this.latestFrame = frame
    this.onFrame(frame)
  }
}
