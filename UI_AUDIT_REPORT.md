# UI Audit Report

Generated: 2026-01-20  
Scope: UI audit + framework plan (Vanilla JS DOM + CSS, no build step)

## Executive Summary

- UI entry points are split between static markup in `index.html` (welcome/setup/select layers) and dynamic DOM construction across `src/states/**` and `src/graphics/gui/**`.
- Styling is loaded globally (all CSS is linked in `index.html`), with `src/graphics/gui/shared/styles.css` acting as a base layer and per-screen CSS files layering on top.
- The UI codebase has three systemic issues:
  1) **Repetition**: the same control patterns (toggle rows, range+number rows, select rows, icon buttons) are re-implemented per screen.
  2) **Mixed responsibilities**: large “UI” files contain significant non-UI logic (simulation, geometry/math, content catalogs, asset/texture generation).
  3) **Inconsistent structure**: some screens have a dedicated `src/graphics/gui/<screen>/...` UI module, others build DOM directly inside `src/states/<State>.js` (notably `BusSelectState.js`, `TestModeState.js`).

## CSS Inventory (and how it is referenced)

All UI CSS files are referenced via `<link rel="stylesheet" ...>` in `index.html` (no dynamic loading). Order is currently:

- `src/graphics/gui/shared/styles.css` (global base: `.ui-layer`, `.ui-panel`, icons, picker overlay, fade overlay)
- `src/graphics/gui/welcome/styles.css`
- `src/graphics/gui/setup/styles.css`
- `src/graphics/gui/bus_select/styles.css`
- `src/graphics/gui/map_debugger/styles.css`
- `src/graphics/gui/connector_debugger/styles.css`
- `src/graphics/gui/road_debugger/styles.css`
- `src/graphics/gui/gameplay/hud.css`
- `src/graphics/gui/gameplay/debug_panel.css`
- `src/graphics/gui/rapier_debugger/styles.css`
- `src/graphics/gui/test_mode/styles.css`
- `src/graphics/gui/building_fabrication/styles.css`
- `src/graphics/gui/inspector_room/styles.css`
- `src/graphics/gui/options/styles.css`

Notes:
- Project rule (“one CSS per screen + global”) is mostly followed, with gameplay using two CSS files (`hud.css` + `debug_panel.css`) that still remain screen-scoped by class prefixes.
- Many per-screen CSS files repeat panel/background primitives rather than leaning on `.ui-panel` + variables (opportunity for CSS variables + shared utility classes).

## UI File Inventory (UI + UI-adjacent)

Legend:
- **Theme**: Shared | Unique | Partially shared | Hardcoded
- **Org**: OK | Mixed | Off-scope in `gui/` (non-UI lives in UI folder)

### Root / Boot

- `index.html` — Theme: Partially shared | Repetition: static UI-layer markup + many ID hooks | Non-UI to extract: n/a | Org: OK
- `src/main.js` — Theme: Shared | Repetition: state registration boilerplate | Non-UI to extract: n/a | Org: OK

### State-Level UI (UI outside `src/graphics/gui/**`)

