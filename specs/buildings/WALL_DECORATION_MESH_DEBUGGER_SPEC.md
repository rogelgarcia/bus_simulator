# Wall Decoration Mesh Debugger Specification

## 1. Purpose

This tool provides a standalone authoring/debug workflow for procedural wall decorators before Building Fabrication 2 integration.

Scope for this phase:
- wall decorator catalog model,
- catalog loader + decorator application in a dedicated debugger scene,
- placement/material controls for decorator iteration.

Out of scope for this phase:
- direct Building Fabrication 2 runtime integration.

## 2. Screen + Scene Contract

- Debug tool entry: `debug_tools/wall_decoration_mesh_debug.html`
- UI host id: `ui-wall-decoration-mesh-debugger`
- Fixed debug wall dimensions:
  - width: `10.0m`
  - height: `3.5m`
- A corner-adjacent wall is present to validate corner continuation mode.
- The wall keeps a `90°` outside corner; corner continuity uses the internal `45°` wedge from the outer corner to the offset intersection.
- The left View panel exposes:
  - mesh/wireframe view mode,
  - `Show wall` toggle (hide/show wall mesh without disabling decorator preview),
  - `Show dummy` toggle (hide/show dummy context helpers like sky/ground/grid while keeping wall/decorator editing active).

## 3. Catalog + Loader Contract

Wall decorators are catalog entries with procedural generator functions.

Each entry MUST provide:
- `id`
- `label`
- `defaults` (placement/position/material baseline)
- `createShapeSpecs(...)` generator function
- `defaults.materialSelection` MUST default to `match_wall` for consistent wall-coupled behavior across all decorator types.

The loader MUST:
- resolve the selected catalog entry by id,
- execute the entry’s procedural generator,
- return shape specs used by the debugger view to instantiate meshes.

## 4. Placement Controls

### 4.1 Where to apply

Enum:
- `entire_facade`
- `half`

Behavior:
- `entire_facade`: decorator covers the full target facade span.
- `half`: decorator covers the left-half span of the target facade.
- switching decorator `Type` must preserve current placement controls (`whereToApply`, `mode`, `position`) so decoration placement does not jump while iterating types.

### 4.2 Mode

Enum:
- `face`
- `corner`

Behavior:
- `face`: apply decorator on the active front facade only.
- `corner`: continue/apply on front + adjacent right facade for corner continuity.
- corner continuity follows the same miter reference for all decorators:
  - the `45°` wedge is measured from corner to offset intersection (trim amount equals outward depth/offset, not `offset * sqrt(2)`).

## 5. Position Controls

Enum:
- `top`
- `near_top`
- `near_bottom`
- `bottom`

Vertical semantics:
- `top`: aligned to wall top boundary.
- `near_top`: `10cm` below top boundary.
- `near_bottom`: `10cm` above bottom boundary.
- `bottom`: aligned to floor/bottom boundary (default for `Simple Skirt`).

## 6. Materials Tab Contract

The `Materials` tab MUST expose direct controls (no external picker popup) equivalent to Building Fabrication 2 wall material configuration primitives:
- Material selection:
  - kind (`texture` / `color` / `match_wall`)
  - material id (inline select for explicit `texture`/`color`)
  - `match_wall` mode resolves decorator surface material directly from the current wall material source
  - `match_wall` is mandatory and behaviorally consistent for every decorator type (no type-specific opt-out)
- Wall base:
  - shared tint picker (hue wheel + SV triangle interaction)
  - tint brightness
  - tint intensity
  - tint thumbnail/hex preview
  - roughness
  - normal strength
- Texture tiling:
  - override tile meters toggle
  - tile meters U
  - tile meters V
  - UV transform toggle
  - U offset
  - V offset
  - rotation degrees

Wall preview material rules:
- Selecting `Painted plaster wall` for the sample wall preview uses fixed `2m x 2m` tiling and `90°` texture rotation.
- When `match_wall` is selected, decorator material and maps follow the active wall material source immediately, and explicit decorator material assignment controls are bypassed.

## 7. Seed Entry: Simple Skirt

Catalog id: `simple_skirt`

