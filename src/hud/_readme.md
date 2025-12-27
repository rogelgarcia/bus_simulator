# src/hud/

## Contents

### Current Implementation ✅
- `GameHUD.js` - Main HUD controller that manages all widgets and input
- `HUDStyles.js` - CSS styles for HUD elements
- `index.js` - Re-exports for convenient imports
- `input/` - Input handling and control systems
  - `RampedControl.js` - Smooth control ramping for keyboard input
- `sim/` - Simulation systems (⚠️ should be in physics/)
  - `DemoDrivetrainSim.js` - Engine RPM and gear simulation
- `widgets/` - Visual widget components
  - `SteeringWheelWidget.js` - Animated steering wheel
  - `GaugeWidget.js` - Circular gauges for speed and RPM
  - `PedalWidget.js` - Visual pedal indicators

### Proposed Refactoring 🚧 (See ../../AI_3_architecture_refactoring.md)
- Rename folder to `ui/` for clarity
- Move `DemoDrivetrainSim.js` to `../physics/systems/DrivetrainSystem.js`
- Create `InputManager.js` to centralize input handling
- Simplify `GameHUD.js` → `GameUI.js` (presentation only, no input logic)

## Overview

This folder contains the DOM-based HUD system for gameplay. It provides visual feedback for vehicle controls and telemetry.

### Current Components

**GameHUD.js** is the main controller that creates and manages all HUD widgets:
- Handles keyboard input for steering, throttle, and brake controls
- Ramped acceleration (slow start → faster over time)
- Updates all widgets each frame with current control values and telemetry data
- Supports two modes: 'demo' (visual-only with simulated telemetry) and 'bus' (connected to actual bus physics)
- **Issue**: Mixes presentation and input handling (should be separated)

**HUDStyles.js** provides CSS styling for all HUD elements:
- Positioning, colors, and animations
- Responsive layout for different screen sizes

**RampedControl.js** (in `input/`) implements smooth control ramping:
- Keyboard input smoothing
- Slow start → faster acceleration over time
- Prevents jerky control from discrete key presses

**DemoDrivetrainSim.js** (in `sim/`) simulates engine RPM and speed:
- RPM calculation from wheel speed
- Automatic gear shifting
- Clutch engagement
- Launch control
- **Issue**: Should be in `../physics/` folder, not here!

**SteeringWheelWidget.js** (in `widgets/`) displays animated steering wheel:
- 270° rotation range
- Ball indicator for steering angle
- Smooth animation

**GaugeWidget.js** (in `widgets/`) displays circular gauges:
- Speed gauge (0-120 kph)
- RPM gauge (0-3000 rpm)
- Animated needles
- Color-coded zones (green, yellow, red)

**PedalWidget.js** (in `widgets/`) displays visual pedal indicators:
- Throttle pedal position
- Brake pedal position
- Smooth animation

## Key Bindings

- Steering: ← / → (also A / D)
- Throttle: ↑ (also W)
- Brake: ↓ (also S)

## Architecture Issues

1. **Wrong Location**: `DemoDrivetrainSim.js` should be in `../physics/systems/`
2. **Mixed Responsibilities**: `GameHUD.js` handles both presentation and input
3. **Tight Coupling**: HUD directly reads keyboard, should use InputManager
4. **Naming**: "HUD" is game-specific, "UI" is more general

## Proposed Improvements

The refactoring (see `../../AI_3_architecture_refactoring.md`) will:
- Rename folder to `ui/`
- Move `DemoDrivetrainSim.js` to `../physics/systems/DrivetrainSystem.js`
- Create `InputManager.js` for centralized input handling
- Simplify `GameHUD.js` → `GameUI.js` (presentation only)
- Widgets remain unchanged (they're already well-designed)

## References

- Used by `../states/GameModeState.js` or `../states/GameplayState.js` for in-game HUD display
- Widgets are created as DOM elements and styled via `HUDStyles.js`
- Input handling uses `RampedControl.js` for smooth keyboard response
- `DemoDrivetrainSim.js` should be moved to `../physics/` (see architecture refactoring)
- See `../../AI_3_architecture_refactoring.md` for proposed changes

