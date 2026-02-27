import type { ChangeEvent } from 'react'
import type { ConnectionStatus, DataSourceKind, SerialPortInfo } from '@shared/types'

interface ConnectionPanelProps {
  status: ConnectionStatus
  activeSource: DataSourceKind
  selectedSource: DataSourceKind
  serialPorts: SerialPortInfo[]
  serialPath: string
  serialBaudRate: number
  websocketUrl: string
  onSelectedSourceChange: (source: DataSourceKind) => void
  onRefreshSerialPorts: () => void
  onSerialPathChange: (path: string) => void
  onSerialBaudRateChange: (baudRate: number) => void
  onWebSocketUrlChange: (url: string) => void
  onActivateSource: () => void
  onDisconnectLive: () => void
  onClose: () => void
}

function sourceLabel(source: DataSourceKind): string {
  if (source === 'csv') {
    return 'CSV Test Data'
  }

  if (source === 'serial') {
    return 'Serial MAVLink'
  }

  return 'WebSocket MAVLink'
}

export function ConnectionPanel({
  status,
  activeSource,
  selectedSource,
  serialPorts,
  serialPath,
  serialBaudRate,
  websocketUrl,
  onSelectedSourceChange,
  onRefreshSerialPorts,
  onSerialPathChange,
  onSerialBaudRateChange,
  onWebSocketUrlChange,
  onActivateSource,
  onDisconnectLive,
  onClose
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

  const canActivate =
    selectedSource === 'csv' ||
    (selectedSource === 'serial' && serialPath.length > 0) ||
    (selectedSource === 'websocket' && websocketUrl.trim().length > 0)

  const activateLabel =
    selectedSource === 'csv'
      ? 'Use CSV Test Data'
      : selectedSource === 'serial'
        ? 'Connect Serial'
        : 'Connect WebSocket'

  return (
    <aside className="connection-panel" aria-label="Data source controls">
      <div className="panel-header">
        <h2>Data Source</h2>
        <div className="panel-header-actions">
          <span className="status-pill source-pill">Active: {sourceLabel(activeSource)}</span>
          <button type="button" className="ghost-btn panel-close-btn" onClick={onClose} aria-label="Close data source panel">
            Close
          </button>
        </div>
      </div>

      <p className="panel-help">Choose one source to drive the scene and telemetry.</p>

      <div className="segmented-toggle source-segmented" role="tablist" aria-label="Source selection">
        <button
          type="button"
          className={selectedSource === 'csv' ? 'active' : ''}
          onClick={() => onSelectedSourceChange('csv')}
        >
          CSV
        </button>
        <button
          type="button"
          className={selectedSource === 'serial' ? 'active' : ''}
          onClick={() => onSelectedSourceChange('serial')}
        >
          Serial
        </button>
        <button
          type="button"
          className={selectedSource === 'websocket' ? 'active' : ''}
          onClick={() => onSelectedSourceChange('websocket')}
        >
          WebSocket
        </button>
      </div>

      {selectedSource === 'csv' ? (
        <section className="connection-section">
          <h3>CSV Test Data</h3>
          <p className="panel-help">Uses the bundled replay file and enables playback controls.</p>
        </section>
      ) : null}

      {selectedSource === 'serial' ? (
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
        </section>
      ) : null}

      {selectedSource === 'websocket' ? (
        <section className="connection-section">
          <h3>WebSocket MAVLink</h3>

          <label>
            URL
            <input type="text" value={websocketUrl} onChange={handleWebSocketUrlChange} spellCheck={false} />
          </label>
        </section>
      ) : null}

      <button type="button" className="primary-btn" onClick={onActivateSource} disabled={!canActivate}>
        {activateLabel}
      </button>

      <div className="panel-footer-row">
        <span className={`status-pill status-${status.state}`}>{status.state}</span>
        <button
          type="button"
          className="ghost-btn"
          onClick={onDisconnectLive}
          disabled={activeSource === 'csv' || status.state === 'disconnected'}
        >
          Disconnect Live
        </button>
      </div>
    </aside>
  )
}
