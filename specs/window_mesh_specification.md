# Window Mesh Specification

Building windows are rendered as procedural meshes composed of four layers: frame, glass, shades, and interior. This replaces the previous texture-only approach.

## Overview

A window is a rectangular opening with an optional arched top. Each window instance combines:

1. **Frame** - The outer border and optional internal grid (muntins)
2. **Glass** - Transparent pane with reflective properties
3. **Shade** - Partially drawn window covering behind the glass
4. **Interior** - Parallax-simulated room visible through the glass

## Dimensions

The window has a width and height in meters. These define the outer bounds of the frame.

When an arch is enabled, it adds a curved top portion above the rectangular area. The arch height is specified as a ratio of the window width (e.g., 0.25 means the arch rises by 25% of the width). A flag controls whether a straight horizontal frame piece appears where the arch meets the rectangular portion.

## Frame

The frame consists of the outer border and optionally an internal grid of muntins (the bars that divide the glass into panes).

### Outer Frame

- **Width**: The thickness of the frame as seen from the front (in meters)
- **Depth**: How far the frame extrudes from the wall surface (in meters)
- **Open bottom**: Optional flag to remove the bottom frame segment (used for door mode)
- **Color**: RGB color for the frame material

### Bevel Effect

The frame uses a procedurally generated PBR texture to simulate a beveled or rounded profile without additional geometry. Two parameters control this:

- **Bevel size**: How much of the frame width is affected by the bevel (0 to 1)
- **Roundness**: Whether the bevel is sharp (0) or smoothly rounded (1)

### Internal Grid (Muntins)

When enabled, muntins divide the window into a grid of smaller panes.

- **Columns**: Number of vertical divisions
- **Rows**: Number of horizontal divisions
- **Muntin width**: Thickness of the grid bars (typically thinner than the outer frame)
- **Muntin depth**: How far the muntins extrude
- **Inset**: How far the muntins are recessed from the outer frame face
- **UV offset**: Allows repositioning the grid within the frame area
- **Color**: Can differ from the outer frame, or inherit from it
- **Bevel**: Muntins can have their own bevel settings or inherit from the frame

## Glass

A single glass pane fills each opening created by the frame and muntins.

### Properties

- **Opacity**: How opaque the glass is (0 = fully transparent, 1 = fully opaque)
- **Tint**: RGB color that tints the glass
- **Reflectivity**: How reflective the surface is (0 to 1)
- **Index of refraction**: Controls refraction distortion (typically around 1.5 for glass)
- **Z offset**: Positions the glass forward or backward relative to the frame (in meters)
- Expand all reflection properties.

### Notes

- Glass is single-pane for simplicity
- Weathering and dirt effects are not included in this version

## Shade

An optional shade can partially cover the window from the inside.

### Coverage

The shade covers the window from the top down. Coverage is one of four discrete values:

- **None** (0%): Shade fully retracted
- **20%**: Slightly drawn
- **50%**: Half covering
- **100%**: Fully closed

Coverage can be randomly selected per window instance to add variety.

### Appearance

- **Color**: Configurable RGB color (default is off-white)
- **Texture**: A subtle procedural fabric texture is applied
- **Texture scale**: Controls the size of the fabric pattern
- **Texture intensity**: How visible the texture is (keep subtle)

### Position

The shade is positioned behind the glass. The Z offset controls how far back (negative values place it deeper into the building).

## Interior

The interior creates the illusion of a room behind the window using parallax mapping.

### Atlas

An atlas texture contains multiple interior images arranged in a grid. Each window randomly selects one cell from the atlas.

- **Atlas path**: Path to the atlas texture
- **Grid layout**: Number of columns and rows in the atlas

### Parallax

- **Depth**: How deep the room appears (default 3 meters)

### Variation

To prevent repetition across a building:

- **Random selection**: Each window picks a random cell from the atlas
- **Horizontal flip**: Randomly mirrors the interior horizontally
- **Tint range**: Random hue shift, saturation, and brightness adjustments within specified ranges

### Notes

- No day/night handling in this version (interiors are always the same brightness)

## Out of Scope

The following are explicitly not part of the window mesh:

- **Window sill / exterior trim / lintel**: This was historically handled by building geometry, but is now considered part of the window system in `specs/windows/` (sill/trim/lintel features).
- **LOD variants**: To be added later
- **Animation**: Windows are static (no opening, no shade movement)
- **Bus windows**: This specification is for building windows only


## Debugger

- Create an independent debugger view for window meshes.
- Add all parameters, later on, this will be moved to building fabrication.
- Add a top-level mode switch for `window` vs `door` vs `garage` and mode-specific catalogs.
- In door mode, render a single door at the bottom center of the test wall.
- In door mode, disable interior parallax (first pass).
- In garage mode:
  - render a single base-aligned garage opening,
  - remove glass/shade/decoration workflows,
  - keep frame support,
  - expose a `Facade` tab with `Open` / `Closed` and closed-panel metal material picker,
  - in `Closed`, render the closed surface with the selected metal material,
  - in `Open`, cut wall opening + create room volume behind the opening using `pbr.concrete_layers_02`,
  - ensure room depth is 50% of available building depth and room footprint extends beyond opening width/height,
  - ensure open/closed switching rebuilds geometry cleanly with no stale meshes.
- Add catalog export/import flow with name-first entries:
  - Export uses a user-provided catalog name (not only preset ids).
  - Export payload includes window settings/layers, wall material hint, and a thumbnail snapshot.
  - Export payload MUST NOT include decoration component settings (`sill` / `header` / `trim`), because decoration is visualization-only.
  - Load is driven by a thumbnail picker that selects catalog entries by preview.
  - Thumbnail generation renders the asset in an offscreen buffer against a wall that is 20% larger than the window/door dimensions.
- Decoration controls are template-driven and pluggable:
  - each decoration component exposes a `type` selector (`header`/`trim`: `simple`; `sill`: `simple` + `bottom cover`),
  - style plugins are responsible only for generating local decoration shape from resolved template params,
  - placement/alignment relative to the window is handled by the view/engine layer (outside style plugins).
- Decoration material mode button groups MUST be exactly:
  - `Match wall` (default),
  - `Match frame`,
  - `PBR`.
- Decoration shadows are not user-configurable in this phase; rendered decoration always casts and receives shadows.
- Sill/Header/Trim controls in first pass are constrained to:
  - `enabled`,
  - `type` (`header`/`trim`: `simple`; `sill`: `simple` or `bottom cover`),
  - width mode (`Match window` or `15%`),
  - depth option (`0.08` default, or `0.02`),
  - material mode.
- Width mode semantics:
  - `Match window` = 100% width (`widthScale = 1.0`),
  - `15%` = 115% width (`widthScale = 1.15`).
- Template baseline defaults for first-pass `simple` style:
  - `height = 0.08`,
  - `depth = 0.08`,
  - `gap = 0`,
  - `offset = { x: 0, y: 0, z: 0 }`.
- Sill type metadata drives auto-suggestions on type change:
  - selecting sill `bottom cover` auto-applies: width mode `Match window`, depth `0.08`, material mode `Match frame`,
  - sill `bottom cover` template: `height = 0.5`, `offset.z = -depth` (depth-relative).
- Keep the existing preview wall + environment flow with PBR wall material selection.
