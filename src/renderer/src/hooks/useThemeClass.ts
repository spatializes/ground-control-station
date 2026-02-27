import { useEffect } from 'react'
import type { ThemeMode } from '@shared/types'

export function useThemeClass(theme: ThemeMode): void {
  useEffect(() => {
    document.body.classList.remove('theme-light', 'theme-dark')
    document.body.classList.add(`theme-${theme}`)
  }, [theme])
}
