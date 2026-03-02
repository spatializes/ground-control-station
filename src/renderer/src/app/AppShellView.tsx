import type {
  ConnectionStatus,
  DataSourceKind,
  SerialPortInfo,
  TelemetryFrame,
  ThemeMode,
  WindConfig,
  WindFetchState,
  WindMode
} from '@shared/types'
import { CesiumScene } from '../cesium/CesiumScene'
import { PlaybackBar } from '../components/controls/PlaybackBar'
import { ThemeToggle } from '../components/controls/ThemeToggle'
import { WindControl } from '../components/controls/WindControl'
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
  isAltitudeProfileCollapsed: boolean
  wind: WindConfig
  windLabel: string
  windEnabled: boolean
  windMode: WindMode
  windModeBadge: 'SYN' | 'LIVE'
  windFetchState: WindFetchState
  windStatusText: string
  isWindPanelOpen: boolean
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
  onWindPanelToggle: () => void
  onWindPanelClose: () => void
  onWindEnabledChange: (enabled: boolean) => void
  onWindModeChange: (mode: WindMode) => void
  onAltitudeProfileToggle: () => void
  onTogglePlay: () => void
  onSeekReplay: (progress: number) => void
  onHoverScrubReplay: (progress: number) => void
  onSpeedChange: (speed: number) => void
  onRefreshSerialPorts: () => void
  onSerialPathChange: (path: string) => void
  onSerialBaudRateChange: (baudRate: number) => void
  onWebSocketUrlChange: (url: string) => void
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
  isAltitudeProfileCollapsed,
  wind,
  windLabel,
  windEnabled,
  windMode,
  windModeBadge,
  windFetchState,
  windStatusText,
  isWindPanelOpen,
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
  onWindPanelToggle,
  onWindPanelClose,
  onWindEnabledChange,
  onWindModeChange,
  onAltitudeProfileToggle,
  onTogglePlay,
  onSeekReplay,
  onHoverScrubReplay,
  onSpeedChange,
  onRefreshSerialPorts,
  onSerialPathChange,
  onSerialBaudRateChange,
  onWebSocketUrlChange
}: AppShellViewProps) {
  const currentReplayAltitudeM = replayFrames[replayIndex]?.altitudeM ?? null

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
      <CesiumScene frame={frame} cameraLocked={cameraLocked} wind={wind} windEnabled={windEnabled} theme={theme} />

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
          <WindControl
            label={windLabel}
            modeBadge={windModeBadge}
            enabled={windEnabled}
            mode={windMode}
            fetchState={windFetchState}
            statusText={windStatusText}
            isOpen={isWindPanelOpen}
            onTogglePanel={onWindPanelToggle}
            onClosePanel={onWindPanelClose}
            onEnabledChange={onWindEnabledChange}
            onModeChange={onWindModeChange}
          />
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

        <AltitudeProfilePanel
          frames={replayFrames}
          currentProgress={replayProgress}
          currentAltitudeM={currentReplayAltitudeM}
          isCollapsed={isAltitudeProfileCollapsed}
          isInteractive={activeSource === 'csv'}
          onToggleCollapsed={onAltitudeProfileToggle}
          onHoverScrub={onHoverScrubReplay}
        />
      </footer>
    </main>
  )
}
