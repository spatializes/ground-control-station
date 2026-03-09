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

## Known Working Serial Setup (macOS, Telemetry Radio)

This setup is confirmed working on the team macOS dev machine for live telemetry via radio:

- Hardware connected:
  - Pixhawk connected to Mac over USB (`/dev/cu.usbmodem2101`) for direct FC access.
  - USB telemetry radio connected to Mac (`/dev/cu.usbserial-0001`).
  - Drone battery plugged in (required so the air telemetry radio is powered).
- Ground Control Station Serial panel settings:
  - Port: `/dev/cu.usbserial-0001`
  - Baud: `57600`
  - Source: `Serial`

Notes:

- For telemetry radio, use `/dev/cu.*` callout ports on macOS (not `/dev/tty.*`).
- You can be serial-connected but still have no GPS fix; this is expected indoors or before GPS lock.
