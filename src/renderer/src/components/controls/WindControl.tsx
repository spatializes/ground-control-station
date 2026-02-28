import { useEffect, useRef } from 'react'
import type { WindFetchState, WindMode } from '@shared/types'

interface WindControlProps {
  label: string
  modeBadge: 'SYN' | 'LIVE'
  enabled: boolean
  mode: WindMode
  fetchState: WindFetchState
  statusText: string
  isOpen: boolean
  onTogglePanel: () => void
  onClosePanel: () => void
  onEnabledChange: (enabled: boolean) => void
  onModeChange: (mode: WindMode) => void
}

export function WindControl({
  label,
  modeBadge,
  enabled,
  mode,
  fetchState,
  statusText,
  isOpen,
  onTogglePanel,
  onClosePanel,
  onEnabledChange,
  onModeChange
}: WindControlProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent): void => {
      if (!rootRef.current || rootRef.current.contains(event.target as Node)) {
        return
      }

      onClosePanel()
    }

    window.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [isOpen, onClosePanel])

  return (
    <div ref={rootRef} className={`wind-control ${isOpen ? 'open' : ''}`}>
      <button
        type="button"
        className={`ghost-btn wind-control-trigger ${enabled ? 'is-enabled' : 'is-disabled'}`}
        onClick={onTogglePanel}
        aria-expanded={isOpen}
        aria-label="Wind controls"
      >
        <span className="wind-control-icon" aria-hidden="true">
          W
        </span>
        <span className="wind-control-label">{label}</span>
        <span className="status-pill wind-mode-badge">{modeBadge}</span>
      </button>

      {isOpen ? (
        <section className="wind-popover" aria-label="Wind overlay controls">
          <div className="wind-popover-row">
            <span>Wind Overlay</span>
            <button
              type="button"
              className={`ghost-btn wind-toggle-btn ${enabled ? 'active' : ''}`}
              onClick={() => onEnabledChange(!enabled)}
            >
              {enabled ? 'On' : 'Off'}
            </button>
          </div>

          <div className="segmented-toggle wind-mode-toggle" role="tablist" aria-label="Wind mode">
            <button type="button" className={mode === 'synthetic' ? 'active' : ''} onClick={() => onModeChange('synthetic')}>
              Synthetic
            </button>
            <button type="button" className={mode === 'live' ? 'active' : ''} onClick={() => onModeChange('live')}>
              Live
            </button>
          </div>

          <p className={`wind-status wind-status-${fetchState}`}>{statusText}</p>
        </section>
      ) : null}
    </div>
  )
}