- `src/states/WelcomeState.js` — Theme: Partially shared | Repetition: state toggles `.hidden` on base layers | Non-UI to extract: test error polling (could move to a small widget) | Org: Mixed (UI behavior in state instead of `gui/welcome/`)
- `src/states/SetupState.js` — Theme: Partially shared | Repetition: manual menu row construction + selection highlight logic | Non-UI to extract: layout math (could be in a `SetupMenuUI` controller) | Org: Mixed (UI built in state; CSS lives in `gui/setup/`)
- `src/states/BusSelectState.js` — Theme: Hardcoded | Repetition: mixed DOM hooks + bespoke UI nav construction | Non-UI to extract: most of file is 3D showroom + asset/texture generation; move to `src/graphics/engine3d/` and keep DOM in `src/graphics/gui/bus_select/` | Org: Mixed (bus_select has CSS but no UI module)
- `src/states/MapDebuggerState.js` — Theme: Hardcoded | Repetition: tool logic + UI + rendering in one file (~3190 LOC) | Non-UI to extract: city generation, road geometry, rendering overlays, input handling; UI should only coordinate panels | Org: Mixed (UI panels exist in `gui/map_debugger/`, but state is a monolith)
- `src/states/GameplayState.js` — Theme: Partially shared | Repetition: show/hide multiple UI roots | Non-UI to extract: minimal; primary issue is coordination responsibilities ballooning over time | Org: OK-ish (delegates most DOM to `gui/gameplay/`)
- `src/states/ConnectorDebuggerState.js` — Theme: Partially shared | Repetition: show/hide + wiring inputs | Non-UI to extract: keep tool logic separate from DOM layer | Org: OK-ish (uses `gui/connector_debugger/` modules)
- `src/states/RoadDebuggerState.js` — Theme: Partially shared | Repetition: show/hide + wiring inputs | Non-UI to extract: keep tool logic separate from DOM layer | Org: OK-ish (uses `gui/road_debugger/` modules)
- `src/states/rapier_debugger/RapierDebuggerState.js` — Theme: Partially shared | Repetition: show/hide + wiring inputs | Non-UI to extract: keep tool logic separate from DOM layer | Org: OK-ish (uses `gui/rapier_debugger/` modules)
- `src/states/BuildingFabricationState.js` — Theme: Partially shared | Repetition: show/hide + wiring UI/scene/view | Non-UI to extract: ensure catalogs/generator logic are not owned by UI files | Org: OK-ish (uses `gui/building_fabrication/` modules)
- `src/states/InspectorRoomState.js` — Theme: Partially shared | Repetition: show/hide + wiring UI/scene/view | Non-UI to extract: “provider” logic should not live under `gui/` | Org: Mixed (inspector has non-UI modules under `gui/inspector_room/`)
- `src/states/OptionsState.js` — Theme: Shared | Repetition: minimal | Non-UI to extract: none | Org: OK (state wraps `OptionsUI`)
- `src/states/TestModeState.js` — Theme: Hardcoded | Repetition: manual panel creation + bespoke widgets | Non-UI to extract: most of file is 3D + vehicle sim + content; split UI into `gui/test_mode/` and move 3D/sim to `app/` + `graphics/` | Org: Mixed (test_mode has CSS but no UI module)
- `src/states/SceneShortcutRegistry.js` — Theme: Shared-adjacent | Repetition: n/a | Non-UI to extract: n/a | Org: OK (not UI, but UI reads it)

### `src/graphics/gui/shared/**` (Reusable UI primitives)

- `src/graphics/gui/shared/styles.css` — Theme: Shared | Repetition: n/a | Non-UI to extract: n/a | Org: OK
- `src/graphics/gui/shared/materialSymbols.js` — Theme: Shared | Repetition: centralizes icon rendering | Non-UI to extract: n/a | Org: OK
- `src/graphics/gui/shared/PickerPopup.js` — Theme: Shared | Repetition: reusable picker popup + lifecycle cleanup (`dispose`) | Non-UI to extract: n/a | Org: OK
- `src/graphics/gui/shared/utils/screenFade.js` — Theme: Shared | Repetition: reusable fade overlay | Non-UI to extract: n/a | Org: OK

### Screen: `welcome` (CSS only; logic is in state + HTML)

- `src/graphics/gui/welcome/styles.css` — Theme: Unique | Repetition: screen-specific styles | Non-UI to extract: n/a | Org: Mixed (screen lacks a `WelcomeUI` module; DOM is static in `index.html`)

### Screen: `setup` (CSS only; logic is in state + HTML)

- `src/graphics/gui/setup/styles.css` — Theme: Unique | Repetition: screen-specific styles | Non-UI to extract: n/a | Org: Mixed (screen lacks a `SetupUI` module; DOM is partly static in `index.html`)

### Screen: `bus_select` (CSS only; DOM logic is in `BusSelectState.js`)

- `src/graphics/gui/bus_select/styles.css` — Theme: Unique | Repetition: screen-specific styles | Non-UI to extract: n/a | Org: Mixed (UI logic is in `src/states/BusSelectState.js`)

### Screen: `map_debugger`

