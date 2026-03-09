export interface LinkDiagnostics {
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

export function createDiagnostics(transport: 'serial' | 'websocket'): LinkDiagnostics {
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

export function buildSerialDiagnosticsWarning(
  diagnostics: LinkDiagnostics,
  path: string,
  baudRate: number
): { message: string; mavlinkState: 'none' | 'packets' } | null {
  if (diagnostics.transport !== 'serial' || diagnostics.framesEmitted > 0) {
    return null
  }

  if (diagnostics.bytesReceived === 0) {
    return {
      message: `Connected to ${path}, but no serial data has arrived yet. Check the USB cable, port, and flight-controller MAVLink output.`,
      mavlinkState: 'none'
    }
  }

  if (diagnostics.packetsReceived === 0) {
    return {
      message:
        `Serial bytes are arriving on ${path}, but no MAVLink packets decoded at ${baudRate} baud. USB flight controllers commonly use 115200.`,
      mavlinkState: 'none'
    }
  }

  return {
    message:
      `MAVLink packets are arriving on ${path}, but no GPS frame has been emitted yet. Waiting for GLOBAL_POSITION_INT or GPS_RAW_INT.`,
    mavlinkState: 'packets'
  }
}
