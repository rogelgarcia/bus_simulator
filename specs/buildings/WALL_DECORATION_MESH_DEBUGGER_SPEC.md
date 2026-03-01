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
- switching decorator `Type` must preserve `whereToApply` and `mode`.
- `position` switch behavior:
  - if previous type default position equals next type default position, keep current `position` value,
  - if previous type default position differs from next type default position, remap to the next type default position.

### 4.2 Mode

Enum:
- `face`
- `corner`

Behavior:
- `face`: apply decorator on the active front facade only.
- `corner`: continue/apply on front + adjacent right facade for corner continuity.
- corner continuity is decorator-specific:
  - miter-based decorators may use inward or outward `45°` wedges per decorator contract (trim/extension measured against outward depth/offset, not `offset * sqrt(2)`),
  - flat-panel decorators may extend span widths by offset instead of using a miter cut.

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
- Configuration tab layout:
  - `Presets` section appears above `Properties` for the selected decorator type,
  - preset buttons apply property values into `configuration`,
  - preset controls may be grouped (for example `Size`, `Offset`),
  - preset active state is derived from current property values (if properties match a preset, that preset is shown as active).

Wall preview material rules:
- Selecting `Painted plaster wall` for the sample wall preview uses fixed `2m x 2m` tiling and `90°` texture rotation.
- When `match_wall` is selected, decorator material and maps follow the active wall material source immediately, and explicit decorator material assignment controls are bypassed.
- Decorator texture world scale must borrow active wall tile size by default (same meters-per-tile as wall preview, e.g. `2m x 2m` for painted plaster wall); per-decorator tiling overrides may still adjust this when enabled.

## 7. Seed Entry: Simple Skirt

Catalog id: `simple_skirt`

Generation contract:
- produces flat panel geometry outside the wall surface (no penetration into the wall body),
- emits one panel per active facade segment (front in `face`; front+right in `corner`),
- non-corner (`face`) width equals the selected wall span exactly,
- in `corner` mode, each panel extends by `+offset` at the corner-facing edge (panel width = selected span + offset),
- emits horizontal cap panels that bridge from wall plane to skirt panel offset:
  - cap panel is a flat quad oriented `90°` relative to the wall plane,
  - cap quad spans the selected wall span width (no `+offset` widening in the base quad),
  - in `corner` mode, cap adds one extra triangle at the corner-facing edge to bridge wall-corner position to the widened skirt edge position,
  - top and bottom caps are supported; when `position = top`, omit top cap; when `position = bottom`, omit bottom cap,
- emits vertical side caps as quads bridging wall plane to skirt offset across skirt height:
  - in `face` mode, both side edges receive caps,
  - in `corner` mode, side-cap emission is per-edge: each segment emits a side cap only on its non-corner edge (no side cap on the shared corner seam edge),
- configuration includes:
  - `Presets`:
    - `Size`: `Small (0.20m)`, `Medium (0.50m)`, `Large (1.00m)` (sets `heightMeters`)
    - `Offset`: `Normal (1.0x)`, `Extra (2.0x)` (sets `offsetScale`)
  - `Properties`:
    - `heightMeters`
    - `offsetScale`
    - `nearEdgeOffsetMeters` (for near-top / near-bottom placement).

## 8. Seed Entry: Curved Ring

Catalog id: `half_dome`

Generation contract:
- produces a continuous strip by sweeping a half-circle side profile along the selected facade span,
- side profile is semicircular (half-dome section) while front view reads as a longitudinal strip with a rounded face,
- flat/back side is aligned with the wall plane (plus optional outward outset),
- wall-facing cap geometry is omitted,
- profile sizing is circular-only (single diameter control, no oval/non-uniform axes),
- curved-ring presets define diameter values: `Tiny = 0.01m`, `Small = 0.05m`, `Medium = 0.10m`, `Large = 0.20m`,
- supports placement controls (`whereToApply`, `mode`, `position`) and shared material/tiling flows,
- in `corner` mode emits front+right sweep segments with `45°` corner wedges that run from wall-edge to outer-form edge (`+depth` reach on the corner side), while preserving full exterior `90°` reach,
- generated curved-ring faces must keep outward winding (no inverted visible faces),
- mesh construction uses continuous curved indexed topology with smooth-shading-ready normals (no hard per-segment faceting under normal lighting).

## 9. Seed Entry: Ribbon

Catalog id: `ribbon`

Generation/material contract:
- uses the same face/cap construction logic as `Simple Skirt`:
  - outside wall surface only (no overlap with wall body),
  - face panels, top/bottom caps, and side caps follow the same per-edge corner rules,
  - same grouped preset sizing semantics (`Size` + `Offset`),
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
- uses the same face/cap mesh layout as `Simple Skirt`:
  - front/right face panels,
  - top/bottom caps (omitted per `position` where applicable),
  - side caps on non-corner edges only,
  - corner mode keeps the same per-edge corner bridge + side-cap rules.
- panel sizing is driven by:
  - `offset` for outward panel distance from wall,
  - `height` for panel height.
- top and bottom caps support independent wall-edge vertical offsets derived from `offset` and cap angles:
  - `topCapAngleDeg`
  - `bottomCapAngleDeg`
- cap angle behavior is implemented by moving wall-edge cap vertices up/down (outer edge remains aligned with panel edge),
- generated faces must keep outward winding (no inverted visible faces),
- type parameters are:
  - `offset`
  - `height`
  - `topCapAngleDeg`
  - `bottomCapAngleDeg`
- no `thickness` parameter is exposed for this style.

## 11. Seed Entry: Edge Brick Chain

Catalog id: `edge_brick_chain`

Generation contract:
- applies only at facade span vertical edges (no full-face strip fill).
- edge target selector:
  - `Left`
  - `Right`
  - `Both`