- `src/graphics/gui/map_debugger/styles.css` — Theme: Partially shared | Repetition: repeats panel primitives in places | Non-UI to extract: n/a | Org: OK
- `src/graphics/gui/map_debugger/MapDebuggerControlsPanel.js` — Theme: Hardcoded | Repetition: repeated toggle row DOM blocks | Non-UI to extract: minimal (mostly UI), but should use shared ToggleRow widget | Org: OK
- `src/graphics/gui/map_debugger/MapDebuggerEditorPanel.js` — Theme: Hardcoded | Repetition: many row patterns, custom icon buttons | Non-UI to extract: config normalization/helpers; icons currently use inline SVG (should standardize to Material Symbols) | Org: OK
- `src/graphics/gui/map_debugger/MapDebuggerInfoPanel.js` — Theme: Partially shared | Repetition: status rows/readouts repeated | Non-UI to extract: formatting/summarization helpers should be in a formatter module | Org: OK
- `src/graphics/gui/map_debugger/MapDebuggerShortcutsPanel.js` — Theme: Partially shared | Repetition: shortcut list row patterns | Non-UI to extract: n/a | Org: OK

### Screen: `connector_debugger`

- `src/graphics/gui/connector_debugger/styles.css` — Theme: Partially shared | Repetition: repeats panel primitives | Non-UI to extract: n/a | Org: OK
- `src/graphics/gui/connector_debugger/ConnectorDebuggerUI.js` — Theme: Partially shared | Repetition: manual row creation, direct listeners | Non-UI to extract: keep domain formatting out of UI | Org: OK
- `src/graphics/gui/connector_debugger/ConnectorDebugPanel.js` — Theme: Hardcoded | Repetition: toggle/number rows + table cell construction | Non-UI to extract: domain formatting (`fmtSegment`, `radToDeg`, etc.) | Org: OK
- `src/graphics/gui/connector_debugger/ConnectorShortcutsPanel.js` — Theme: Partially shared | Repetition: shortcut rows | Non-UI to extract: n/a | Org: OK
- `src/graphics/gui/connector_debugger/ConnectorDebuggerInput.js` — Theme: Unique | Repetition: input wiring likely duplicated across tools | Non-UI to extract: n/a | Org: OK (but could be a shared “tool input binder” pattern)
- `src/graphics/gui/connector_debugger/ConnectorDebuggerScene.js` — Theme: Unique | Repetition: n/a | Non-UI to extract: 3D/debug scene logic (not GUI) | Org: Off-scope in `gui/` (belongs in `graphics/engine3d` or a “tools” folder)
- `src/graphics/gui/connector_debugger/ConnectorDebuggerView.js` — Theme: Unique | Repetition: n/a | Non-UI to extract: 3D/debug view/model logic (not GUI) | Org: Off-scope in `gui/`
- `src/graphics/gui/connector_debugger/ConnectorCameraTour.js` — Theme: Unique | Repetition: n/a | Non-UI to extract: camera tour logic (tool/scene) | Org: Off-scope in `gui/`

### Screen: `road_debugger`

- `src/graphics/gui/road_debugger/styles.css` — Theme: Partially shared | Repetition: repeats panel primitives | Non-UI to extract: n/a | Org: OK
- `src/graphics/gui/road_debugger/RoadDebuggerUI.js` — Theme: Hardcoded | Repetition: local row factories (`makeToggleRow`, range+number patterns) duplicated across other screens | Non-UI to extract: derived/junction summarization + formatting should be moved out; fallback inline layout (`applyFallbackLayoutIfNeeded`) suggests CSS lifecycle issues | Org: OK
- `src/graphics/gui/road_debugger/RoadDebuggerInput.js` — Theme: Unique | Repetition: tool input wiring pattern | Non-UI to extract: n/a | Org: OK-ish (could be in shared tool input helpers)
- `src/graphics/gui/road_debugger/RoadDebuggerPicking.js` — Theme: Unique | Repetition: n/a | Non-UI to extract: picking math + intersection logic (tool logic, not GUI) | Org: Off-scope in `gui/`
- `src/graphics/gui/road_debugger/RoadDebuggerScene.js` — Theme: Unique | Repetition: n/a | Non-UI to extract: scene setup (tool logic, not GUI) | Org: Off-scope in `gui/`
- `src/graphics/gui/road_debugger/RoadDebuggerView.js` — Theme: Unique | Repetition: n/a | Non-UI to extract: large chunk is road tool/view/model logic (~3872 LOC) | Org: Off-scope in `gui/`

### Screen: `rapier_debugger`

