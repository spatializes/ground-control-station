import type { ChangeEvent } from 'react'
import { formatDuration } from '../../lib/format'

interface PlaybackBarProps {
  isPlaying: boolean
  mode: 'replay' | 'live'
  progress: number
  currentTimeMs: number
  durationMs: number
  speedMultiplier: number
  canPlay: boolean
  onTogglePlay: () => void
  onSeekProgress: (progress: number) => void
  onSpeedChange: (multiplier: number) => void
}

export function PlaybackBar({
  isPlaying,
  mode,
  progress,
  currentTimeMs,
  durationMs,
  speedMultiplier,
  canPlay,
  onTogglePlay,
  onSeekProgress,
  onSpeedChange
}: PlaybackBarProps) {
  const disabled = !canPlay || mode !== 'replay'

  const handleSliderChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const value = Number(event.target.value)
    if (Number.isFinite(value)) {
      onSeekProgress(value)
    }
  }

  const handleSpeedChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const value = Number(event.target.value)
    if (Number.isFinite(value)) {
      onSpeedChange(value)
    }
  }

  return (
    <section className="playback-bar" aria-label="Replay controls">
      <button type="button" className="primary-btn" onClick={onTogglePlay} disabled={disabled}>
        {isPlaying ? 'Pause' : 'Play'}
      </button>

      <input
        className="timeline-slider"
        type="range"
        min={0}
        max={1}
        step={0.0005}
        value={progress}
        onChange={handleSliderChange}
        disabled={disabled}
        aria-label="Timeline scrubber"
      />

      <div className="time-readout">
        <span>{formatDuration(currentTimeMs)}</span>
        <span>/</span>
        <span>{formatDuration(durationMs)}</span>
      </div>

      <label className="speed-select" htmlFor="speed-select">
        Speed
        <select id="speed-select" value={speedMultiplier} onChange={handleSpeedChange} disabled={mode !== 'replay'}>
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={1.5}>1.5x</option>
          <option value={2}>2x</option>
          <option value={4}>4x</option>
        </select>
      </label>
    </section>
  )
}
