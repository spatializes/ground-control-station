import type { ConnectionStatus, DataSourceKind, SerialPortInfo, TelemetryFrame, ThemeMode, WindConfig } from '@shared/types'
import { CesiumScene } from '../cesium/CesiumScene'
import { PlaybackBar } from '../components/controls/PlaybackBar'
import { ThemeToggle } from '../components/controls/ThemeToggle'
import { HudOverlay } from '../components/hud/HudOverlay'
import { AltitudeProfilePanel } from '../components/panels/AltitudeProfilePanel'
import { ConnectionPanel } from '../components/panels/ConnectionPanel'

interface AppShellViewProps {
  loadState: 'idle' | 'loading' | 'ready' | 'error'
  loadError: string
  frame: TelemetryFrame | null
  replayFrames: TelemetryFrame[]
  replayIndex: number
  replayDurationMs: number
  replayProgress: number
  isPlaying: boolean
  speedMultiplier: number
  activeSource: DataSourceKind
  selectedSource: DataSourceKind
  cameraLocked: boolean
  theme: ThemeMode
  isConnectionPanelOpen: boolean
  wind: WindConfig
  connectionStatus: ConnectionStatus
  serialPorts: SerialPortInfo[]
  serialPath: string
  serialBaudRate: number
  websocketUrl: string
  onSelectedSourceChange: (source: DataSourceKind) => void
  onActivateSource: () => void
  onThemeChange: (theme: ThemeMode) => void
  onCameraLockToggle: () => void
  onConnectionPanelToggle: () => void
  onConnectionPanelClose: () => void
  onTogglePlay: () => void
  onSeekReplay: (progress: number) => void
  onSpeedChange: (speed: number) => void
  onRefreshSerialPorts: () => void
  onSerialPathChange: (path: string) => void
  onSerialBaudRateChange: (baudRate: number) => void
  onWebSocketUrlChange: (url: string) => void
  onDisconnectLive: () => void
}

function sourceLabel(source: DataSourceKind): string {
  if (source === 'csv') {
    return 'CSV Playback'
  }

  if (source === 'serial') {
    return 'Serial MAVLink'
  }

  return 'WebSocket MAVLink'
}

export function AppShellView({
  loadState,
  loadError,
  frame,
  replayFrames,
  replayIndex,
  replayDurationMs,
  replayProgress,
  isPlaying,
  speedMultiplier,
  activeSource,
  selectedSource,
  cameraLocked,
  theme,
  isConnectionPanelOpen,
  wind,
  connectionStatus,
  serialPorts,
  serialPath,
  serialBaudRate,
  websocketUrl,
  onSelectedSourceChange,
  onActivateSource,
  onThemeChange,
  onCameraLockToggle,
  onConnectionPanelToggle,
  onConnectionPanelClose,
  onTogglePlay,
  onSeekReplay,
  onSpeedChange,
  onRefreshSerialPorts,
  onSerialPathChange,
  onSerialBaudRateChange,
  onWebSocketUrlChange,
  onDisconnectLive
}: AppShellViewProps) {
  if (loadState === 'loading' || loadState === 'idle') {
    return (
      <main className="loading-state">
        <h1>Ground Control Station</h1>
        <p>Loading replay telemetry...</p>
      </main>
    )
  }

  if (loadState === 'error') {
    return (
      <main className="loading-state">
        <h1>Replay Load Failed</h1>
        <p>{loadError}</p>
      </main>
    )
  }

  return (
    <main className="app-shell theme-surface">
      <CesiumScene frame={frame} cameraLocked={cameraLocked} wind={wind} />

      <header className="app-header">
        <div className="brand-block">
          <h1>Ground Control Station</h1>
        </div>

        <div className="header-actions">
          <ThemeToggle theme={theme} onThemeChange={onThemeChange} />
          <button type="button" className="ghost-btn source-btn" onClick={onConnectionPanelToggle}>
            {isConnectionPanelOpen ? 'Hide Data Source' : 'Data Source'}
            <span className={`status-pill status-${connectionStatus.state}`}>{sourceLabel(activeSource)}</span>
          </button>
          <button type="button" className="ghost-btn" onClick={onCameraLockToggle}>
            {cameraLocked ? 'Unlock Camera' : 'Lock Camera'}
          </button>
          <div className="wind-chip">
            Wind {wind.fromDirectionDeg.toFixed(0)}° @ {wind.speedMps.toFixed(1)} m/s
          </div>
        </div>
      </header>

      <HudOverlay frame={frame} />

      {isConnectionPanelOpen ? (
        <ConnectionPanel
          status={connectionStatus}
          activeSource={activeSource}
          selectedSource={selectedSource}
          serialPorts={serialPorts}
          serialPath={serialPath}
          serialBaudRate={serialBaudRate}
          websocketUrl={websocketUrl}
          onSelectedSourceChange={onSelectedSourceChange}
          onRefreshSerialPorts={onRefreshSerialPorts}
          onSerialPathChange={onSerialPathChange}
          onSerialBaudRateChange={onSerialBaudRateChange}
          onWebSocketUrlChange={onWebSocketUrlChange}
          onActivateSource={onActivateSource}
          onDisconnectLive={onDisconnectLive}
          onClose={onConnectionPanelClose}
        />
      ) : null}

      <footer className="bottom-stack">
        <PlaybackBar
          isPlaying={isPlaying}
          activeSource={activeSource}
          progress={replayProgress}
          currentTimeMs={replayDurationMs * replayProgress}
          durationMs={replayDurationMs}
          speedMultiplier={speedMultiplier}
          canPlay={replayFrames.length > 1}
          onTogglePlay={onTogglePlay}
          onSeekProgress={onSeekReplay}
          onSpeedChange={onSpeedChange}
        />

        <AltitudeProfilePanel frames={replayFrames} currentIndex={replayIndex} />
      </footer>
    </main>
  )
}
