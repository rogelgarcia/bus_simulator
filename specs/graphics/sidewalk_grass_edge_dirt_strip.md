# Sidewalk Grass-Edge Dirt Strip Spec

## Scope

Defines the road decoration strip rendered where sidewalks transition into grass/ground.

## Geometry

- Source boundaries are road-engine asphalt/junction polygons.
- Compute sidewalk outer perimeter from road boundary offset:
  - `sidewalkOuterOffset = curbThickness + sidewalk.extraWidth`
- Build a thin outward strip from sidewalk outer perimeter:
  - inner edge at `sidewalkOuterOffset`
  - outer edge at `sidewalkOuterOffset + livedIn.sidewalkGrassEdgeStrip.width`
- Strip is rendered as a single merged mesh (top face only), with UVs:
  - `u` follows perimeter distance
  - `v=0` at sidewalk edge, `v=1` at grass edge

## Material / Shading

- Material type: `MeshStandardMaterial`.
- Supports fade away from sidewalk using shader alpha driven by `v`:
  - darkest/most visible at `v=0`
  - fades toward `v=1`
- Default material is non-glossy (`roughness` high, `metalness` low).
- Use slight lift + polygon offset and disable depth write to reduce z-fighting/shimmer.

## Settings Model

Stored under `asphaltNoise.livedIn.sidewalkGrassEdgeStrip`:

- `enabled` (bool)
- `width` (meters)
- `opacity`
- `roughness`
- `metalness`
- `colorHex`
- `fadePower`

## Options UI

- A `Grass` tab exposes an `enabled` toggle for the strip:
  - `Sidewalk grass-edge dirt strip`
- Toggle updates live visibility and persists through options save.
