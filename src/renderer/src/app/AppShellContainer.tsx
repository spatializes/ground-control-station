import { useEffect, useMemo } from 'react'
import { observer } from 'mobx-react-lite'
import { AppStore } from '../state/AppStore'
import { usePlaybackClock } from '../hooks/usePlaybackClock'
import { useThemeClass } from '../hooks/useThemeClass'
import { AppShellView } from './AppShellView'

export const AppShellContainer = observer(function AppShellContainer() {
  const store = useMemo(() => new AppStore(), [])

  usePlaybackClock(store)
  useThemeClass(store.ui.theme)

  useEffect(() => {
    void store.initializeReplay()
    void store.refreshSerialPorts()

    return () => {
      store.dispose()
    }
  }, [store])

  return (
    <AppShellView
      loadState={store.loadState}
      loadError={store.loadError}
      frame={store.currentFrame}
      replayFrames={store.playback.frames}
      replayIndex={store.currentReplayIndex}
      replayDurationMs={store.replayDurationMs}
      replayProgress={store.replayProgress}
      isPlaying={store.playback.isPlaying}
      speedMultiplier={store.playback.speedMultiplier}
      activeSource={store.ui.activeSource}
      selectedSource={store.ui.selectedSource}
      cameraLocked={store.ui.cameraLocked}
      theme={store.ui.theme}
      isConnectionPanelOpen={store.ui.isConnectionPanelOpen}
      isAltitudeProfileCollapsed={store.ui.isAltitudeProfileCollapsed}
      wind={store.effectiveWind}
      windLabel={store.effectiveWindLabel}
      windEnabled={store.wind.enabled}
      windMode={store.wind.mode}
      windModeBadge={store.windModeBadge}
      windFetchState={store.wind.fetchState}
      windStatusText={store.windStatusText}
      isWindPanelOpen={store.ui.windPanelOpen}
      connectionStatus={store.live.connectionStatus}
      serialPorts={store.live.serialPorts}
      serialPath={store.live.serialPath}
      serialBaudRate={store.live.serialBaudRate}
      websocketUrl={store.live.websocketUrl}
      onSelectedSourceChange={store.setSelectedSource}
      onActivateSource={() => void store.activateSelectedSource()}
      onThemeChange={store.setTheme}
      onCameraLockToggle={() => store.setCameraLocked(!store.ui.cameraLocked)}
      onConnectionPanelToggle={() => store.setConnectionPanelOpen(!store.ui.isConnectionPanelOpen)}
      onConnectionPanelClose={() => store.setConnectionPanelOpen(false)}
      onWindPanelToggle={() => store.setWindPanelOpen(!store.ui.windPanelOpen)}
      onWindPanelClose={() => store.setWindPanelOpen(false)}
      onWindEnabledChange={store.setWindEnabled}
      onWindModeChange={store.setWindMode}
      onAltitudeProfileToggle={() => store.setAltitudeProfileCollapsed(!store.ui.isAltitudeProfileCollapsed)}
      onTogglePlay={store.toggleReplay}
      onSeekReplay={store.seekReplayProgress}
      onHoverScrubReplay={store.scrubReplayByProgress}
      onSpeedChange={store.setSpeedMultiplier}
      onRefreshSerialPorts={() => void store.refreshSerialPorts()}
      onSerialPathChange={store.setSerialPath}
      onSerialBaudRateChange={store.setSerialBaudRate}
      onWebSocketUrlChange={store.setWebSocketUrl}
      onDisconnectLive={() => void store.disconnectLive()}
    />
  )
})
