# PBR Material Catalog Spec (Phase 1)

Status: **Implemented (Phase 1)**  
Scope: Catalog-first PBR surface materials (buildings + terrain) for Three.js rendering.

This spec defines the canonical, data-driven format for PBR materials in this repo and how tools/UI present them by **material class** (asphalt, concrete, brick, etc.).

---

## 1. Source of truth

Rule:
- Every texture set folder under `assets/public/pbr/` must have a per-folder config module that defines its catalog entry.

Canonical files:
- Per material entry: `assets/public/pbr/<slug>/pbr.material.config.js`
- Catalog collector/index: `assets/public/pbr/_catalog_index.js`
- Runtime adapter (URL resolution + helpers): `src/graphics/content3d/catalogs/PbrMaterialCatalog.js`

Notes:
- `assets/public/pbr/_manifest.json` is **not** the runtime source of truth. It may still exist for download/probe/asset tooling.
- Where a branch tracks the catalog (`_catalog_index.js` and the per-material `pbr.material.config.js`, `pbr.material.correction.config.js` and `pbr.landscape.config.json` files), they are ordinary Git content, never Git LFS pointers: `.gitattributes` lifts the `assets/public/**` LFS rule for exactly these paths and keeps their bytes unconverted (`-text`), because landscape appearance provenance records each config by SHA-256. Texture images stay out of Git. `tests/node/unit/pbr_config_storage.test.js` guards this.
- `pbr.forest_ground_06` is a ground-eligible surface entry for Poly Haven's CC0
  Forest Ground 06 (Charlotte Baglioni). Its official 2K diffuse JPG, OpenGL normal
  PNG and packed ARM PNG live under `assets/public/pbr/forest_ground_06/`, with
  source URLs/checksums and license provenance. The catalog tile width is 2.1 m;
  Grass Debug v2 uses an explicit local 2.5 m repeat to match Planter. The shared
  catalog entry is used by ground pickers and the debug scene without embedded
  HTML texture payloads or a second copy of the texture set.
- `pbr.brown_mud` (Brown Earth) is a ground-eligible surface entry for Poly Haven's
  CC0 Brown Mud by Rob Tuytel. Official, unmodified 4K diffuse JPG, OpenGL normal
  PNG and packed ARM PNG are stored under `assets/public/pbr/brown_mud/`, with
  source metadata, URLs, verified MD5 checksums and SHA-256 hashes. Its physical
  tile width is 1.3 m. Grass Debug v2 exposes it beside the two previous substrates;
  the detailed leaf study uses it to replace the coarse forest-floor debris with
  finer bare earth. The existing local 3D soil lip shares this same material.

---

## 2. Material classes (Phase 1 list)

Each PBR entry must be assigned to exactly one `classId` from this first-pass list:

- `asphalt` — road-like asphalt surfaces
- `concrete` — concrete walls/surfaces
- `brick` — brick and brick-like masonry
- `plaster_stucco` — plaster/stucco/painted plaster
- `cloth` — textile/fabric/leather-like materials
- `stone` — stone/rock walls and stone masonry
- `metal` — corrugated/plates/shutters/cladding (metal-like)
- `roof_tiles` — roof tile surfaces
- `pavers` — paving stones/pavers/crosswalk bricks
- `grass` — grass surfaces (non-ORM sets)
- `ground` — sand/gravel/dirt/rocky terrain ground

UI ordering:
- UIs should present classes in a consistent, human-friendly order (not alphabetical).

---

## 3. Catalog entry schema

Each folder config module exports a single entry object:

```js
export default {
  materialId: 'pbr.<slug>',
  label: 'Human Label',
  classId: 'asphalt',
  root: 'wall', // or 'surface'

  // Usage flags (Phase 1)
  buildingEligible: true,
  groundEligible: false,

  // Default tiling (meters per repeat in UV-space meters)
  tileMeters: 4.0,

  // Optional resolution metadata (defaults to 1k when omitted)
  preferredVariant: '1k',
  variants: ['1k'],

  // Filenames (relative to the folder)
  mapFiles: {
    baseColor: 'basecolor.jpg',
    normal: 'normal_gl.png',
    orm: 'arm.png',
    // Optional for non-ORM sets:
    // ao: 'ao.png',
    // roughness: 'roughness.png',
    // metalness: 'metalness.png',
    // displacement: 'displacement.png',
  },

  // Optional exhaustive image inventory for tooling/debugging.
  // Structured full-path map inventory under assets/public/pbr/<slug>/.
  allMapFiles: {
    baseColor: 'assets/public/pbr/<slug>/basecolor.jpg',
    normal: 'assets/public/pbr/<slug>/normal_gl.png',
    orm: 'assets/public/pbr/<slug>/arm.png',
    // Optional keys when present:
    // ao, roughness, metalness, displacement, height, normalDx
    variants: {
      // Any additional image files not part of canonical slots.
      // Key is a stable slug derived from filename.
      '<variant_key>': 'assets/public/pbr/<slug>/<file_name>'
    }
  },

  // Placeholder for future normalization metadata (Phase 1 keeps it informational)
  normalization: {
    notes: '',
    albedoNotes: '',
    roughnessIntent: ''
  },

  // Optional calibration-only metadata consumed by Material Calibration tool.
  calibration: {
    // UV texture rotation in degrees, applied in calibration view only.
    uvRotationDegrees: 0
  },

  // Optional provenance record: where the texture set came from.
  // Passed through verbatim by the runtime adapter and readable via
  // getPbrMaterialMeta(materialId).provenance.
  provenance: {
    schema: 'bus-simulator.pbr-material-provenance',
    version: 1,
    source: {
      asset: 'Human description of the source set',
      url: 'https://...',   // null when there is no public page
      license: 'CC0 1.0',
      archive: 'downloads/<source>.zip'   // when imported from an archive
    },
    generation: {
      tool: 'Blender 5.2.0 LTS',          // or the generator, e.g. 'ChatGPT (OpenAI)'
      recipe: 'tools/<baker>/run.mjs',    // when produced by a repo script
      seed: '<deterministic seed>',       // when the recipe is seeded
      lightingInBaseColor: false,
      prompts: 'assets/public/pbr/<slug>/generation_prompts.json', // or null
      readme: 'assets/public/pbr/<slug>/README.txt'
    },
    importedOn: 'YYYY-MM-DD'
  },
};
```

