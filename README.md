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

## Commands

```bash
npm install
npm run dev
npm run typecheck
npm run test
npm run build
npm run dist
```

## Primary Validation Target

The smoke test validates the assignment workflow:

1. Load provided CSV telemetry.
2. Press Play.
3. 3D aircraft + telemetry update over time.
4. Press Pause to halt updates.
5. Scrub timeline and verify deterministic UI updates.

Run it directly:

```bash
npm run test:smoke
```
