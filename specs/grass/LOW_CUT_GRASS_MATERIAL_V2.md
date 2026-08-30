# Natural Maintained-Grass Material Family V2

## Scope and authority

`pbr.grass_low_cut_maintained_v2` is the AI 358 appearance authority for the
Grass Lab and for corrective work in AI 359 through AI 363. It supersedes the V1
material family for new work without deleting V1 evidence. AI 358 remains
offline-first: this contract does not authorize gameplay import, placement,
boundary, LOD, or performance-policy changes.

The requested soccer-field example describes a dense, coherent carpet and a
credible grass color response. It is not a request to reproduce stadium striping
or perfectly uniform turf. V2 supports natural maintained grass with 25–75 mm
blades, irregular silhouettes, restrained dry variation, and localized longer
accents.

## Stable identity and source

- material ID: `pbr.grass_low_cut_maintained_v2`
- asset ID: `grass.natural.maintained.material.v2`
- profile ID: `grass.natural.maintained.v2`
- profile seed: `natural-maintained-turf-v2`
- bake seed: `grass-material-bake-v2`
- AI 358 lab staging directory:
  `tests/artifacts/grass_material_baker/grass_low_cut_maintained_v2_split/`
- future gameplay installation location (not modified by AI 358):
  `assets/public/pbr/grass_low_cut_maintained_v2/`
- deterministic recipe: `tools/grass_material_baker/blender_bake.py`

V2 is derived from ambientCG Grass 004 under CC0 1.0. The checked-in source
package does not contain authoritative physical dimensions. The far tile's
1.4 × 1.4 m footprint is therefore a project calibration, recorded separately
from unknown source-authored dimensions in the manifest.

## Asset contract

| File | Role | Color space |
|---|---|---|
| `far_basecolor.png` | Corrected canonical far albedo, no baked lighting | sRGB |
| `far_normal_gl.png` | Far OpenGL normal | Linear |
| `far_roughness.png` | Far fiber roughness | Linear |
| `far_ao.png` | Far ambient occlusion | Linear |
| `far_height.png` | Far height data | Linear |
| `far_coverage.png` | Far micro-coverage data | Linear |
| `mid_cluster_basecolor.png` | Fully opaque mid-strip albedo | sRGB |
| `mid_cluster_normal_gl.png` | Fully opaque mid-strip OpenGL normal | Linear |
| `mid_cluster_roughness.png` | Fully opaque mid-strip roughness | Linear |
| `mid_cluster_ao.png` | Fully opaque mid-strip AO | Linear |
| `mid_cluster_coverage.png` | Mid-strip grayscale cutout coverage; green channel feeds `alphaMap` | Linear |
| `accent_clump_basecolor.png` | Fully opaque accent albedo | sRGB |
| `accent_clump_normal_gl.png` | Fully opaque accent OpenGL normal | Linear |
| `accent_clump_roughness.png` | Fully opaque accent roughness | Linear |
| `accent_clump_ao.png` | Fully opaque accent AO | Linear |
| `accent_clump_coverage.png` | Accent grayscale cutout coverage; green channel feeds `alphaMap` | Linear |
| `grass_low_cut_maintained_v2.blend` | Inspectable deterministic bake source | Blender |
| `asset.manifest.json` | Scale, provenance, policy, measurements, and hashes | JSON |

Far maps are 1024 × 1024. Each aligned atlas map is 1024 × 512 with a 4 × 2
grid and eight 256 × 256 cells. The coverage atlas carries a real 16 px
zero-coverage gutter on every cell edge; the corresponding PBR maps remain fully
opaque.

## Physical atlas families

The atlas camera frames the physical rectangle represented by one runtime card.
The two use cases do not share one ambiguous atlas scale.

| Family | Physical rectangle per cell | Runtime nominal rectangle | Nominal error |
|---|---:|---:|---:|
| Mid cluster strip | 1.15 × 0.055 m | 1.15 × 0.055 m | 0% |
| Accent clump | 0.24 × 0.075 m | 0.24 × 0.075 m | 0% |

Placement-level scale variation is a separate runtime decision and must not be
misrepresented as bake-scale error. A downstream system may vary instances while
retaining these values as the atlas' nominal physical interpretation.

## Appearance ownership

The corrected far base color is canonical. The baker derives atlas root, body,
tip, and dry colors from restrained luminance percentiles of that same image, so
cards converge toward the surface instead of becoming bright green pixels.

The base-color bake uses an emission node only as an unlit, colorimetric capture
mechanism. It contains no scene illumination or directional shadowing. Runtime
emissive intensity is exactly `0`; lights own brightness. Roughness and AO remain
independent channels, and the OpenGL normal maps remain independent of albedo.
The runtime catalog and shared PBR texture service own loading and material
construction. The Grass Lab must not introduce a local texture loader.

