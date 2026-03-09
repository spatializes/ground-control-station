import { describe, expect, it, vi } from 'vitest'
import type { ConnectionStatus, TelemetryFrame } from '@shared/types'
import { createDiagnostics } from './diagnostics'
import {
  MavlinkReducer,
  MSG_ID_ATTITUDE,
  MSG_ID_GLOBAL_POSITION_INT,
  type PacketLike
} from './mavlinkReducer'

function createPacket(msgid: number, message: unknown, sysid = 1, compid = 1): PacketLike {
  return {
    header: {
      msgid,
      sysid,
      compid
    },
    payload: Buffer.alloc(0),
    protocol: {
      data: () => message
    }
  }
}

describe('MavlinkReducer', () => {
  it('emits telemetry frame defaults and no-fix status when only attitude is available', () => {
    const statuses: ConnectionStatus[] = []
    const frames: TelemetryFrame[] = []
    const reducer = new MavlinkReducer({
      onStatus: (status) => statuses.push(status),
      onFrame: (frame) => frames.push(frame),
      logTelemetry: vi.fn(),
      now: () => 1234
    })

    const diagnostics = createDiagnostics('serial')
    diagnostics.packetsReceived = 1
    diagnostics.targetSystemId = 9
    diagnostics.targetComponentId = 1

    reducer.consumePacket(
      createPacket(MSG_ID_ATTITUDE, {
        pitch: 0.5,
        roll: -0.25,
        yaw: -0.5
      }),
      diagnostics
    )

    expect(frames).toHaveLength(1)
    expect(frames[0]).toMatchObject({
      timestampMs: 1234,
      latitudeDeg: 0,
      longitudeDeg: 0,
      altitudeM: 0,
      gpsSpeedMps: 0,
      airspeedMps: 0,
      hasPositionFix: false,
      source: 'live'
    })

    expect(statuses).toHaveLength(1)
    expect(statuses[0].message).toContain('no GPS fix yet')
    expect(statuses[0].mavlinkState).toBe('telemetry')
  })

  it('emits position-fix status once when coordinates become available', () => {
    const statuses: ConnectionStatus[] = []
    const frames: TelemetryFrame[] = []
    const reducer = new MavlinkReducer({
      onStatus: (status) => statuses.push(status),
      onFrame: (frame) => frames.push(frame),
      logTelemetry: vi.fn(),
      now: () => 2222
    })

    const diagnostics = createDiagnostics('websocket')
    diagnostics.targetSystemId = 4
    diagnostics.targetComponentId = 1

    reducer.consumePacket(
      createPacket(MSG_ID_GLOBAL_POSITION_INT, {
        lat: 265000000,
        lon: -970000000,
        alt: 120000,
        vx: 100,
        vy: 200
      }),
      diagnostics
    )

    reducer.consumePacket(
      createPacket(MSG_ID_ATTITUDE, {
        pitch: 0,
        roll: 0,
        yaw: 0
      }),
      diagnostics
    )

    const fixStatuses = statuses.filter((status) => status.message?.includes('Receiving live telemetry') === true)
    expect(fixStatuses).toHaveLength(1)
    expect(frames[0].hasPositionFix).toBe(true)
    expect(frames[0].latitudeDeg).toBeCloseTo(26.5)
    expect(frames[0].longitudeDeg).toBeCloseTo(-97)
  })
})
