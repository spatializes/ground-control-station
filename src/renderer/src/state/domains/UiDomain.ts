import { makeAutoObservable } from 'mobx'
import type { DataSourceKind, ThemeMode } from '@shared/types'

export class UiDomain {
  activeSource: DataSourceKind = 'csv'
  selectedSource: DataSourceKind = 'csv'
  cameraLocked = true
  theme: ThemeMode = 'light'
  isConnectionPanelOpen = false
  isAltitudeProfileCollapsed = false
  windPanelOpen = false

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true })
  }

  setSelectedSource(source: DataSourceKind): void {
    this.selectedSource = source
  }

  setActiveSource(source: DataSourceKind): void {
    this.activeSource = source
  }

  setTheme(theme: ThemeMode): void {
    this.theme = theme
  }

  setCameraLocked(isLocked: boolean): void {
    this.cameraLocked = isLocked
  }

  setConnectionPanelOpen(isOpen: boolean): void {
    this.isConnectionPanelOpen = isOpen
  }

  setWindPanelOpen(isOpen: boolean): void {
    this.windPanelOpen = isOpen
  }

  setAltitudeProfileCollapsed(isCollapsed: boolean): void {
    this.isAltitudeProfileCollapsed = isCollapsed
  }
}