- vertical course height is uniform per chain:
  - every course uses the same base height driven by `brickHeight` (except optional final partial course when snap is off).
- wall-span width alternates per course as well (perpendicular to wall normal):
  - even-index courses use a longer wall-coverage width,
  - odd-index courses use a shorter wall-coverage width.
- protrusion depth remains uniform for the chain while width alternates.
- top and bottom cap faces are currently disabled for edge-brick courses.
- wall-facing face is removed (course is open toward the wall plane).
- geometry is outward-only extrusion (non-overlapping with wall body).
- range controls:
  - `startY`
  - `endY`
  - `brickHeight`
  - `depthScaleMultiplier`
- configuration presets include:
  - `Size`: `Small = 0.05m`, `Medium = 0.10m`, `Large = 0.15m` (`brickHeight`)
  - `Offset`: `Small = 0.5x`, `Normal = 1.0x`, `Extra = 1.5x` (`depthScaleMultiplier`)
- snap behavior:
  - when `Snap to fit = on`, all generated course heights are uniformly scaled so the full chain fits exactly from `startY` to `endY` (no partial terminal course),
  - when `Snap to fit = off`, raw alternating heights are used and final partial course is allowed.
- in `Both` mode, all targeted columns share the same range and width-alternation parity start at `startY`.
- in corner mode, edge courses that pass through the active corner apply per-edge wedge pairing:
  - front corner-edge courses and right corner-edge courses use complementary `45°` outward wedge flags so one face wedge connects directly to the other at the seam and reaches from wall-edge to outer-form edge (`+depth`),
  - both seam-facing wedge faces are removed (`front end face` + `right start face`) to avoid internal overlap,
  - non-corner edge columns stay un-mitered.

## 12. Seed Entry: Cornice Blocks

Catalog id: `cornice_basic_block`

Generation/config contract:
- emits repeated square blocks near roofline using existing placement controls (default `top` position).
- properties expose raw values:
  - `blockSizeMeters`
  - `spacingMode` (`match_block` | `fixed`)
  - `spacingMeters`
  - `frontBottomLiftScale` (0 = flat; positive raises front-bottom edge by `blockSize * scale`)
  - `snapToFit`
- presets are grouped into:
  - group label: `Block size`
  - `Small`: `0.05m`
  - `Medium`: `0.10m`
  - `Large`: `0.15m`
  - group label: `Spacing`
  - `Match block`: gap equals block size (`spacingMeters = 2 * blockSizeMeters`)
  - `Small`: fixed `0.10m`
  - `Medium`: fixed `0.20m`
  - `Large`: fixed `0.30m`
  - group label: `Angle`
  - `Flat`: `frontBottomLiftScale = 0.0`
  - `Angle`: `frontBottomLiftScale = 0.5` (raise front-bottom edge by half the block size)
- `spacingMeters` is center-to-center pitch (block width is independent).
- in `match_block` mode, spacing is derived from block size (`2x block size`) and manual spacing does not drive generation.
- in `fixed` mode, spacing uses the manual/preset `spacingMeters` value.
- when `snapToFit = off`, requested center pitch is used directly and the center run is distributed symmetrically within the selected span.
- when `snapToFit = on`, pitch is overridden to the nearest larger fit so first/last block edges terminate at wall edges (flush edge fit).

## 13. Seed Entry: Cornice Rounded

Catalog id: `cornice_rounded`

Generation/config contract:
- clones `cornice_basic_block` placement and configuration behavior:
  - same spacing/size property set (`blockSizeMeters`, `spacingMode`, `spacingMeters`, `snapToFit`) plus `curvature`,
  - grouped presets include `Block size`, `Spacing`, and `Curvature`,
  - same default placement (`top`, `corner`) and spacing/snap rules.
- mesh kind is `cornice_rounded_block`.
- mesh construction is per-block (same block interval layout as `cornice_basic_block`), with each block using the rounded side profile.
- profile/cover rules in side view:
  - side covers are generated on both sides from one closed side-profile silhouette,
  - full front and full bottom covers are replaced by reduced covers sized to `10%` of block size,
  - reduced front cover starts from top edge and extends downward,
  - reduced bottom cover starts from wall edge and extends outward,
  - reduced front cover bottom vertex connects to reduced bottom cover rightmost vertex through a convex circular arc.
- curvature option:
  - `Convex`
  - `Concave`
- arc segmentation rule:
  - `arcSegments = ceil(blockSizeCm / 2)`,
  - examples: `5cm -> 3`, `10cm -> 5`, `15cm -> 8`.

## 14. Seed Entry: Awning

Catalog id: `awning`

Generation/config contract:
- belongs to catalog section `Awning`.
- emits, per active face segment:
  - one slanted top plane (`awning_slanted_plane`) from wall edge to front edge,
  - one front/valance quad (`awning_front_quad`) at the awning front edge,
  - side-edge support rods (`awning_support_rod`) connecting wall anchors to the awning body.
- support rod behavior:
  - `face` mode: two rods on the front segment (`start` and `end` edges),
  - `corner` mode: per-edge logic on non-corner edges only (front-start + right-end), yielding two rods total.
- corner coverage behavior:
  - front and right segments continue around the corner using projection-based extension (same continuity rationale used by flat-panel corner decorators).
- properties:
  - `projectionMeters`
  - `frontHeightMeters`
  - `slopeDegrees`
  - `rodRadiusMeters`
  - `rodInsetMeters`
  - `nearEdgeOffsetMeters`
- defaults:
  - `whereToApply = entire_facade`
  - `mode = face`
  - `position = near_top`
- presets:
  - grouped presets include `Size` (`Small`, `Medium`, `Large`) and `Slope` (`Shallow`, `Standard`, `Steep`).