Field rules:
- `materialId` must be stable, unique, and start with `pbr.`.
- `label` is user-facing and should be short.
- `classId` must be one of the classes listed above.
- `root` is either `wall` or `surface` and is used for defaults and filtering.
- `tileMeters` must be a positive number.
- `mapFiles.baseColor` and `mapFiles.normal` are required.
- Either `mapFiles.orm` **or** one or more of `ao/roughness/metalness` must be provided.
- `allMapFiles` is optional and may include every image file path in the material folder for tooling/auditing.
- `normalization` is optional and may contain placeholders (strings) until later phases enforce validation.
- `calibration` is optional and currently supports `uvRotationDegrees` (used only by the Material Calibration tool).
- `provenance` is optional and records where the set came from. The adapter passes the object through unchanged, so the sub-keys are a convention rather than a validated schema. The `schema` / `version` / `source.{asset,url,license}` / `generation.{recipe,tool,seed,lightingInBaseColor}` keys follow the grass asset families in `src/graphics/content3d/catalogs/LowCutGrassMaterialCatalog.js`, which were the first entries to carry `provenance`; `source.archive`, `generation.{prompts,readme}` and `importedOn` were added for sets imported from a downloaded archive. Grass entries additionally carry bake-specific keys — extra domain keys are fine, but keep the shared ones named as above so entries stay comparable. Populate `provenance` for any set not authored in-repo, and always for third-party or AI-generated sets, where the licensing position has to stay auditable. Do not invent a `license`: copy it from the source, or state that it is unspecified.
- Calibration-only catalog entries are allowed by setting both `buildingEligible` and `groundEligible` to `false`.
- Calibration-only entries may reuse another material folder by using relative `mapFiles` paths (for example `../plastered_wall_02/basecolor.jpg`) and must not duplicate texture assets.

Color space conventions:
- `baseColor` is sRGB.
- all other maps are linear/data.

Texture format conventions:
- `baseColor` / `albedo` / `diffuse` / `emissive` should default to `.jpg` (use `.png` only when alpha/cutout is required).
- Data maps should use `.png`:
  - `normal` (`normal_gl` / `normal_dx`)
  - packed maps (`orm` / `arm`)
  - scalar maps (`ao`, `roughness`, `metalness`, `displacement`, `height`)
  - masks (`opacity`, `alpha`, and other mask maps)
- If both `.jpg` and `.png` exist for the same map role, keep the preferred format above and remove the duplicate format.

---

## 4. UI picker grouping rules

Material selection UIs must be **class-grouped**, not a single flat “PBR” list:
- Pickers render one section per `classId` (labelled by class).
- For building walls, show only `buildingEligible` entries (typically `root: wall`).
- For terrain/ground selection, show only `groundEligible` entries (typically `root: surface`).
- Inspector/debug tooling must not expose basecolor-only wall texture collections that overlap with catalog materials (example: legacy “Building Walls”).

---

## 5. Global Runtime PBR Pipeline Contract (AI 349)

Runtime PBR consumers must resolve catalog materials through the shared pipeline:
- `src/graphics/content3d/materials/PbrTexturePipeline.js`
- `src/graphics/content3d/materials/PbrTextureCalibrationResolver.js`

Resolution/value precedence is fixed:
1. catalog defaults (`tileMeters` and baseline scalar defaults),
2. cached calibration overrides from `pbr.material.correction.config.js`,
3. caller-local overrides (explicit opt-in).

Notes:
- URL/map-slot resolution remains catalog-driven via `resolvePbrMaterialUrls(materialId)`.
- Calibration files are treated as session-cached inputs; edits are picked up on next app load/restart.
- Diagnostics for resolved values should expose per-field source (`catalog`, `calibration`, `local`) to aid debugging.

Landscape appearance streaming retains these same IDs and the complete catalog
metadata closure. Its independently hashed32/128/512 baseColor/normal/ORM pages
are derivatives of catalog map slots; they do not introduce a separate material
registry or change calibration precedence. The renderer uses the shared pipeline
to resolve tile scale/calibration and admits only the required retained page
tier instead of loading original full map URLs. The page/schema/source contract
is in [LANDSCAPE_APPEARANCE.md](../landscape/LANDSCAPE_APPEARANCE.md).
