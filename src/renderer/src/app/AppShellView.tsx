import type { ConnectionStatus, SerialPortInfo, TelemetryFrame, TelemetryMode, ThemeMode, WindConfig } from '@shared/types'
import { CesiumScene } from '../cesium/CesiumScene'
import { ModeToggle } from '../components/controls/ModeToggle'
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
  mode: TelemetryMode
  cameraLocked: boolean
  theme: ThemeMode
  wind: WindConfig
  connectionStatus: ConnectionStatus
  serialPorts: SerialPortInfo[]
  serialPath: string
  serialBaudRate: number
  websocketUrl: string
  onModeChange: (mode: TelemetryMode) => void
  onThemeChange: (theme: ThemeMode) => void
  onCameraLockToggle: () => void
  onTogglePlay: () => void
  onSeekReplay: (progress: number) => void
  onSpeedChange: (speed: number) => void
  onRefreshSerialPorts: () => void
  onSerialPathChange: (path: string) => void
  onSerialBaudRateChange: (baudRate: number) => void
  onWebSocketUrlChange: (url: string) => void
  onConnectSerial: () => void
  onConnectWebSocket: () => void
  onDisconnectLive: () => void
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
  mode,
  cameraLocked,
  theme,
  wind,
  connectionStatus,
  serialPorts,
  serialPath,
  serialBaudRate,
  websocketUrl,
  onModeChange,
  onThemeChange,
  onCameraLockToggle,
  onTogglePlay,
  onSeekReplay,
  onSpeedChange,
  onRefreshSerialPorts,
  onSerialPathChange,
  onSerialBaudRateChange,
  onWebSocketUrlChange,
  onConnectSerial,
  onConnectWebSocket,
  onDisconnectLive
}: AppShellViewProps) {
  if (loadState === 'loading' || loadState === 'idle') {
    return (
      <main className="loading-state">
        <h1>Droplands Ground Control Station</h1>
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
          <span className="eyebrow">Droplands</span>
          <h1>Ground Control Station</h1>
          <p>Replay-first mission telemetry viewer</p>
        </div>

        <div className="header-actions">
          <ModeToggle mode={mode} onModeChange={onModeChange} />
          <ThemeToggle theme={theme} onThemeChange={onThemeChange} />
          <button type="button" className="ghost-btn" onClick={onCameraLockToggle}>
            {cameraLocked ? 'Unlock Camera' : 'Lock Camera'}
          </button>
          <div className="wind-chip">
            Wind {wind.fromDirectionDeg.toFixed(0)}° @ {wind.speedMps.toFixed(1)} m/s
          </div>
        </div>
      </header>

      <HudOverlay frame={frame} />

      <ConnectionPanel
        status={connectionStatus}
        serialPorts={serialPorts}
        serialPath={serialPath}
        serialBaudRate={serialBaudRate}
        websocketUrl={websocketUrl}
        onRefreshSerialPorts={onRefreshSerialPorts}
        onSerialPathChange={onSerialPathChange}
        onSerialBaudRateChange={onSerialBaudRateChange}
        onWebSocketUrlChange={onWebSocketUrlChange}
        onConnectSerial={onConnectSerial}
        onConnectWebSocket={onConnectWebSocket}
        onDisconnect={onDisconnectLive}
      />

      <footer className="bottom-stack">
        <PlaybackBar
          isPlaying={isPlaying}
          mode={mode}
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
