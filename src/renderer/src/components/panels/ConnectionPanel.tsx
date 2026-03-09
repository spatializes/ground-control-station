import { useEffect, useState, type ChangeEvent, type KeyboardEvent } from 'react'
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
  onDisconnectSource: () => void
  onClose: () => void
}

const COMMON_BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600] as const

function sourceLabel(source: DataSourceKind): string {
  if (source === 'csv') {
    return 'CSV Test Data'
  }

  if (source === 'serial') {
    return 'Serial MAVLink'
  }

  return 'WebSocket MAVLink'
}

function linkHealthLabel(status: ConnectionStatus): string | null {
  if (status.state !== 'connected' || !status.transport) {
    return null
  }

  const transportLabel = status.transport === 'serial' ? 'Serial' : 'WebSocket'

  if (status.mavlinkState === 'none') {
    return `${transportLabel}: connected, MAVLink not detected yet`
  }

  if (status.mavlinkState === 'packets') {
    return `${transportLabel}: connected, MAVLink packets detected`
  }

  if (status.mavlinkState === 'telemetry') {
    return `${transportLabel}: connected, MAVLink telemetry active`
  }

  return `${transportLabel}: connected`
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
  onDisconnectSource,
  onClose
}: ConnectionPanelProps) {
  const [serialBaudInput, setSerialBaudInput] = useState<string>(serialBaudRate.toString())

  useEffect(() => {
    setSerialBaudInput(serialBaudRate.toString())
  }, [serialBaudRate])

  const handleSerialPathChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    onSerialPathChange(event.target.value)
  }

  const commitSerialBaudRate = (): void => {
    const trimmed = serialBaudInput.trim()
    if (!/^\d+$/.test(trimmed)) {
      setSerialBaudInput(serialBaudRate.toString())
      return
    }

    const parsed = Number.parseInt(trimmed, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setSerialBaudInput(serialBaudRate.toString())
      return
    }

    onSerialBaudRateChange(parsed)
    setSerialBaudInput(parsed.toString())
  }

  const handleBaudRateChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setSerialBaudInput(event.target.value)
  }

  const handleBaudRateBlur = (): void => {
    commitSerialBaudRate()
  }

  const handleBaudRateKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitSerialBaudRate()
    }
  }

  const handleWebSocketUrlChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onWebSocketUrlChange(event.target.value)
  }

  const canActivate =
    selectedSource === 'csv' ||
    (selectedSource === 'serial' && serialPath.length > 0) ||
    (selectedSource === 'websocket' && websocketUrl.trim().length > 0)

  const canDisconnect =
    selectedSource !== 'csv' &&
    activeSource === selectedSource &&
    status.state !== 'disconnected'

  const activateLabel =
    canDisconnect
      ? 'Disconnect'
      : selectedSource === 'csv'
        ? 'Use CSV Test Data'
        : selectedSource === 'serial'
          ? 'Connect Serial'
          : 'Connect WebSocket'

  const handlePrimaryAction = canDisconnect ? onDisconnectSource : onActivateSource
  const linkHealth = linkHealthLabel(status)

  return (
    <aside className="connection-panel" aria-label="Data source controls">
      <div className="panel-header">
        <h2>Data Source</h2>
        <div className="panel-header-actions">
          <span className="status-pill source-pill">Active: {sourceLabel(activeSource)}</span>
          <button type="button" className="ghost-btn panel-close-btn" onClick={onClose} aria-label="Close data source panel">
            <span aria-hidden="true">×</span>
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
            <input
              type="text"
              inputMode="numeric"
              list="serial-baud-options"
              value={serialBaudInput}
              onChange={handleBaudRateChange}
              onBlur={handleBaudRateBlur}
              onKeyDown={handleBaudRateKeyDown}
            />
            <datalist id="serial-baud-options">
              {COMMON_BAUD_RATES.map((baudRate) => (
                <option key={baudRate} value={baudRate.toString()} />
              ))}
            </datalist>
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

      <button type="button" className="primary-btn" onClick={handlePrimaryAction} disabled={!canDisconnect && !canActivate}>
        {activateLabel}
      </button>

      <div className="panel-footer-row">
        <span className={`status-pill status-${status.state}`}>{status.state}</span>
      </div>

      {linkHealth ? <p className="connection-link-health">{linkHealth}</p> : null}

      {status.message ? (
        <p className={`connection-status-detail status-detail-${status.state}`}>
          {status.transport ? `${status.transport.toUpperCase()}: ` : ''}
          {status.message}
        </p>
      ) : null}
    </aside>
  )
}