- `src/graphics/gui/rapier_debugger/styles.css` — Theme: Partially shared | Repetition: repeats panel primitives | Non-UI to extract: n/a | Org: OK
- `src/graphics/gui/rapier_debugger/RapierDebuggerUI.js` — Theme: Hardcoded | Repetition: extensive repeated row construction + embedded help text constants (~5387 LOC) | Non-UI to extract: (1) help/field metadata can become descriptors, (2) formatting/padding utilities can be shared | Org: OK
- `src/graphics/gui/rapier_debugger/RapierDebuggerScene.js` — Theme: Unique | Repetition: n/a | Non-UI to extract: scene/physics wiring (not GUI) | Org: Off-scope in `gui/`
- `src/graphics/gui/rapier_debugger/RapierDebuggerView.js` — Theme: Unique | Repetition: n/a | Non-UI to extract: tool/view logic (not GUI) | Org: Off-scope in `gui/`

### Screen: `gameplay`

- `src/graphics/gui/gameplay/hud.css` — Theme: Unique | Repetition: widget styling | Non-UI to extract: n/a | Org: OK
- `src/graphics/gui/gameplay/debug_panel.css` — Theme: Unique | Repetition: debug panel styling | Non-UI to extract: n/a | Org: OK
- `src/graphics/gui/gameplay/GameHUD.js` — Theme: Hardcoded | Repetition: bespoke widget composition per HUD | Non-UI to extract: input ramping + demo drivetrain simulation live inside UI (should be in `src/app/**`) | Org: Mixed (UI file owns sim)
- `src/graphics/gui/gameplay/GameplayDebugPanel.js` — Theme: Hardcoded | Repetition: many custom controls and readouts | Non-UI to extract: any simulation/debug formatting logic should be separated | Org: OK-ish
- `src/graphics/gui/gameplay/GameplayCameraTour.js` — Theme: Unique | Repetition: n/a | Non-UI to extract: camera tour logic (tool/state) | Org: Off-scope in `gui/` (arguably belongs in engine3d/state tool helpers)
- `src/graphics/gui/gameplay/widgets/GaugeWidget.js` — Theme: Unique | Repetition: widget-level DOM patterns | Non-UI to extract: n/a | Org: OK
- `src/graphics/gui/gameplay/widgets/PedalWidget.js` — Theme: Unique | Repetition: widget-level DOM patterns | Non-UI to extract: n/a | Org: OK
- `src/graphics/gui/gameplay/widgets/SteeringWheelWidget.js` — Theme: Unique | Repetition: widget-level DOM patterns | Non-UI to extract: n/a | Org: OK

### Screen: `test_mode` (CSS only; DOM logic is in `TestModeState.js`)

- `src/graphics/gui/test_mode/styles.css` — Theme: Partially shared | Repetition: panel primitives similar to shared styles | Non-UI to extract: n/a | Org: Mixed (UI logic is in `src/states/TestModeState.js`)

### Screen: `building_fabrication`

- `src/graphics/gui/building_fabrication/styles.css` — Theme: Partially shared | Repetition: repeats panel primitives | Non-UI to extract: n/a | Org: OK
- `src/graphics/gui/building_fabrication/BuildingFabricationUI.js` — Theme: Hardcoded | Repetition: multiple bespoke row builders + inline SVG icon(s) | Non-UI to extract: catalog building, generator param normalization, preview/canvas generation, business rules; should live under `src/app/**` + `src/graphics/content3d/**` + `src/graphics/assets3d/**` | Org: Mixed (UI owns a lot of non-UI)
- `src/graphics/gui/building_fabrication/MaterialVariationUIController.js` — Theme: Hardcoded | Repetition: highly repetitive control sets (~10066 LOC) | Non-UI to extract: “field metadata” + presets + normalization should be separated; strong candidate for descriptor-driven UI | Org: Mixed (UI/controller file is a monolith)
- `src/graphics/gui/building_fabrication/WindowUIController.js` — Theme: Hardcoded | Repetition: many parameter rows (~1483 LOC) | Non-UI to extract: compatibility/normalization rules should live in generator/schema modules, not UI | Org: OK-ish
- `src/graphics/gui/building_fabrication/WallsUIController.js` — Theme: Partially shared | Repetition: details sections + row patterns | Non-UI to extract: wall business rules should live in fabrication types layer | Org: OK-ish
- `src/graphics/gui/building_fabrication/BuildingFabricationScene.js` — Theme: Unique | Repetition: n/a | Non-UI to extract: 3D scene/tool logic (~2821 LOC) | Org: Off-scope in `gui/`
- `src/graphics/gui/building_fabrication/BuildingFabricationView.js` — Theme: Unique | Repetition: n/a | Non-UI to extract: 3D view/tool logic | Org: Off-scope in `gui/`

