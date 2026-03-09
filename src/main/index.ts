import { app, BrowserWindow, ipcMain } from 'electron'
import type { WebContents } from 'electron'
import path from 'node:path'
import {
  TELEMETRY_CONNECT_SERIAL,
  TELEMETRY_CONNECT_WS,
  TELEMETRY_DISCONNECT,
  TELEMETRY_FRAME_EVENT,
  TELEMETRY_LIST_PORTS,
  TELEMETRY_STATUS_EVENT
} from '@shared/ipc'
import type { ConnectionStatus, TelemetryFrame } from '@shared/types'
import { createTelemetryIpcHandlers } from './ipc/telemetryHandlers'
import { LiveTelemetryService } from './telemetry/LiveTelemetryService'

const liveTelemetryService = new LiveTelemetryService()
let mainWindow: BrowserWindow | null = null
let telemetryReceiver: WebContents | null = null
let telemetryFrameBroadcastCount = 0

function logTelemetryIpc(message: string, details?: unknown): void {
  if (details === undefined) {
    console.info(`[telemetry-ipc] ${message}`)
    return
  }

  console.info(`[telemetry-ipc] ${message}`, details)
}

function setTelemetryReceiver(contents: WebContents, reason: string): void {
  telemetryReceiver = contents
  logTelemetryIpc(`Telemetry receiver set from ${reason}`, {
    receiverId: contents.id,
    mainWindowId: mainWindow?.webContents.id ?? null
  })
}

function collectTelemetryReceivers(): WebContents[] {
  const receivers: WebContents[] = []
  const primaryWindowContents = mainWindow?.webContents ?? null

  if (primaryWindowContents && !primaryWindowContents.isDestroyed()) {
    receivers.push(primaryWindowContents)
  }

  if (telemetryReceiver && !telemetryReceiver.isDestroyed()) {
    const alreadyPresent = receivers.some((candidate) => candidate.id === telemetryReceiver?.id)
    if (!alreadyPresent) {
      receivers.push(telemetryReceiver)
    }
  }

  return receivers
}

function sendTelemetryStatus(statusOverride?: ConnectionStatus): void {
  const status = statusOverride ?? liveTelemetryService.getConnectionStatus()
  const receivers = collectTelemetryReceivers()

  if (receivers.length === 0) {
    logTelemetryIpc('No live receiver available for telemetry status', status)
    return
  }

  for (const receiver of receivers) {
    receiver.send(TELEMETRY_STATUS_EVENT, status)
  }
}

function sendTelemetryFrame(frameOverride?: TelemetryFrame | null): void {
  const frame = frameOverride ?? liveTelemetryService.getLatestFrame()
  if (!frame) {
    return
  }

  const receivers = collectTelemetryReceivers()
  if (receivers.length === 0) {
    logTelemetryIpc('No live receiver available for telemetry frame', {
      latitudeDeg: frame.latitudeDeg,
      longitudeDeg: frame.longitudeDeg,
      hasPositionFix: frame.hasPositionFix
    })
    return
  }

  if (telemetryFrameBroadcastCount < 6) {
    telemetryFrameBroadcastCount += 1
    logTelemetryIpc('Broadcasting telemetry frame', {
      broadcastCount: telemetryFrameBroadcastCount,
      receiverIds: receivers.map((receiver) => receiver.id),
      hasPositionFix: frame.hasPositionFix,
      latitudeDeg: frame.latitudeDeg,
      longitudeDeg: frame.longitudeDeg,
      altitudeM: frame.altitudeM
    })
  }

  for (const receiver of receivers) {
    receiver.send(TELEMETRY_FRAME_EVENT, frame)
  }
}

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

  mainWindow.webContents.on('console-message', (_event, _level, message) => {
    if (message.includes('[live-ui]')) {
      console.info(`[renderer-console] ${message}`)
    }
  })

  mainWindow.on('closed', () => {
    if (telemetryReceiver && (telemetryReceiver.isDestroyed() || telemetryReceiver.id === mainWindow?.webContents.id)) {
      telemetryReceiver = null
    }
    mainWindow = null
  })
}

function bindIpc(): void {
  const handlers = createTelemetryIpcHandlers({
    service: liveTelemetryService,
    setTelemetryReceiver,
    sendTelemetryStatus,
    sendTelemetryFrame,
    logTelemetryIpc
  })

  ipcMain.handle(TELEMETRY_LIST_PORTS, handlers.listPorts)
  ipcMain.handle(TELEMETRY_CONNECT_SERIAL, handlers.connectSerial)
  ipcMain.handle(TELEMETRY_CONNECT_WS, handlers.connectWebSocket)
  ipcMain.handle(TELEMETRY_DISCONNECT, handlers.disconnect)

  liveTelemetryService.on('frame', (frame: TelemetryFrame) => {
    sendTelemetryFrame(frame)
  })

  liveTelemetryService.on('status', (status) => {
    sendTelemetryStatus(status)
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
