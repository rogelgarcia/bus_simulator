# Natural Maintained-Grass V2 Baker

`blender_bake.py` deterministically derives the V2 far-surface maps and two
physically framed cutout-atlas families from ambientCG Grass 004. It also writes
an inspectable Blender source and a provenance manifest with per-file SHA-256
hashes.

The bake intentionally treats the soccer-field reference as a density/cohesion
reference, not as a request for striped or uniformly short stadium turf. The
profile permits 25–75 mm grass, modest dry variation, and irregular silhouettes.

## Requirements

- Blender 5.2 or newer with its bundled NumPy
- the checked-in `assets/public/pbr/grass_004` source maps
- an empty or disposable output directory

The source package does not publish an authoritative physical tile size. The
far material therefore records 1.4 × 1.4 m as a calibrated project scale, not as
source-authored metadata.

## Run

Use a workspace-local staging folder while validating a new bake:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' `
  --background --factory-startup `
  --python tools\grass_material_baker\blender_bake.py -- `
  assets\public\pbr\grass_004 `
  tests\artifacts\grass_material_baker\grass_low_cut_maintained_v2_split
```

AI 358 validates this bake only from the workspace-local staging directory
`tests/artifacts/grass_material_baker/grass_low_cut_maintained_v2_split`.
Gameplay assets remain untouched; a later gameplay-import task owns any eventual
installation under `assets/public/pbr`. Do not hand-edit generated PNGs; change
the recipe and rebake so the manifest remains truthful.

The public Python entry point is
`bake_low_cut_grass_material_v2(source_dir, output_dir, reset_after=True)`.
The older `bake_low_cut_grass_material` name remains an alias. With reset enabled,
the function returns to an empty factory scene after saving the inspectable
source; the CLI response reports `resetObjects` and `resetFilepath`.

## Output contract

The far family is a seamless 1024 × 1024 PBR set:

- `far_basecolor.png`
- `far_normal_gl.png`
- `far_roughness.png`
- `far_ao.png`
- `far_height.png`
- `far_coverage.png`

The atlas families are each 1024 × 512, arranged as 4 × 2 variants with
256 × 256 px cells and a real 16 px zero-coverage gutter:

- `mid_cluster_{basecolor,normal_gl,roughness,ao}.png` and
  `mid_cluster_coverage.png` represent
  1.15 × 0.055 m per cell.
- `accent_clump_{basecolor,normal_gl,roughness,ao}.png` and
  `accent_clump_coverage.png` represent
  0.24 × 0.075 m per cell.

The atlas RGB palette is derived from the corrected far base color. Base color is
baked through a colorimetric emission pass solely to capture albedo without
lights; this is not runtime emissive and the manifest requires runtime emissive
intensity `0`. Base color, normal, roughness, and AO are independent, fully
opaque PBR images. Cutout coverage is stored only in the separate grayscale
coverage PNG; the runtime binds that texture as `alphaMap` and samples its green
channel.

Atlas coverage is tested after repeated box-filter downsampling for runtime mip
levels 0–7 at cutoff 0.35. Every variant must retain coverage at every declared
level or the bake fails. Within each atlas cell, the baker deterministically
fills every PBR RGB texel from the nearest source texel that is opaque in the
reference coverage mask. This full-cell nearest-opaque conditioning never
crosses a cell boundary and does not alter the separate coverage image or its
declared 16 px zero-coverage gutter.

V2 atlas consumers bind the separate coverage image as `alphaMap` and remap its
`vAlphaMapUv` with the same per-instance atlas-cell transform used by the PBR
maps. PBR color is never recovered by dividing by alpha. Runtime uses trilinear
mip filtering and alpha-to-coverage when multisampling is available. Historical
V1 atlases retain their packed-alpha fallback.

The V2 card normal policy uses `worldUpBlend: 1.0`, and card materials keep
emissive intensity at `0`. Atlas geometry has no per-vertex `color` attribute,
so its material must use `vertexColors: false`; instanced `instanceColor`
brightness variation remains active independently. The split coverage contract
adds one texture sample to each card material and approximately 5.33 MiB of GPU
memory for the two RGBA8 coverage atlases including mipmaps. It adds no triangles
and no draw calls.

`asset.manifest.json` is the authoritative machine-readable contract. It records
the source and license, calibration, profile and bake seeds, physical dimensions,
palette derivation, mip measurements, channel color spaces, byte counts, and
SHA-256 hashes. `grass_low_cut_maintained_v2.blend` retains all deterministic
blade geometry and bake metadata for inspection.