#### `building_fabrication/mini_controllers/**` (Good precedent for reusable widgets)

- `src/graphics/gui/building_fabrication/mini_controllers/UiMiniControlPrimitives.js` — Theme: Shared (within screen) | Repetition: consolidates tooltip/details/row primitives | Non-UI to extract: n/a | Org: OK (but good candidate to promote to `gui/shared/widgets/`)
- `src/graphics/gui/building_fabrication/mini_controllers/RangeNumberUtils.js` — Theme: Shared (within screen) | Repetition: clamp/format helpers | Non-UI to extract: could be shared formatting helpers | Org: OK
- `src/graphics/gui/building_fabrication/mini_controllers/RangeNumberRowController.js` — Theme: Shared (within screen) | Repetition: codifies range+number control | Non-UI to extract: n/a | Org: OK (promote to shared widget)
- `src/graphics/gui/building_fabrication/mini_controllers/ToggleRowController.js` — Theme: Shared (within screen) | Repetition: codifies toggle row | Non-UI to extract: n/a | Org: OK (promote to shared widget)
- `src/graphics/gui/building_fabrication/mini_controllers/MaterialPickerRowController.js` — Theme: Shared (within screen) | Repetition: codifies picker row | Non-UI to extract: n/a | Org: OK (promote to shared widget)
- `src/graphics/gui/building_fabrication/mini_controllers/TextureTilingMiniController.js` — Theme: Shared (within screen) | Repetition: composes range controls | Non-UI to extract: n/a | Org: OK
- `src/graphics/gui/building_fabrication/mini_controllers/MaterialVariationAntiTilingMiniController.js` — Theme: Shared (within screen) | Repetition: composes range/toggle controls | Non-UI to extract: n/a | Org: OK

### Screen: `inspector_room`

- `src/graphics/gui/inspector_room/styles.css` — Theme: Partially shared | Repetition: repeats panel primitives | Non-UI to extract: n/a | Org: OK
- `src/graphics/gui/inspector_room/InspectorRoomUI.js` — Theme: Partially shared | Repetition: local `makeRow` + repeated select/toggle/range patterns | Non-UI to extract: formatting helpers + stateful lighting math could be separated | Org: OK-ish
- `src/graphics/gui/inspector_room/InspectorRoomView.js` — Theme: Unique | Repetition: n/a | Non-UI to extract: 3D view logic (not GUI) | Org: Off-scope in `gui/`
- `src/graphics/gui/inspector_room/InspectorRoomScene.js` — Theme: Unique | Repetition: n/a | Non-UI to extract: 3D scene logic (not GUI) | Org: Off-scope in `gui/`
- `src/graphics/gui/inspector_room/InspectorRoomMeshesProvider.js` — Theme: Unique | Repetition: n/a | Non-UI to extract: content loading + Three.js asset creation (should live in `src/graphics/engine3d/**` or `src/graphics/content3d/**`, not UI) | Org: Off-scope in `gui/`
- `src/graphics/gui/inspector_room/InspectorRoomTexturesProvider.js` — Theme: Unique | Repetition: n/a | Non-UI to extract: texture catalog/content provider (not GUI) | Org: Off-scope in `gui/`
- `src/graphics/gui/inspector_room/InspectorRoomMeasurementUtils.js` — Theme: Unique | Repetition: n/a | Non-UI to extract: measurement/math helpers (not GUI) | Org: Off-scope in `gui/`
- `src/graphics/gui/inspector_room/InspectorRoomTreeMaterialUtils.js` — Theme: Unique | Repetition: n/a | Non-UI to extract: material tagging logic (not GUI) | Org: Off-scope in `gui/`
- `src/graphics/gui/inspector_room/InspectorRoomLightUtils.js` — Theme: Unique | Repetition: n/a | Non-UI to extract: lighting math/encoding utilities (not GUI) | Org: Off-scope in `gui/` (move under `src/graphics/lighting/` or `src/app/utils/`)

### Screen: `options`

- `src/graphics/gui/options/styles.css` — Theme: Partially shared | Repetition: repeats panel primitives | Non-UI to extract: n/a | Org: OK
- `src/graphics/gui/options/OptionsUI.js` — Theme: Partially shared | Repetition: contains in-file row factories (`makeToggleRow`, `makeNumberSliderRow`) that duplicate patterns elsewhere | Non-UI to extract: none major | Org: OK

