import { makeAutoObservable } from 'mobx'
import type { TelemetryFrame } from '@shared/types'
import { clamp } from '../../lib/format'

export class PlaybackDomain {
  frames: TelemetryFrame[] = []
  cursorMs = 0
  isPlaying = false
  speedMultiplier = 10

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true })
  }

  get durationMs(): number {
    if (this.frames.length < 2) {
      return 0
    }

    return this.frames[this.frames.length - 1].timestampMs - this.frames[0].timestampMs
  }

  get progress(): number {
    if (this.durationMs <= 0) {
      return 0
    }

    return this.cursorMs / this.durationMs
  }

  setFrames(frames: TelemetryFrame[]): void {
    this.frames = frames
    this.cursorMs = 0
    this.isPlaying = false
  }

  setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = clamp(multiplier, 0.25, 10)
  }

  play(canPlay: boolean): void {
    if (!canPlay) {
      return
    }

    if (this.cursorMs >= this.durationMs) {
      this.cursorMs = 0
    }

    this.isPlaying = true
  }

  pause(): void {
    this.isPlaying = false
  }

  seekProgress(progress: number): void {
    if (this.frames.length < 2) {
      return
    }

    this.cursorMs = this.durationMs * clamp(progress, 0, 1)
  }

  advanceBy(deltaMs: number): { reachedEnd: boolean } {
    if (!this.isPlaying || this.frames.length < 2) {
      return { reachedEnd: false }
    }

    const nextCursorMs = this.cursorMs + deltaMs * this.speedMultiplier
    if (nextCursorMs >= this.durationMs) {
      this.cursorMs = this.durationMs
      this.pause()
      return { reachedEnd: true }
    }

    this.cursorMs = Math.max(0, nextCursorMs)
    return { reachedEnd: false }
  }
}
