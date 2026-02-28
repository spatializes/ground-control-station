# Ground Control Station

## Stack

- Electron + Vite + React + TypeScript
- MobX state management
- Cesium for 3D scene and aircraft rendering
- `serialport` + `node-mavlink` for live MAVLink telemetry

## Highlights

- CSV replay with play/pause, scrub, and speed controls
- Synced 3D aircraft view + telemetry HUD
- Camera lock/unlock modes
- Altitude profile panel
- Wind direction/speed visualization near aircraft
- Light/Dark tactical theme switcher
- Minimal live telemetry links:
  - Serial MAVLink (Pixhawk/915MHz telemetry)
  - Raw MAVLink over WebSocket

## How to Build

```bash
npm install
npm run build
```

Package distributables:

```bash
npm run dist
```

## How to Run

```bash
npm install
npm run dev
```

## How to Test

```bash
npm run typecheck
npm run test
npm run test:smoke
```
