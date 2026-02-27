import type { ThemeMode } from '@shared/types'

interface ThemeToggleProps {
  theme: ThemeMode
  onThemeChange: (theme: ThemeMode) => void
}

export function ThemeToggle({ theme, onThemeChange }: ThemeToggleProps) {
  return (
    <div className="segmented-toggle" role="tablist" aria-label="Theme mode">
      <button type="button" className={theme === 'light' ? 'active' : ''} onClick={() => onThemeChange('light')}>
        Light
      </button>
      <button type="button" className={theme === 'dark' ? 'active' : ''} onClick={() => onThemeChange('dark')}>
        Dark
      </button>
    </div>
  )
}