## Non-UI DOM Usage (outside UI folders)

Some non-UI modules use `document.createElement('canvas')` for texture generation / offscreen rendering. These are **not** UI and should not be counted as UI widgets, but they show up in DOM scans:

- `src/graphics/assets3d/generators/buildings/BuildingGenerator.js` (canvas for generation/debug)
- `src/graphics/engine3d/buildings/WindowTextureGenerator.js` (canvas textures)
- `src/graphics/assets3d/models/environment/ProceduralTextures.js` (procedural canvases)
- `src/graphics/assets3d/textures/CityTextures.js` (texture generation)
- `src/graphics/assets3d/textures/signs/SignAlphaMaskCache.js` (alpha mask caching)
- `src/graphics/content3d/catalogs/PbrMaterialCatalog.js` (preview generation)
- `src/graphics/visuals/shared/PoleMarkerGroup.js` (radial texture canvas for markers)

Recommendation: treat these as “rendering/content” utilities (not UI) and keep them out of any UI widget framework discussion.

## Worst Offenders (Non-UI mixed into UI / UI-adjacent files)

Largest files and why they matter:

1) `src/graphics/gui/building_fabrication/MaterialVariationUIController.js` (~10066 LOC)
   - Problem: giant, repetitive control construction; imports preset/default/normalization logic; hard to theme and maintain.
   - Likely extraction: convert to a descriptor list + generic “descriptor → widget” renderer.
   - Rough reduction potential: 4k–7k LOC via descriptors + shared widgets.

2) `src/graphics/gui/rapier_debugger/RapierDebuggerUI.js` (~5387 LOC)
   - Problem: repeats row creation patterns; embeds extensive help/field text that behaves like metadata.
   - Likely extraction: move field definitions + help strings into a schema; use shared widgets to render.
   - Rough reduction potential: 2k–3k LOC.

3) `src/graphics/gui/road_debugger/RoadDebuggerView.js` (~3872 LOC)
   - Problem: heavy tool/view logic co-located under `gui/`; hard to draw a UI boundary.
   - Likely extraction: move to `src/graphics/engine3d/` (tool view model), keep DOM-only logic in `RoadDebuggerUI.js`.
   - Rough reduction potential: mostly organizational (clarity) rather than LOC.

4) `src/graphics/gui/building_fabrication/BuildingFabricationUI.js` (~3524 LOC)
   - Problem: UI owns content catalogs, normalization, preview generation, business rules.
   - Likely extraction: (1) fabrication descriptors/schema in `src/graphics/assets3d/**` or `src/app/**`, (2) UI just renders controls.
   - Rough reduction potential: 1k–1.8k LOC.

5) `src/states/MapDebuggerState.js` (~3190 LOC)
   - Problem: monolithic state containing city generation + rendering + input + UI orchestration.
   - Likely extraction: split into tool/controller modules + keep UI panels as “dumb” view components.
   - Rough reduction potential: organizational + testability; LOC reduction depends on decomposition.

## Repetition Patterns Observed

Across screens, the following patterns recur:

- **Toggle row**: `<label><span>Label</span><input type="checkbox"></label>` + `change` handler.
- **Range+Number row**: `<input type="range">` paired with `<input type="number">` kept in sync.
- **Select row**: label + `<select>` options generated from `{id,label}` arrays.
- **Icon-only buttons**: inconsistent approach (Material Symbols helper exists, but some screens use inline SVG).
- **Details/Collapsible sections**: mostly present in building fabrication; could be shared to other debug UIs.
- **Formatting + clamping utilities**: many files define local `clamp`, `formatFloat`, `fmtNum`, etc.
- **Lifecycle cleanup**: some widgets provide `destroy()/dispose()` (good), many do not standardize cleanup.

## Reusable Widget Candidates (and where they already exist)

High-reuse candidates (observed in multiple screens):

- **Toggle row**: used in map debugger, connector debugger, road debugger, rapier debugger, options, inspector room, building fabrication.
  - Existing precedent: `src/graphics/gui/building_fabrication/mini_controllers/ToggleRowController.js`
- **Range+number row**: used in options, rapier debugger, road debugger, inspector room, building fabrication.
  - Existing precedent: `src/graphics/gui/building_fabrication/mini_controllers/RangeNumberRowController.js`
