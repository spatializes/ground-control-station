import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import {
  TELEMETRY_CONNECT_SERIAL,
  TELEMETRY_CONNECT_WS,
  TELEMETRY_DISCONNECT,
  TELEMETRY_FRAME_EVENT,
  TELEMETRY_LIST_PORTS,
  TELEMETRY_STATUS_EVENT
} from '@shared/ipc'
import type {
  SerialConnectOptions,
  TelemetryFrame,
  WebSocketConnectOptions
} from '@shared/types'
import { LiveTelemetryService } from './telemetry/LiveTelemetryService'

const liveTelemetryService = new LiveTelemetryService()
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1660,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#eff3fb',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL

  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function bindIpc(): void {
  ipcMain.handle(TELEMETRY_LIST_PORTS, async () => liveTelemetryService.listSerialPorts())

  ipcMain.handle(TELEMETRY_CONNECT_SERIAL, async (_event, options: SerialConnectOptions) => {
    await liveTelemetryService.connectSerial(options)
  })

  ipcMain.handle(TELEMETRY_CONNECT_WS, async (_event, options: WebSocketConnectOptions) => {
    await liveTelemetryService.connectWebSocket(options)
  })

  ipcMain.handle(TELEMETRY_DISCONNECT, async () => {
    await liveTelemetryService.disconnect()
  })

  liveTelemetryService.on('frame', (frame: TelemetryFrame) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }

    mainWindow.webContents.send(TELEMETRY_FRAME_EVENT, frame)
  })

  liveTelemetryService.on('status', (status) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }

    mainWindow.webContents.send(TELEMETRY_STATUS_EVENT, status)
  })
}

app.whenReady().then(() => {
  bindIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  void liveTelemetryService.disconnect()
})
