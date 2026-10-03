# Coastal City Terrain v2 import

AI576 D1 imports the user's designed coastal prototype as the retained landscape
`coastal-city`. It is proposed construction terrain, not survey data. The original
archive is read-only; the import never runs `build_terrain.py` or changes the
original files. The application has no runtime dependency on `downloads/`, a ZIP
decoder, Python, Blender, or an absolute source-machine path.

The schema and payload API are specified in [LANDSCAPE_MODEL.md](LANDSCAPE_MODEL.md).
The preparation command and publication policy live in
[`tools/bake_landscape/README.md`](../../tools/bake_landscape/README.md).
The standalone view is specified in [LANDSCAPE_VIEWER.md](LANDSCAPE_VIEWER.md).

## Source authority

The accepted archive is `coastal_city_terrain_v2.zip`, SHA-256
`21702aab6210e2b576666b3fd5a4b6d48884e0372447357bee10dd8ea3d463ce`.
`README.txt`, `terrain_settings.json`, and `validation.json` define its inspected
encoding and design assumptions. Import verifies the package digest before
unpacking any entry, checks ZIP entry sizes/CRC/path safety, and validates the
numeric metadata before creating a candidate.

| Source property | Preserved interpretation |
| --- | --- |
| Extent | X/Z each 0–4000 meters; southwest datum; X east, Y up, Z north. |
| Grid | 2049 by 2049 vertices; 2048 intervals; both outer boundary vertices included. |
| Native spacing | Exactly 1.953125 meters, independent of city tile size and rendered tessellation. |
| Row/column mapping | `x = column * 4000 / 2048`; `z = 4000 - row * 4000 / 2048`. Row zero is north. |
| Primary authority | `height_m_float32_le.raw`: 4,198,401 little-endian float32 meters, row-major, 16,793,604 bytes. |
| Height range | Actual source min −30, max 49.21965408325195 meters; no vertical exaggeration. |
| Alternate height image | 16-bit linear grayscale, `-30 + value/65535*90`; preserved as a reference, not used to partition heights. |
| Land cover | `landcover_ids.png`, grayscale uint8 IDs 0–7; losslessly decoded with no gamma or palette conversion. |
| Water | Separate sea-level reference Y=0; negative height remains seabed. Class zero is a source classification, not a replacement water plane. |
| Missing/outside values | Nonfinite source heights and undeclared classes fail import; zero is valid; outside queries report `outside` without clamping. |
| Preview OBJ | 257-square, 15.625-meter spacing reference only; never authoritative native elevation. |

The supplied raster has 1,114,596 negative-height samples and no exactly zero
samples. Synthetic contract tests explicitly preserve zero and negative zero;
an absent zero in this source does not change the no-data policy.

## Native chunks and bounded coverage

The native grid is partitioned into 8 by 8 chunks of 256 intervals/257 vertices.
Each covers 500 by 500 meters with IDs `l3/c0/r0` through `l3/c7/r7`; chunk rows
increase southward. Shared edges duplicate source values bit for bit, including
the boundary between height or cover regions. A native descriptor has stride 1,
zero geometric error and the exact local source min/max.

The covering root `l0/c0/r0` samples the aligned source at stride 8. It has 66,049
vertices, 131,072 triangles and 330,245 payload bytes (264,196 elevation plus
66,049 category bytes). Categories use selected native IDs and are never averaged
into invented classes. Root min/max encloses the full native source, including
extrema missed by the coarse vertices. Its geometry uses the model's NW-SE cell
diagonal and carries the measured vertical error bound.

All 4,198,401 native sample locations were compared against the root triangle
surface. Maximum deviation is **1.8092246055603027 meters**, RMS deviation is
**0.045207039208070635 meters**. The nested aligned triangulations make the
maximum vertex deviation a bound across the piecewise-linear surface. This is a
geometric height error, not a category-boundary or soil-accuracy guarantee.
Selection from the root remains provisional and unsuitable for exact editing.

Height and cover files are separate, headerless, uncompressed resources with
SHA-256 URLs, exact encoded/decoded byte lengths and revision keys. Native chunks
plus the root declare 21,465,925 channel bytes, including shared-edge duplication;
identical resources can share one stored file. The runtime startup contract is
the compact manifest plus only the root's two bounded channels. Source originals
and 64 native chunks are retained on disk without runtime residency. The viewer
separately applies its documented 32 MiB allocation-estimate cap.

D1 deliberately prepares levels 0 and 3. Native `parentId` references the root;
levels 1 and 2 may be inserted in D3 without changing native chunk identities.
This is partitioned authority and coarse coverage, not completed camera/zoom
streaming. Upsampling does not add measured or authored detail.

## Soil, cover and planning records

The class-to-soil mapping is explicit and independent of visual texture choice:

