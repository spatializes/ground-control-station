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
      mode={store.ui.mode}
      cameraLocked={store.ui.cameraLocked}
      theme={store.ui.theme}
      wind={store.wind}
      connectionStatus={store.live.connectionStatus}
      serialPorts={store.live.serialPorts}
      serialPath={store.live.serialPath}
      serialBaudRate={store.live.serialBaudRate}
      websocketUrl={store.live.websocketUrl}
      onModeChange={store.setMode}
      onThemeChange={store.setTheme}
      onCameraLockToggle={() => store.setCameraLocked(!store.ui.cameraLocked)}
      onTogglePlay={store.toggleReplay}
      onSeekReplay={store.seekReplayProgress}
      onSpeedChange={store.setSpeedMultiplier}
      onRefreshSerialPorts={() => void store.refreshSerialPorts()}
      onSerialPathChange={store.setSerialPath}
      onSerialBaudRateChange={store.setSerialBaudRate}
      onWebSocketUrlChange={store.setWebSocketUrl}
      onConnectSerial={() => void store.connectSerial()}
      onConnectWebSocket={() => void store.connectWebSocket()}
      onDisconnectLive={() => void store.disconnectLive()}
    />
  )
})