- **Dropdown/select row**: used in inspector room, map debugger, rapier debugger, building fabrication, test mode.
- **Picker row (thumb + label + status)**: used in building fabrication; popup exists in `PickerPopup`.
  - Existing precedent: `src/graphics/gui/building_fabrication/mini_controllers/MaterialPickerRowController.js` + `src/graphics/gui/shared/PickerPopup.js`
- **Details section**: used heavily in building fabrication; could apply to rapier/material variation panels.
  - Existing precedent: `src/graphics/gui/building_fabrication/mini_controllers/UiMiniControlPrimitives.js#createDetailsSection`
- **Tooltips**: mostly implemented via `title` attributes (works, but inconsistent).
- **Toast/notification**: ad-hoc implementations exist (rapier axis toast; building fabrication toast panel).

## Proposed Widget Classes (JS, not CSS-only)

These are minimal proposals that match existing patterns (DOM + state + events + `destroy()` + CSS class hooks).

1) `UiToggleRow`
   - DOM: label + checkbox
   - API: `setChecked(bool)`, `getChecked()`, `setDisabled(bool)`, `onChange(fn)`, `destroy()`
   - Styling hooks: `.ui-row`, `.ui-row-label`, `.ui-toggle` (plus screen-specific modifier classes)

2) `UiRangeNumberRow`
   - DOM: label + range + number
   - API: `setValue(num)`, `getValue()`, `setBounds({min,max,step})`, `setDisabled(bool)`, `onChange(fn)`, `destroy()`
   - Styling hooks: `.ui-range`, `.ui-number`, `.ui-row-wide`

3) `UiSelectRow`
   - DOM: label + select
   - API: `setOptions([{id,label,disabled?}])`, `setValue(id)`, `getValue()`, `setDisabled(bool)`, `onChange(fn)`, `destroy()`
   - Styling hooks: `.ui-select`

4) `UiPickerRow`
   - DOM: label + button (thumb + text) + optional status
   - API: `setValue({id,label,previewUrl?,hex?})`, `setDisabled(bool)`, `openPicker()`, `destroy()`
   - Uses: shared `PickerPopup` internally, or receives one via DI
   - Styling hooks: `.ui-picker-row`, `.ui-picker-thumb`, `.ui-picker-text`, `.ui-picker-status`

5) `UiDetailsSection`
   - DOM: `<details><summary>…</summary><div class="body">…</div></details>`
   - API: `setOpen(bool)`, `isOpen()`, `append(child)`, `destroy()`
   - Optional: persistence via `detailsOpenByKey` Map (existing precedent)

6) `UiToast`
   - DOM: overlay panel (reusing `.ui-panel`) with message + actions
   - API: `show({title,text,actions,duration})`, `hide()`, `destroy()`
   - Styling hooks: `.ui-toast`, `.is-visible`

## Proposed “UI Framework / Widget Layer” Plan

### Folder Organization

Suggested additions (keep existing screen folders):

- `src/graphics/gui/shared/widgets/`
  - `UiToggleRow.js`
  - `UiRangeNumberRow.js`
  - `UiSelectRow.js`
  - `UiPickerRow.js`
  - `UiDetailsSection.js`
  - `UiToast.js`
- `src/graphics/gui/shared/utils/`
  - `dom.js` (small helpers: `el()`, `setText()`, `clearChildren()`, `bind()` returning unbind fns)
  - `format.js` (shared clamp/format helpers used by widgets)

Keep screen-specific controllers under `src/graphics/gui/<screen>/mini_controllers/` when:
- A control’s DOM structure/classes are truly screen-specific, or
- It composes shared widgets with screen-specific behavior.

### Naming + Interface Conventions

- Every widget/controller exposes:
  - `root` (or `getElement()`) for mounting
  - `destroy()` for listener cleanup
  - `sync(...)` for applying state (optional but helpful; existing precedent)
- Screen “UI” classes own only:
  - DOM structure
  - event wiring
  - state projection (reading/writing state via callbacks)
- Screen “Scene/View/Provider” classes own:
  - Three.js, geometry, asset loading, catalogs
  - no DOM creation (except offscreen canvases for textures)

### Migration Strategy (incremental, low-risk)

1) **Promote proven mini controllers**:
   - Start by lifting the building fabrication mini controllers into shared widgets (or re-export them), because they already have `destroy()/sync()` patterns.
