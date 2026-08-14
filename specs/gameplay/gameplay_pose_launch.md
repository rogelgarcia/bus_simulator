# Gameplay pose launch

Gameplay poses make reproducible gameplay framing a first-class launch feature. Supplying a valid pose URL parameter skips the welcome and bus-selection screens, creates the requested bus, selects the requested city, and enters gameplay at that pose.

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
