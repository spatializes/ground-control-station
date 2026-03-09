import { describe, expect, it } from 'vitest'
import type { ConnectionStatus } from '@shared/types'
import { createDiagnostics } from './core/diagnostics'
import { MSG_ID_ATTITUDE, type PacketLike } from './core/mavlinkReducer'
import { LiveTelemetryService } from './LiveTelemetryService'

function createAttitudePacket(): PacketLike {
  return {
    header: {
      msgid: MSG_ID_ATTITUDE,
      sysid: 1,
      compid: 1
    },
    payload: Buffer.alloc(0),
    protocol: {
      data: () => ({
        pitch: 0.1,
        roll: 0.2,
        yaw: 0.3
      })
    }
  }
}

describe('LiveTelemetryService lifecycle', () => {
  it('disconnect clears timers, resets frame state, and emits disconnected status', async () => {
    const service = new LiveTelemetryService()
    const statuses: ConnectionStatus[] = []

    service.on('status', (status) => {
      statuses.push(status)
    })

    const internals = service as unknown as {
      diagnostics: ReturnType<typeof createDiagnostics> | null
      heartbeatTimer: ReturnType<typeof setInterval> | null
      diagnosticsWarningTimer: ReturnType<typeof setTimeout> | null
      reducer: { consumePacket: (packet: PacketLike, diagnostics: ReturnType<typeof createDiagnostics> | null) => void }
    }

    const diagnostics = createDiagnostics('serial')
    diagnostics.targetSystemId = 1
    diagnostics.targetComponentId = 1
    internals.diagnostics = diagnostics
    internals.heartbeatTimer = setInterval(() => undefined, 1000)
    internals.diagnosticsWarningTimer = setTimeout(() => undefined, 1000)

    internals.reducer.consumePacket(createAttitudePacket(), diagnostics)
    expect(service.getLatestFrame()).not.toBeNull()

    await service.disconnect()

    expect(internals.heartbeatTimer).toBeNull()
    expect(internals.diagnosticsWarningTimer).toBeNull()
    expect(service.getLatestFrame()).toBeNull()

    const lastStatus = statuses[statuses.length - 1]
    expect(lastStatus.state).toBe('disconnected')
    expect(lastStatus.message).toBe('Live link disconnected')
  })
})
