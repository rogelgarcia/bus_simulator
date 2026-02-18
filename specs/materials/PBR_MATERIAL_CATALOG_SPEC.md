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

---

## 2. Material classes (Phase 1 list)

Each PBR entry must be assigned to exactly one `classId` from this first-pass list:

- `asphalt` — road-like asphalt surfaces
- `concrete` — concrete walls/surfaces
- `brick` — brick and brick-like masonry
- `plaster_stucco` — plaster/stucco/painted plaster
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
  }
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