| Class | Imported meaning | Initial soil | Native count |
| --- | --- | --- | ---: |
| 0 | Water/seabed | `seabed` | 1,112,635 |
| 1 | Sand/beach | `sand` | 92,768 |
| 2 | Grass/low scrub | `loam` | 147,408 |
| 3 | Forest soil | `forest` | 2,067,193 |
| 4 | Exposed rock | `rock` | 30,499 |
| 5 | Urban ground | `unknown`, planning cover retained | 690,177 |
| 6 | Road surface | `unknown`, planning cover retained | 52,975 |
| 7 | Runway | `unknown`, planning cover retained | 4,746 |

The model catalog names existing ground PBR/biome bindings; D1 uses class colors.
Pavement/planning classes do not assert buried soil composition or construct
finished streets/runways. Water-depth/submerged queries use height relative to
sea level independently from these categories.

All 29 archived files (32,860,674 bytes) are retained verbatim under
`assets/public/landscape/coastal-city/source/<archive-sha256>/`. Each has its own
stable reference ID, role, hash, encoding, and byte length in the manifest:

- `districts.json` and `district_ids.png` preserve district identities, boundaries,
  target heights and actual terrain summaries.
- `roads.json` preserves approximate centerlines, widths, grades and source XYZ
  elevations. A later adapter must explicitly extract horizontal XZ without
  interpreting vertical Y as a city tile coordinate.
- `shoreline.json`, `beach_points.json` and `contours_5m.json` preserve shoreline,
  bus-stop reservation, level beach arrival, view corridor and contour records.
- `flat_urban_placement_mask.png` is advisory placement information, not a hard
  buildability certification; `slope_degrees_16bit.png` retains its linear degree
  encoding, and `water_mask.png` remains a distinct source reference.
- All eight `material_masks/` images, both preview maps, preview OBJ/MTL, water
  plane, original height/cover rasters, metadata and generator source remain
  separately available. None is interpreted as a placed game object.

`PROVENANCE.json` records the user-supplied origin and that no license is specified
in the supplied package. No survey origin or third-party license is invented.
Future source regeneration must use an explicit authoring/migration workflow and
preserve local revisions; the D1 importer only reproduces the authenticated base.

## Preparation and publication gates

`node tools/bake.mjs --target landscape/coastal-import --set
"landscape/coastal-import:source=<source.zip>"` selects only the Node CPU leaf.
Its optional `--publish` installs validated output at the canonical retained
directory. The domain is registered but excluded from `all`, so a source import
cannot trigger unrelated expensive bakes. It uses the shared configuration and
checkpoint machinery; no machine-specific standalone command is added.

Validation checks all 4,293,185 prepared samples (including duplicated borders
and root samples) against original float32 bits and class IDs. All 112 native
shared borders/28,784 border vertices match. It also validates reference hashes,
conservative envelopes, source range/checkpoints and overview error. Resources
are installed first and the current manifest switches atomically last. Failed
validation leaves the previous current manifest untouched. Identical reruns are
allowed; a changed/authored current manifest fails closed pending an explicit
migration. Original source files are never written.

The import produces deterministic manifest bytes and immutable payload names.
It incorporates source digest, preparation settings, importer/domain code, source
inputs and published-resource hashes into the framework's authenticated reuse
gate. The task receipt is
`tests/artifacts/screens/landscape/ai576/d1/import-validation.json`; framework
stage/checkpoint/log artifacts remain under its normal ignored AI556 directory.
Neither evidence path is a runtime asset or a tracked screenshot baseline.

## Source checkpoints and validation

| Checkpoint | Native row/column | World X/Z meters | Height meters |
| --- | --- | --- | ---: |
| Northwest | 0 / 0 | 0 / 4000 | −30 |
| Northeast | 0 / 2048 | 4000 / 4000 | 14.561012268066406 |
| Southwest | 2048 / 0 | 0 / 0 | −30 |
| Southeast | 2048 / 2048 | 4000 / 0 | 16.979928970336914 |
| Central low city | 1024 / 1024 | 2000 / 2000 | 17.86199951171875 |
| Beach arrival | 1818 / 604 | 1179.6875 / 449.21875 | 2.5999999046325684 |
| High city | 450 / 1800 | 3515.625 / 3121.09375 | 49.02638244628906 |

Focused tests cover all five PNG filters, grayscale precision/dimension/CRC
rejection, unsafe ZIP paths and source-hash rejection, exact native borders,
negative/zero heights, retained data and reference integrity, byte-identical
repreparation, corrupt publication refusal, authored-revision protection, scoped
CPU-only execution and importer-code checkpoint invalidation. Use the standard
selected-test runner with `landscape_import.test.js`,
`landscape_import_framework.test.js`, and the existing `bake_framework.test.js`.