Generation contract:
- produces surround geometry outside the wall surface (no penetration into the wall body),
- emits a main offset skirt piece plus closure pieces (top/sides and conditional bottom closure),
- when `position = bottom`, bottom closure pieces are omitted,
- in `corner` mode, front/right segments keep full exterior `90°` reach and apply internal `45°` miter wedge cuts at the corner seam (no dedicated corner-joint filler mesh),
- configuration includes:
  - `Preset`: `Small (0.20m, 0.02m)`, `Medium (0.50m, 0.05m)`, `Large (1.00m, 0.10m)` where tuple = `(height, outward offset)`
  - `Offset mode`: `Normal` (`1x` preset offset) or `Extra` (`2x` preset offset),
  - `Near-edge offset (m)` for near-top / near-bottom placement.

## 8. Seed Entry: Curved Ring

Catalog id: `half_dome`

Generation contract:
- produces a continuous strip by sweeping a half-circle side profile along the selected facade span,
- side profile is semicircular (half-dome section) while front view reads as a longitudinal strip with a rounded face,
- flat/back side is aligned with the wall plane (plus optional outward outset),
- wall-facing cap geometry is omitted,
- profile sizing is circular-only (single diameter control, no oval/non-uniform axes),
- supports placement controls (`whereToApply`, `mode`, `position`) and shared material/tiling flows,
- in `corner` mode emits front+right sweep segments with `45°` miter behavior at the corner seam while preserving full exterior `90°` reach,
- generated curved-ring faces must keep outward winding (no inverted visible faces).

## 9. Seed Entry: Ribbon

Catalog id: `ribbon`

Generation/material contract:
- uses the same surround construction rules as `Simple Skirt`:
  - outside wall surface only (no overlap with wall body),
  - face/corner continuation behavior,
  - same preset/offset-mode sizing semantics,
  - same near-edge placement control.
- keeps ribbon presets/type configuration isolated from `Simple Skirt` metadata (no shared config object), but initial preset numeric values are identical.
- adds ribbon-only pattern detail controls:
  - `Pattern` enum rendered as a thumbnail picker,
  - seeded options: `Circle`, `Flat-base X`,
  - `Pattern normal` scalar controlling generated normal intensity.
- ribbon pattern source is grayscale and converted to a normal map at runtime.
- first pass is normal-map only (no displacement/parallax geometry mutation).

## 10. Seed Entry: Angled Support Profile

Catalog id: `angled_support_profile`

Generation contract:
- defines a continuous swept profile (engine-owned placement path; not isolated block placement by default),
- profile side shape is a 3-line form:
  - line 1 anchored on wall surface,
  - line 2 offsets outward with signed vertical `shift`,
  - line 3 returns straight along wall orientation by `returnHeight`, then closes,
- supports one direction only (no mirrored mode),
- corner mode uses a `45°` miter rule for corner continuity while preserving full exterior `90°` reach,
- generated profile faces must keep outward winding (no inverted visible faces),
- type parameters are limited to:
  - `offset`
  - `shift` (signed)
  - `returnHeight`
- no `thickness` parameter is exposed for this style.

## 11. Seed Entry: Edge Brick Chain

Catalog id: `edge_brick_chain`

Generation contract:
- applies only at facade span vertical edges (no full-face strip fill).
- edge target selector:
  - `Left`
  - `Right`
  - `Both`
- vertical course pattern alternates by sequence:
  - `0.30m`, `0.15m`, `0.30m`, `0.15m`, repeating (driven by `brickHeight` base, with `0.5x` alternating course).
- geometry is outward-only extrusion (non-overlapping with wall body).
- range controls:
  - `startY`
  - `endY`
  - `brickHeight`
- snap behavior:
  - when `Snap to fit = on`, all generated course heights are uniformly scaled so the full chain fits exactly from `startY` to `endY` (no partial terminal course),
  - when `Snap to fit = off`, raw alternating heights are used and final partial course is allowed.
- in `Both` mode, all targeted columns share the same range and alternating parity start at `startY`.
- in corner mode, edge courses that pass through the active corner apply `45°` miter flags for clean edge/corner continuity while preserving full outer-corner reach at wall plane.
