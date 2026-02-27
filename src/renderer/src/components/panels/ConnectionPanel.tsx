import type { ChangeEvent } from 'react'
import type { ConnectionStatus, SerialPortInfo } from '@shared/types'

interface ConnectionPanelProps {
  status: ConnectionStatus
  serialPorts: SerialPortInfo[]
  serialPath: string
  serialBaudRate: number
  websocketUrl: string
  onRefreshSerialPorts: () => void
  onSerialPathChange: (path: string) => void
  onSerialBaudRateChange: (baudRate: number) => void
  onWebSocketUrlChange: (url: string) => void
  onConnectSerial: () => void
  onConnectWebSocket: () => void
  onDisconnect: () => void
}

export function ConnectionPanel({
  status,
  serialPorts,
  serialPath,
  serialBaudRate,
  websocketUrl,
  onRefreshSerialPorts,
  onSerialPathChange,
  onSerialBaudRateChange,
  onWebSocketUrlChange,
  onConnectSerial,
  onConnectWebSocket,
  onDisconnect
}: ConnectionPanelProps) {
  const handleSerialPathChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    onSerialPathChange(event.target.value)
  }

  const handleBaudRateChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const value = Number(event.target.value)
    if (Number.isFinite(value)) {
      onSerialBaudRateChange(value)
    }
  }

  const handleWebSocketUrlChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onWebSocketUrlChange(event.target.value)
  }

  return (
    <aside className="connection-panel" aria-label="Live telemetry link controls">
      <div className="panel-header">
        <h2>Live Link</h2>
        <span className={`status-pill status-${status.state}`}>{status.state}</span>
      </div>
      <p className="panel-help">{status.message ?? 'Use serial MAVLink or raw MAVLink over websocket.'}</p>

      <section className="connection-section">
        <div className="connection-row">
          <h3>Serial MAVLink</h3>
          <button type="button" className="ghost-btn" onClick={onRefreshSerialPorts}>
            Refresh
          </button>
        </div>

        <label>
          Port
          <select value={serialPath} onChange={handleSerialPathChange}>
            <option value="">Select serial port</option>
            {serialPorts.map((port) => (
              <option key={port.path} value={port.path}>
                {port.path}
              </option>
            ))}
          </select>
        </label>

        <label>
          Baud
          <input type="number" value={serialBaudRate} min={1200} step={100} onChange={handleBaudRateChange} />
        </label>

        <button type="button" className="primary-btn" onClick={onConnectSerial} disabled={!serialPath}>
          Connect Serial
        </button>
      </section>

      <section className="connection-section">
        <h3>WebSocket MAVLink</h3>

        <label>
          URL
          <input type="text" value={websocketUrl} onChange={handleWebSocketUrlChange} spellCheck={false} />
        </label>

        <button
          type="button"
          className="primary-btn"
          onClick={onConnectWebSocket}
          disabled={websocketUrl.trim().length === 0}
        >
          Connect WebSocket
        </button>
      </section>

      <button type="button" className="ghost-btn" onClick={onDisconnect}>
        Disconnect
      </button>
    </aside>
  )
}
