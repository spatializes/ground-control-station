import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseCsv } from '../lib/csv/parseCsv'
import { AppStore } from '../state/AppStore'

describe('Replay smoke scenario', () => {
  it('loads CSV and supports play/pause/scrub replay workflow', () => {
    const csvPath = path.resolve(process.cwd(), 'public/data/ground-control-test-data.csv')
    const rawCsv = fs.readFileSync(csvPath, 'utf-8')

    const frames = parseCsv(rawCsv)
    expect(frames.length).toBeGreaterThan(1000)

    const store = new AppStore({ api: null })
    try {
      store.setReplayFrames(frames)

      const initialFrame = store.currentFrame
      expect(initialFrame).not.toBeNull()

      store.playReplay()
      store.advancePlaybackBy(1000)

      const playingFrame = store.currentFrame
      expect(playingFrame).not.toBeNull()
      expect(playingFrame?.timestampMs).toBeGreaterThan(initialFrame?.timestampMs ?? 0)

      store.pauseReplay()
      const pausedTimestamp = store.currentFrame?.timestampMs ?? 0
      store.advancePlaybackBy(1200)
      expect(store.currentFrame?.timestampMs ?? 0).toBe(pausedTimestamp)

      store.seekReplayProgress(0.5)
      const scrubbedTimestamp = store.currentFrame?.timestampMs ?? 0
      expect(scrubbedTimestamp).toBeGreaterThan(pausedTimestamp)

      store.seekReplayProgress(0.5)
      expect(store.currentFrame?.timestampMs ?? 0).toBe(scrubbedTimestamp)
    } finally {
      store.dispose()
    }
  })
})
