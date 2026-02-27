import type { TelemetryMode } from '@shared/types'

interface ModeToggleProps {
  mode: TelemetryMode
  onModeChange: (mode: TelemetryMode) => void
}

export function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
  return (
    <div className="segmented-toggle" role="tablist" aria-label="Telemetry mode">
      <button type="button" className={mode === 'replay' ? 'active' : ''} onClick={() => onModeChange('replay')}>
        Replay
      </button>
      <button type="button" className={mode === 'live' ? 'active' : ''} onClick={() => onModeChange('live')}>
        Live
      </button>
    </div>
  )
}
