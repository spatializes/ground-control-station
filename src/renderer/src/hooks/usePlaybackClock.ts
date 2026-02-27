import { useEffect, useRef } from 'react'
import type { AppStore } from '../state/AppStore'

export function usePlaybackClock(store: AppStore): void {
  const frameIdRef = useRef<number | null>(null)
  const lastTickRef = useRef<number | null>(null)

  useEffect(() => {
    if (!store.playback.isPlaying || store.ui.activeSource !== 'csv') {
      if (frameIdRef.current !== null) {
        cancelAnimationFrame(frameIdRef.current)
        frameIdRef.current = null
      }
      lastTickRef.current = null
      return
    }

    const tick = (timestampMs: number): void => {
      if (lastTickRef.current === null) {
        lastTickRef.current = timestampMs
      }

      const deltaMs = timestampMs - lastTickRef.current
      lastTickRef.current = timestampMs

      store.advancePlaybackBy(deltaMs)
      frameIdRef.current = requestAnimationFrame(tick)
    }

    frameIdRef.current = requestAnimationFrame(tick)

    return () => {
      if (frameIdRef.current !== null) {
        cancelAnimationFrame(frameIdRef.current)
        frameIdRef.current = null
      }
      lastTickRef.current = null
    }
  }, [store, store.playback.isPlaying, store.ui.activeSource])
}
