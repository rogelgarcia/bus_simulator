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

## 3. Catalog + Loader Contract

Wall decorators are catalog entries with procedural generator functions.

Each entry MUST provide:
- `id`
- `label`
- `defaults` (placement/position/material baseline)
- `createShapeSpecs(...)` generator function

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

### 4.2 Mode

Enum:
- `face`
- `corner`

Behavior:
- `face`: apply decorator on the active front facade only.
- `corner`: continue/apply on front + adjacent right facade for corner continuity.

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
  - kind (`texture` / `color`)
  - material id (inline select)
- Wall base:
  - tint hue
  - tint saturation
  - tint value
  - tint intensity
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

## 7. Seed Entry: Simple Skirt

Catalog id: `simple_skirt`

Generation contract:
- produces a block mesh,
- block footprint is `5cm` larger than target wall footprint,
- defaults to bottom-aligned placement (`position = bottom`).

