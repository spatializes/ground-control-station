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

interface AppShellViewState {
  load: {
    state: 'idle' | 'loading' | 'ready' | 'error'
    error: string
  }
  scene: {
    frame: TelemetryFrame | null
    activeSource: DataSourceKind
    cameraLocked: boolean
    theme: ThemeMode
  }
  replay: {
    frames: TelemetryFrame[]
    index: number
    durationMs: number
    progress: number
    isPlaying: boolean
    speedMultiplier: number
  }
  altitudePanel: {
    frames: TelemetryFrame[]
    currentProgress: number
    currentAltitudeM: number | null
    isInteractive: boolean
    title: string
    xAxisLabel: string
    emptyMessage: string
  }
  ui: {
    isConnectionPanelOpen: boolean
    isAltitudeProfileCollapsed: boolean
    isWindPanelOpen: boolean
  }
  wind: {
    config: WindConfig
    label: string
    enabled: boolean
    mode: WindMode
    modeBadge: 'SYN' | 'LIVE'
    fetchState: WindFetchState
    statusText: string
  }
  connection: {
    status: ConnectionStatus
    selectedSource: DataSourceKind
    serialPorts: SerialPortInfo[]
    serialPath: string
    serialBaudRate: number
    websocketUrl: string
  }
}

interface AppShellViewActions {
  source: {
    setSelectedSource: (source: DataSourceKind) => void
    activateSelectedSource: () => void
    disconnectLive: () => void
    refreshSerialPorts: () => void
    setSerialPath: (path: string) => void
    setSerialBaudRate: (baudRate: number) => void
    setWebSocketUrl: (url: string) => void
  }
  wind: {
    setEnabled: (enabled: boolean) => void
    setMode: (mode: WindMode) => void
    togglePanel: () => void
    closePanel: () => void
  }
  replay: {
    togglePlay: () => void
    seekReplayProgress: (progress: number) => void
    hoverScrubReplay: (progress: number) => void
    setSpeedMultiplier: (speed: number) => void
  }
  ui: {
    setTheme: (theme: ThemeMode) => void
    toggleCameraLock: () => void
    toggleConnectionPanel: () => void
    closeConnectionPanel: () => void
    toggleAltitudeProfile: () => void
  }
}

interface AppShellViewProps {
  state: AppShellViewState
  actions: AppShellViewActions
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

export function AppShellView({ state, actions }: AppShellViewProps) {
  const { load, scene, replay, altitudePanel, ui, wind, connection } = state

  if (load.state === 'loading' || load.state === 'idle') {
    return (
      <main className="loading-state">
        <h1>Ground Control Station</h1>
        <p>Loading replay telemetry...</p>
      </main>
    )
  }

  if (load.state === 'error') {
    return (
      <main className="loading-state">
        <h1>Replay Load Failed</h1>
        <p>{load.error}</p>
      </main>
    )
  }

  return (
    <main className="app-shell theme-surface">
      <CesiumScene
        frame={scene.frame}
        cameraLocked={scene.cameraLocked}
        wind={wind.config}
        windEnabled={wind.enabled}
        theme={scene.theme}
      />

      <header className="app-header">
        <div className="brand-block">
          <h1>Ground Control Station</h1>
        </div>

        <div className="header-actions">
          <ThemeToggle theme={scene.theme} onThemeChange={actions.ui.setTheme} />
          <button type="button" className="ghost-btn source-btn" onClick={actions.ui.toggleConnectionPanel}>
            {ui.isConnectionPanelOpen ? 'Hide Data Source' : 'Data Source'}
            <span className={`status-pill status-${connection.status.state}`}>{sourceLabel(scene.activeSource)}</span>
          </button>
          <button type="button" className="ghost-btn" onClick={actions.ui.toggleCameraLock}>
            {scene.cameraLocked ? 'Unlock Camera' : 'Lock Camera'}
          </button>
          <WindControl
            label={wind.label}
            modeBadge={wind.modeBadge}
            enabled={wind.enabled}
            mode={wind.mode}
            fetchState={wind.fetchState}
            statusText={wind.statusText}
            isOpen={ui.isWindPanelOpen}
            onTogglePanel={actions.wind.togglePanel}
            onClosePanel={actions.wind.closePanel}
            onEnabledChange={actions.wind.setEnabled}
            onModeChange={actions.wind.setMode}
          />
        </div>
      </header>

      <HudOverlay frame={scene.frame} />

      {ui.isConnectionPanelOpen ? (
        <ConnectionPanel
          status={connection.status}
          activeSource={scene.activeSource}
          selectedSource={connection.selectedSource}
          serialPorts={connection.serialPorts}
          serialPath={connection.serialPath}
          serialBaudRate={connection.serialBaudRate}
          websocketUrl={connection.websocketUrl}
          onSelectedSourceChange={actions.source.setSelectedSource}
          onRefreshSerialPorts={actions.source.refreshSerialPorts}
          onSerialPathChange={actions.source.setSerialPath}
          onSerialBaudRateChange={actions.source.setSerialBaudRate}
          onWebSocketUrlChange={actions.source.setWebSocketUrl}
          onActivateSource={actions.source.activateSelectedSource}
          onDisconnectSource={actions.source.disconnectLive}
          onClose={actions.ui.closeConnectionPanel}
        />
      ) : null}

      <footer className="bottom-stack">
        <PlaybackBar
          isPlaying={replay.isPlaying}
          activeSource={scene.activeSource}
          progress={replay.progress}
          currentTimeMs={replay.durationMs * replay.progress}
          durationMs={replay.durationMs}
          speedMultiplier={replay.speedMultiplier}
          canPlay={replay.frames.length > 1}
          onTogglePlay={actions.replay.togglePlay}
          onSeekProgress={actions.replay.seekReplayProgress}
          onSpeedChange={actions.replay.setSpeedMultiplier}
        />

        <AltitudeProfilePanel
          frames={altitudePanel.frames}
          currentProgress={altitudePanel.currentProgress}
          currentAltitudeM={altitudePanel.currentAltitudeM}
          isCollapsed={ui.isAltitudeProfileCollapsed}
          isInteractive={altitudePanel.isInteractive}
          title={altitudePanel.title}
          xAxisLabel={altitudePanel.xAxisLabel}
          emptyMessage={altitudePanel.emptyMessage}
          onToggleCollapsed={actions.ui.toggleAltitudeProfile}
          onHoverScrub={actions.replay.hoverScrubReplay}
        />
      </footer>
    </main>
  )
}