V2 atlas geometry has no per-vertex `color` attribute. Its material therefore
uses `vertexColors: false`; otherwise the standard material multiplies the atlas
albedo by a missing/default-black vertex color and produces a dark card band.
Per-instance brightness remains available through `instanceColor`, which is
independent of the absent geometry color attribute. Mid and accent materials
keep emissive intensity at exactly `0`.

### Card-normal lighting policy

The mid-cluster and accent-clump cards use the V2 `world_up_blend` vegetation
normal policy. After the standard material has applied its normal map, the
fragment normal is normalized and blended `1.0` toward world up, transformed
into view space for lighting. The cards therefore receive the upward illumination
expected from a dense grass volume. This keeps the physically lit cards close to
the far turf under elevated and grazing cameras without adding emissive light.

The policy changes neither geometry nor raster cost: it adds one shared scalar
uniform and a small fragment-normal operation to the existing mid and accent
material programs. V1 keeps `mesh` normals with a blend of `0`, preserving its
historical before-capture behavior. The normal policy and blend participate in
the material program signature so switching V1/V2 forces the correct program to
compile.

## Alpha and mip policy

- alpha cutoff: `0.35`
- alpha-to-coverage: enabled when multisampling is available
- atlas grid: 4 × 2, eight variants
- zero-coverage gutter: 16 px per cell edge
- PBR alpha: fully opaque on base color, normal, roughness, and AO
- cutout source: separate grayscale coverage PNG sampled through `alphaMap`
- coverage channel: green
- PBR RGB conditioning: deterministic full-cell nearest opaque, cell-local
- minification: trilinear generated mips
- magnification: linear
- last required runtime mip: level 7, inclusive

The baker repeatedly box-filters atlas coverage and validates each cell at every
level from 0 through 7. All eight variants must retain a maximum coverage at or
above the cutoff at every declared mip or generation fails. For every PBR map,
each cell is deterministically conditioned across its complete RGB area from the
nearest texel that is opaque in the source coverage mask. Conditioning never
crosses a cell boundary and never changes the separate coverage image or its
16 px gutter. The generated manifest records per-cell maximum coverage, mean
coverage, and cutoff coverage for every level.

At runtime, the coverage texture is bound as `alphaMap`; its `vAlphaMapUv` is
remapped with the same per-instance 4 × 2 atlas-cell transform as the other map
UVs. V2 does not divide filtered RGB by alpha. V1 retains its historical
packed-alpha fallback and mesh-normal policy.

The split coverage map adds one texture sample to each V2 card material. The two
RGBA8 coverage atlases require approximately 5.33 MiB of GPU memory including
mipmaps. The correction changes neither geometry nor batching: its cost delta is
zero triangles and zero draw calls.

The baker also rejects the long-root-line regression that made crossed cards
render as a dark X from steep cameras. At cutoff `0.35`, each 256 px cell is
limited to a `122 px` horizontal alpha run, a `76 px` top-down max-projected run,
and `0.70` top-down projected coverage. The manifest's
`alphaPolicy.rootLineValidation` records these bounds, every variant's measured
runs and coverage, the observed maxima, opaque-black-pixel count, and the
`continuousRootRibbonDetected` result.

## Deterministic generation and installation

Run from the repository root:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' `
  --background --factory-startup `
  --python tools\grass_material_baker\blender_bake.py -- `
  assets\public\pbr\grass_004 `
  tests\artifacts\grass_material_baker\grass_low_cut_maintained_v2_split
```

AI 358 reviews and captures this staged output without copying it into gameplay
assets. Gameplay import remains a later, explicitly scoped task. The recipe
writes source/license provenance, calibration, channel color spaces, both
deterministic seeds, palette derivation, mip measurements, byte counts, and
SHA-256 hashes. It saves the inspectable Blender file before resetting to an
empty factory scene; CLI output must report zero remaining objects and an empty
reset filepath.

Generated maps must not be retouched by hand. Any correction belongs in the
recipe followed by a full rebake and hash refresh.

## Downstream handoff

AI 359 and later corrective prompts consume this stable V2 identity and its two
separate atlas families. They may change density, orientation, LOD ownership,
edge placement, and budgets within their own contracts, but they must not invent
a second palette, restore runtime emissive lift, reuse one atlas family at the
other family's physical scale, repack V2 coverage into PBR alpha, or soften
grass/substrate occupancy into a color fade. This specification does not itself
authorize copying the staged V2 assets into the game.
