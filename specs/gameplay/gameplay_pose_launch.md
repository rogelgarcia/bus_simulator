# Gameplay pose launch

Gameplay poses make reproducible gameplay framing a first-class launch feature. Supplying a valid pose URL parameter skips the welcome and bus-selection screens, creates the requested bus, selects the requested city, and enters gameplay at that pose.

## Gameplay loading

Selecting a bus with Enter, Space, a pointer, or the garage gameplay shortcut runs the garage camera-focus animation, then fades completely to black. Only after the fade completes does the muted **Loading…** label appear at the bottom right. The loading cover paints before synchronous city construction begins. Direct pose launches use the same loading cover without a garage animation.

The cover stays until the bus model, city world assets and environment lighting are ready and the engine reports an actual rendered gameplay frame. A frame held for shader preparation does not dismiss it. Keyboard and pointer gameplay input are blocked while covered. Leaving the transition cancels its callbacks; a construction or preparation failure keeps the cover and offers **Back to garage**.

Baked shadow/indirect downloads and validation do not gate this first view. Gameplay initially uses complete live lighting while those resources load, then applies compatible baked channels together at a frame boundary. Subsequent lighting-setting transactions retain their existing coherent-frame hold. Generated loading/live/baked screenshots belong under `tests/artifacts/screens/gameplay_loading/`.

## Copying the current view

Open gameplay with `debug=true` and choose **Copy camera position** in the Gameplay Debug header. This copies JSON containing the city, bus model, bus anchor world position and quaternion, and camera world position, quaternion and field of view. Paste the JSON into a bug report or pass it as the URL-encoded `gameplayPose` parameter. Captured poses launch paused with the camera locked so simulation and camera following do not move the view during inspection. This captures placement and orientation, not a full simulation/lighting-settings save; use the same viewport dimensions for identical framing.

Copied buses use `bus.transform: { position: { x, y, z }, quaternion: { x, y, z, w } }`. This exact world-space anchor transform takes precedence over legacy ground-contact `bus.position`/`yawDeg` and bypasses ground snapping, including after asynchronous model loading. Both transform fields are required. `camera.quaternion` takes precedence over looking at `camera.target`, preserving camera roll. Quaternions are normalized on import; nonfinite, incomplete and zero-length quaternions are rejected. Existing preset and ground-contact pose formats continue to work.

The debug panel has a **Minimize** button that docks its header at the bottom left and a matching **Restore** button that restores its previous size and position. Logs, tree expansion and telemetry scroll position survive minimizing. The separate **Close** button removes the overlay. Telemetry and tree/log panels scroll inside the resizable window; narrow windows stack the panels vertically. Header controls remain usable without starting a window drag.

## Named presets

Named poses live in `src/app/gameplay/GameplayPoseCatalog.js` and launch through the short `pose` query parameter:

```text
http://localhost:8000/?pose=civic_center_curve_front
```

The catalog id is stable and case-insensitive. The first catalog entry is `civic_center_curve_front`, a front view at the curved civic-center junction in `bigcity2`.

## Inline JSON

Ad-hoc poses use URL-encoded JSON in `gameplayPose`. If `pose` and `gameplayPose` are both present, inline fields override the catalog preset, including individual vector components.

```json
{
  "version": 1,
  "city": "bigcity2",
  "bus": {
    "modelId": "city",
    "position": { "x": -144, "z": 48 },
    "yawDeg": -45,
    "steeringWheelDeg": 0,
    "wheelSpinDeg": 0
  },
  "camera": {
    "position": { "x": -157, "y": 4.2, "z": 61 },
    "target": { "x": -144, "y": 2.72, "z": 48 },
    "fovDeg": 55,
    "locked": true
  },
  "simulation": { "paused": true },
  "hud": { "visible": true }
}
```

`bus.position.y`, when supplied, is the desired ground-contact height. `steeringWheelDeg` controls the steering pose and HUD wheel from -270° to 270°; `wheelRotationDeg` is accepted as its alias. `wheelSpinDeg` independently controls tire roll.

The camera may use explicit `position` and `target` vectors, as above, or orbit values relative to its target:

```json
{
  "camera": {
    "target": { "x": -144, "y": 2.72, "z": 48 },
    "yawDeg": 180,
    "pitchDeg": 7,
    "distance": 23,
    "fovDeg": 55,
    "locked": true
  }
}
```

With orbit values, yaw 0° places the camera toward positive Z and yaw 180° toward negative Z. A locked camera remains fixed while gameplay updates; `simulation.paused` is recommended for deterministic captures.