2) **Replace highest-duplication controls**:
   - Map debugger toggles (`MapDebuggerControlsPanel.js`)
   - Connector debugger toggles/rows (`ConnectorDebugPanel.js`)
   - Options sliders/toggles (`OptionsUI.js`)
3) **Unify icons**:
   - Replace inline SVG icon buttons in `MapDebuggerEditorPanel.js` (and any inline SVG in building fabrication) with `applyMaterialSymbolToButton()` and the project-standard `.ui-icon`.
4) **Move non-UI out of UI**:
   - Move “provider/scene/view” modules out of `src/graphics/gui/**` into `src/graphics/engine3d/**` or an explicit `src/graphics/tools/**` folder, leaving only DOM code under `gui/`.
5) **Lock in the rule**:
   - “No new ad-hoc widget” guideline: new controls must use shared widgets or a documented per-screen mini controller.

## Descriptor-Driven UI Feasibility

### Existing Patterns That Are Close

- Inspector Room:
  - Providers expose option lists (`getCollectionOptions()`, `getMeshOptions()` in `InspectorRoomMeshesProvider.js`), and UI renders selects from `{id,label}` arrays.
  - This is already “descriptor-like” for enum/select controls, but lacks a shared renderer + validation metadata.
- Building Fabrication:
  - Many generator config values behave like structured parameters (min/max/step/tooltips) and are already using reusable mini controllers.
- Rapier Debugger:
  - Large `INPUT_HELP` / `OUTPUT_HELP` objects act like metadata; the UI could become a schema-driven panel.

### Minimal Descriptor Format (proposal)

```js
{
  key: 'exposure',
  type: 'number' | 'boolean' | 'select' | 'color' | 'action' | 'group',
  label: 'Tone mapping exposure',
  default: 1.0,
  min: 0.1, max: 5, step: 0.01, digits: 2, // for number
  options: [{ id: 'a', label: 'A' }],       // for select
  group: 'Renderer + Lights',
  tooltip: '...',
  storageKey: 'lighting.exposure',
  visibleIf: (ctx) => true,
  enabledIf: (ctx) => ctx.canEdit
}
```

### Descriptor → Widget Mapping

- `boolean` → `UiToggleRow`
- `number` (has min/max/step) → `UiRangeNumberRow`
- `select` → `UiSelectRow`
- `color/material` → `UiPickerRow` + `PickerPopup`
- `group` → `UiDetailsSection` (or a panel section with `.ui-section-label`)

### Computed Values + Overrides

- Support `get(ctx)` and `set(ctx,value)` in descriptors for:
  - computed read-only values (formatters)
  - per-screen overrides without duplicating the control implementation
- Allow “screen profile” to override:
  - label, tooltip, grouping, visibility rules
  - but keep the underlying descriptor key stable for persistence.

### Incremental Adoption Plan

1) Start with **Options UI** as a pilot:
   - Few fields, clear persistence keys, low risk.
2) Then adopt for a subsystem with many repeated numeric controls:
   - Candidate: **Rapier debugger** (field schemas already exist as help objects).
   - Alternative: **Material variation** (largest LOC savings, but higher risk).
3) Use the result to define a stable “descriptor runtime”:
   - validation
   - persistence
   - tooltips
   - section grouping

### Risks / Tradeoffs

- Complexity: descriptor engines can become a “mini framework.” Mitigation: keep scope to basic input types, avoid trying to auto-generate every UI.
- Debugging: dynamic UI can hide control wiring. Mitigation: keep descriptor lists local per screen and keep widget classes explicit.
- Edge cases: custom layouts (e.g., road debugger tables, mesh preview overlays) still need bespoke code. Mitigation: descriptors cover 70% of controls; bespoke remains allowed when justified.

## What Else? (Additional Improvement Opportunities)

- Standardize theming via CSS variables in `src/graphics/gui/shared/styles.css` (colors, radii, panel bg, borders, text).
- Reduce inline `element.style.*` assignment:
  - keep inline styles for dynamic transforms only (e.g., steering widget), move layout/styling to CSS classes.
- Standardize event wiring:
  - introduce a tiny listener registry helper that returns `unbind()` and is called from `destroy()`.
- Add documentation/examples:
  - “How to build a new screen UI” short guide showing the widget layer + recommended folder layout.
