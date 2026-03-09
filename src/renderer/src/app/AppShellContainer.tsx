import { useEffect, useMemo } from 'react'
import { observer } from 'mobx-react-lite'
import { AppStore } from '../state/AppStore'
import { usePlaybackClock } from '../hooks/usePlaybackClock'
import { useThemeClass } from '../hooks/useThemeClass'
import { AppShellView } from './AppShellView'

function runAsyncTask(task: Promise<void>, context: string): void {
  void task.catch((error) => {
    console.error(`[app-shell] ${context}`, error)
  })
}

export const AppShellContainer = observer(function AppShellContainer() {
  const store = useMemo(() => new AppStore(), [])

  usePlaybackClock(store)
  useThemeClass(store.ui.theme)

  useEffect(() => {
    store.start()
    runAsyncTask(store.initializeReplay(), 'Failed to initialize replay')
    runAsyncTask(store.refreshSerialPorts(), 'Failed to refresh serial ports on startup')

    return () => {
      store.dispose()
    }
  }, [store])

  return (
    <AppShellView
      state={{
        load: {
          state: store.loadState,
          error: store.loadError
        },
        scene: {
          frame: store.currentFrame,
          cameraLocked: store.ui.cameraLocked,
          theme: store.ui.theme,
          activeSource: store.ui.activeSource
        },
        replay: {
          frames: store.playback.frames,
          index: store.currentReplayIndex,
          durationMs: store.replayDurationMs,
          progress: store.replayProgress,
          isPlaying: store.playback.isPlaying,
          speedMultiplier: store.playback.speedMultiplier
        },
        altitudePanel: store.altitudePanelModel,
        ui: {
          isConnectionPanelOpen: store.ui.isConnectionPanelOpen,
          isAltitudeProfileCollapsed: store.ui.isAltitudeProfileCollapsed,
          isWindPanelOpen: store.ui.windPanelOpen
        },
        wind: {
          config: store.effectiveWind,
          label: store.effectiveWindLabel,
          enabled: store.wind.enabled,
          mode: store.wind.mode,
          modeBadge: store.windModeBadge,
          fetchState: store.wind.fetchState,
          statusText: store.windStatusText
        },
        connection: {
          status: store.live.connectionStatus,
          selectedSource: store.ui.selectedSource,
          serialPorts: store.live.serialPorts,
          serialPath: store.live.serialPath,
          serialBaudRate: store.live.serialBaudRate,
          websocketUrl: store.live.websocketUrl
        }
      }}
      actions={{
        source: {
          setSelectedSource: store.setSelectedSource,
          activateSelectedSource: () => runAsyncTask(store.activateSelectedSource(), 'Failed to activate source'),
          disconnectLive: () => runAsyncTask(store.disconnectLive(), 'Failed to disconnect source'),
          refreshSerialPorts: () => runAsyncTask(store.refreshSerialPorts(), 'Failed to refresh serial ports'),
          setSerialPath: store.setSerialPath,
          setSerialBaudRate: store.setSerialBaudRate,
          setWebSocketUrl: store.setWebSocketUrl
        },
        wind: {
          setEnabled: store.setWindEnabled,
          setMode: store.setWindMode,
          togglePanel: () => store.setWindPanelOpen(!store.ui.windPanelOpen),
          closePanel: () => store.setWindPanelOpen(false)
        },
        replay: {
          togglePlay: store.toggleReplay,
          seekReplayProgress: store.seekReplayProgress,
          hoverScrubReplay: store.scrubReplayByProgress,
          setSpeedMultiplier: store.setSpeedMultiplier
        },
        ui: {
          setTheme: store.setTheme,
          toggleCameraLock: () => store.setCameraLocked(!store.ui.cameraLocked),
          toggleConnectionPanel: () => store.setConnectionPanelOpen(!store.ui.isConnectionPanelOpen),
          closeConnectionPanel: () => store.setConnectionPanelOpen(false),
          toggleAltitudeProfile: () => store.setAltitudeProfileCollapsed(!store.ui.isAltitudeProfileCollapsed)
        }
      }}
    />
  )
})
