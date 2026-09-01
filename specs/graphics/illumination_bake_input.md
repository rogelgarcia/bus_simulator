# Resolved-City Illumination Bake Input

## Status and authority

This document is the authoritative resolved-city contract established by AI 528 and revised by AI 531 for extracting the fully resolved gameplay city and handing it to the offline illumination pipeline. It refines, but does not replace, [`illumination_framework.md`](./illumination_framework.md). If the two documents conflict, the framework owns lighting composition, channel meaning, coordinate conventions, and descendant ownership; this document owns the resolved-city interchange format, stable identity, provenance, canonical serialization, source freshness, and round-trip validation.

The canonical semantic format ID is `bus-sim-illumination-bake-input-v2`. Its file extension is `.bsib`. V2 adds authenticated effective static-sun caster sidedness and evaluated material flags. The low-level `ILBSRC01` container framing, fixed header version `1`, table schema, and hash framing remain byte-compatible infrastructure; semantic V1 manifests are rejected by V2 consumers. A valid package is a deterministic custom container containing one canonical manifest and its declared binary buffers. It is derived from a fully prewarmed production gameplay city constructed from the active gameplay configuration and is never an authored source of city truth. The already-running city supplies configuration and evaluated lighting-profile provenance, but its geometry is not the canonical export input because optional ornament preload can complete after that city's synchronous construction.

AI 528 does not run Blender, bake lighting, create runtime illumination payloads, change gameplay rendering, select player-visible illumination modes, or replace the current renderer. AI 529 consumes this format as offline compiler input. AI 530 owns any runtime-oriented binary container, compression, streaming, or activation logic.

## Why GLB is not the canonical package

The stable-byte and round-trip format evaluation rejects GLB as the canonical package. A normal Three.js-to-GLB export may reorder nodes, accessors, material records, images, extension records, or JSON keys; may expand or normalize attributes and instancing; and may change integer widths, interleaving, image representation, or metadata between exporter versions. Standard GLB material fields also cannot faithfully carry this project's stable IDs, source provenance, receiver/caster mappings, `mergeShadowAsOpaque`, channel relevance, custom bake semantics, structured unsupported cases, or independent source-hash domains. Importing that GLB through Blender would consequently prove visual interchange, not exact recovery of the evaluated runtime source.

The custom `.bsib` container preserves the exact declared typed attribute bytes, accessors, material groups, per-instance identities, transforms, texture source bytes, alpha semantics, and mappings. Its canonical manifest and fixed binary layout make whole-package stable bytes testable. A GLB may be produced later as an optional diagnostic preview derived from a successfully validated `.bsib` package. Such a GLB is never authoritative, is excluded from all freshness hashes, and may not be consumed by AI 529 in place of the `.bsib` package.

## Canonical/derived boundary

The canonical bake source is:

1. a fresh production gameplay city constructed after bake-relevant prerequisites have resolved and then fully prewarmed to readiness;
2. the explicit source-selection and caster/receiver policy;
3. the named lighting profiles and per-channel bake configurations; and
4. versioned compiler-configuration references.

The `.bsib` file, any diagnostic GLB, Blender objects, `.blend` files, bake images, atlases, depth tiles, and runtime payloads are derived. Neither incidental traversal/completion order, Three.js UUIDs, a Blender object name, a file timestamp, nor an artifact filename may create canonical identity. A producer-owned array position may contribute only where this document declares that ordering contract explicitly.

Freshness and integrity are separate:

- Freshness hashes identify the resolved source and the inputs relevant to each physical channel.
- Integrity hashes verify every stored buffer blob and the package bytes. The package-integrity digest transitively authenticates the exact manifest and internal-table bytes; the current format has no separate manifest-digest field.
- A matching integrity hash does not prove freshness, and a matching source hash does not prove intact package bytes.

## Container layout

All header integers and all numeric typed buffers are little-endian. Hashes use domain-separated SHA-256. Lengths and offsets are unsigned 32-bit byte counts in low-level container version 1; an exporter must reject a package that exceeds that range instead of truncating it.

### Fixed 64-byte header

The container schema is `bus-simulator/illumination/bake-source-package/v1`. Its 64-byte header is a 32-byte preamble followed by a 32-byte package-integrity digest:

| Offset | Size | Type | Field | Required value or meaning |
|---:|---:|---|---|---|
| 0 | 8 | bytes | `magic` | ASCII `ILBSRC01` |
| 8 | 2 | `u16` | `version` | `1` |
| 10 | 2 | `u16` | `flags` | `0`; unknown bits are rejected |
| 12 | 4 | `u32` | `manifestByteLength` | Exact canonical UTF-8 manifest length |
| 16 | 4 | `u32` | `bufferTableByteLength` | Exact canonical UTF-8 internal-table length |
| 20 | 4 | `u32` | `payloadByteLength` | Exact binary payload length |
| 24 | 4 | `u32` | `bufferCount` | Number of logical buffer IDs |
| 28 | 4 | `u32` | `uniqueBlobCount` | Number of content-deduplicated payload blobs |
| 32 | 32 | bytes | `packageIntegrity` | Domain-separated digest of the 32-byte preamble followed by the complete body |

The body is exactly `manifest || internal buffer table || payload`, with no alignment padding, trailing data, timestamp, host name, absolute path, random UUID, or exporter banner. The three lengths in the preamble determine the boundaries, and their sum plus 64 must equal the exact file length.

### Canonical internal buffer table

Storage metadata is deliberately separate from the semantic `manifest.buffers` inventory so content deduplication cannot change semantic identity. The internal table has schema `bus-simulator/illumination/bake-source-buffer-table/v1` and this exact shape:

```text
{
  schema,
  blobs[]: { byteLength, offset, sha256 },
  buffers[]: { blobIndex, id }
}
```

Logical `buffers` are sorted by stable `id`. Each non-negative `blobIndex` selects one `blobs` entry. Blobs are deduplicated by byte content, sorted by the digest calculated with `bus-simulator/illumination/bake-source/buffer-integrity/v1`, and stored contiguously in that order. Blob `offset` is relative to the start of the payload; the first is zero, each next offset equals the prior offset plus length, and the last ends exactly at `payloadByteLength`. The byte-level parser rejects missing or duplicate IDs, invalid indices, gaps, overlap, trailing bytes, malformed digests, unreferenced blobs, or count mismatches.

The semantic `manifest.buffers` records remain ID-sorted and declare each buffer's `id`, `kind`, `encoding`, role-specific content digest, and exact byte length. Component/accessor meaning is declared by the geometry, texture, or profile record that references the buffer. Storage offsets and blob indices are not source identity and occur only in the internal table. A semantic content digest can use a role-specific domain and is distinct from the internal table's buffer-integrity digest. Typed-array producers serialize multi-byte elements in little-endian order. They do not weld, reindex, normalize, round, quantize, compress, transcode, or regenerate evaluated geometry data. A `raw_source` buffer preserves its declared source bytes.

### Integrity calculation

Integrity is calculated in this order:

1. Serialize every final logical buffer and calculate its SHA-256 digest with `bus-simulator/illumination/bake-source/buffer-integrity/v1` for storage deduplication and verification.
2. Deduplicate identical bytes, create the canonical internal table, and concatenate its hash-sorted unique blobs.
3. Canonicalize the complete semantic manifest and the internal table independently.
4. Create the 32-byte preamble from their exact byte lengths and the payload length.
5. Calculate `packageIntegrity` over `preamble || manifest || table || payload` using `bus-simulator/illumination/bake-source/package-integrity/v1`.
6. Assemble `preamble || packageIntegrity || manifest || table || payload` without changing any body byte.

Verification repeats the same domain-separated digest over the stored preamble and body, then verifies every unique blob against the digest declared by the table. The integrity digest is not included in the hashed bytes, avoiding self-reference. The header stores the 32 raw digest bytes; table and report digests use lowercase hexadecimal. AI 528 reports `packageSha256`, the digest of the complete final file under `bus-simulator/illumination/bake-source/final-file/v1`; it is additional to, and does not replace, the header integrity digest.

## Canonical manifest encoding

The manifest and internal table use the project's strict canonical JSON encoding: UTF-8 with no BOM, indentation, trailing newline, comments, or insignificant whitespace. The encoder has these boundary rules:

- Object keys are emitted by the canonical comparator used by JavaScript relational string comparison (`left < right`), that is, lexicographic UTF-16 code-unit order with no locale collation.
- Numbers are finite IEEE-754 binary64 and use the ECMAScript shortest round-trippable representation.
- Negative zero is normalized to `0` before serialization.
- String values are serialized exactly with `JSON.stringify`; the canonicalizer does not silently normalize Unicode. ID-producing adapters perform any required NFC normalization before canonicalization.
- `NaN`, infinities, `undefined`, functions, symbols, `BigInt`, cycles, array holes, array custom properties, symbol-keyed properties, accessors, non-enumerable data properties (other than intrinsic array `length`), and non-plain host objects are rejected rather than omitted, invoked, or coerced.
- Arrays preserve semantic order unless this document declares them ID-sorted.
- On read, parsing and canonical reserialization must reproduce the original manifest bytes exactly.

All inventory arrays are sorted by stable `id`: `categories`, `chunks`, `roots`, `objects`, `geometries`, `meshInstances`, `materials`, `textures`, `alphaInputs`, `participantMappings`, `receiverMappings`, `casterMappings`, `lightingProfiles`, `channelProfiles`, `compilerReferences`, and `buffers`. Geometry groups remain in source draw order, and ordered geometry topology is never sorted.

The required top-level shape is:

```text
format
schemaVersion
containerVersion
coordinateContract
colorContract
source
extractorContract
readiness
categories[]
chunks[]
roots[]
objects[]
geometries[]
meshInstances[]
materials[]
textures[]
alphaInputs[]
participantMappings[]
receiverMappings[]
casterMappings[]
lightingProfiles[]
channelProfiles[]
compilerReferences[]
buffers[]
hashes
```

`format` is exactly `bus-sim-illumination-bake-input-v2`, `schemaVersion` is `2`, and semantic `containerVersion` is `{ "major": 2, "minor": 0 }`. This semantic container version is distinct from the fixed low-level header version `1`. Missing or additional top-level keys reject the package. A consumer must likewise reject enum or nested-record values it does not implement; unversioned extension fields are not permitted.

There are deliberately two parser scopes. `parseBakeSourcePackage` is the reusable byte-container parser: it validates the fixed header, package integrity, canonical manifest/table encoding, exact internal-table shape, sorted unique logical-buffer IDs, contiguous hash-sorted blobs, and blob integrity. It accepts any canonical JSON object as the manifest and does not claim that object is an AI 528 resolved-city manifest. It neither requires nor correlates a semantic `manifest.buffers` array. `validateResolvedCityBakePackage` is the AI 528 semantic parser: it additionally enforces the exact top-level inventory, semantic `format`/`schemaVersion`, ID-sorted unique inventories, semantic-buffer ID/length correlation, core foreign keys, accessor ranges, geometry counts/bounds/topology, and Three-to-Blender transforms. Role-specific `contentSha256` fields are semantic projection inputs, not aliases of the internal storage digest. AI 529 must call the semantic validator, not treat a successful low-level parse as sufficient source validation.

## Stable identity

### Package-level validity and semantic derivation

At the reusable container layer, a stable ID is an opaque non-empty string with no surrounding whitespace and no C0 or DEL control character. The container does not impose a slash-only grammar: current V2 semantic IDs intentionally use both `/` and `:`. IDs and inventory records are compared with the same canonical JavaScript string comparator used for object keys. This distinction is important: `parseBakeSourcePackage` validates table identity, while `validateResolvedCityBakePackage` and the exporter own namespace semantics.

ID-producing adapters normalize source text to NFC before deriving IDs. When an arbitrary source value is embedded in a slash path, each path segment preserves ASCII letters and digits plus `.`, `_`, and `-`, and percent-encodes every other UTF-8 byte with uppercase hexadecimal. Already-defined producer root IDs remain opaque and may contain `:`. Three.js UUIDs, object allocation order, promise-completion order, browser origin/port, timestamps, and artifact filenames never enter identity.

Source-owned roots, objects, and instances use semantic identity. Evaluated immutable records—geometry descriptors, geometry buffers, material semantics, texture sources/bindings, alpha inputs, and profile assets—are deliberately content-addressed. A content-addressed record gets a new ID when its declared semantic content changes; stable source-to-content references preserve ownership. `contentHash` on an object or instance is freshness evidence and is not its semantic ID.

The V2 exporter emits these exact forms:

| Entity | V2 ID form and derivation |
|---|---|
| City | `source.cityId` is the resolved gameplay city ID; there is no redundant city inventory record |
| Category | `category/<encoded-category>` for each category actually represented by an exported object |
| Chunk | `chunk/<encoded-category>/<signed-cell-x>/<signed-cell-z>`; each signed cell is `p` or `n` plus a decimal magnitude padded to at least eight digits, using the centre of the world AABB and a 128-metre V2 grid |
| Root | Producer/root-adapter ID, including `terrain:city_floor`, `terrain:ground_tiles`, `road:<token>`, `sidewalk:building_slabs`, a resolved building metadata ID or `building:<token>`, and placement-backed traffic/tree IDs |
| Object | `object/<encoded-root-id>/<semantic-path>` |
| Geometry | `geometry/<evaluated-geometry-descriptor-sha256>` |
| Mesh instance | `<object-id>/instance/base` for `Mesh`, or `<object-id>/instance/<eight-digit-source-index>` for `InstancedMesh` |
| Material | `material:<material-semantics-sha256>` |
| Texture source | `texture-source:<texture-source-sha256>` |
| Texture binding | `texture-binding:<texture-binding-sha256>` |
| Alpha input | `alpha-input/<alpha-input-sha256>` |
| Participant mapping | `participant/<mesh-instance-id>/group/<four-digit-group-index>` |
| Receiver mapping | `receiver/<mesh-instance-id>/group/<four-digit-group-index>` |
| Caster mapping | `caster/<mesh-instance-id>/group/<four-digit-group-index>` |
| Lightmap mapping | `lightmap/<mesh-instance-id>/group/<four-digit-group-index>`; stored on its receiver record for AI 533 |
| Geometry buffer | `buffer/<evaluated-geometry-buffer-sha256>` |
| Texture-source buffer | `<texture-source-id>:bytes` |
| Exact texture-coverage buffer | `<texture-source-id>:coverage:<r|g|b|a>` |
| Lighting-profile asset buffer | `profile-asset/<profile-asset-sha256>` |

The current root adapters report `buildings`, `roads`, `road_markings`, `curbs`, `sidewalks`, `terrain`, `traffic_controls`, and `trees_foliage` when those categories contain exported objects. An empty category has no placeholder inventory record. Every object has exactly one reporting category. Category classification does not create caster or receiver eligibility; evaluated semantic records do.

An object's semantic path is `root` when the mesh is the selected root. Otherwise each segment is the zero-padded eight-digit index in the producer-owned `parent.children` array, a hyphen, and the encoded normalized object name/type. This evaluated graph ordering contract is part of the resolved source and is checked by repeated clean export. Placement-backed traffic and tree roots use their synchronous resolved placement index when no stronger runtime metadata ID exists; they never use asynchronous completion order.

Spatial chunks are reporting, budgeting, and downstream-addressing partitions only. They do not authorize independent chunk freshness, partial promotion, streaming, or incremental rebuilding. Full-city invalidation remains V2 policy until a later specification supplies a dependency and seam model.

### Provenance and reference chain

Provenance is distributed across the typed records rather than forced into one synthetic object shape:

- a root record carries non-empty adapter-produced `provenance` (source kind/ID and, where applicable, the canonical placement or building source record) plus `visibilityPolicy`, which is either `ignore_camera_pvs_root_visibility` for PVS-controlled source roots or `respect_evaluated_root_visibility` for feature-toggle roots;
- an object records `rootId`, `semanticPath`, `sourceKind`, and the matching provenance tuple;
- a geometry records its content identity and ID-sorted `objectIds`; a mesh instance records object/root/category/chunk references and source index;
- a material carries evaluated Three.js type/name provenance and a complete semantic record; texture source and binding records carry source/content and sampling identities; an alpha input references its material and texture bindings;
- participant, receiver, and caster mappings reference the mesh instance, object, geometry, material, alpha input, group, category, and chunk needed to recover ownership.

Together these foreign keys must form a complete source-to-derived chain. Absolute filesystem paths, build timestamps, random UUIDs, and the local browser server origin are prohibited canonical inputs. Same-origin texture URLs are reduced to project paths; an external URL, when explicitly supported, remains the source identity. Shared content-addressed geometry, materials, textures, and buffers have one canonical record referenced by all consumers; references do not clone identity. A derived shadow-merge helper is excluded as an independent source object and its original sources remain authoritative.

## Resolved scene and readiness

The exporter loads the production gameplay city through the existing browser/Playwright path so it inspects the same Three.js revision and evaluated generators as gameplay. Adding a duplicate Node-side Three.js dependency is outside V2. It first resolves portal-ornament and active-city readiness, snapshots the active configuration and evaluated lighting-profile provenance, and only then constructs the fresh city used for canonical extraction.

Export begins only after all of the following are true:

1. the intended gameplay state and active city exist and the game loop is paused for tool extraction;
2. portal-ornament preload and the active city/world or tree readiness promise have resolved;
3. a fresh production `City` has been constructed from the snapshotted active configuration;
4. that fresh city's building texture provider `waitForReady()` contract, when present, and its city/world or tree readiness promise have resolved;
5. the fresh city's synchronous resolved tree-placement count equals its instantiated tree-wrapper count;
6. every used texture passes readiness inspection for source presence, image decode/dimensions, and known generated-atlas pending/failure flags for three consecutive animation frames;
7. every required texture has stable readable source bytes or supported deterministic pixel storage;
8. camera-relative shadow-culling state is not treated as source eligibility, and `updateWorldMatrix(true, true)` has completed immediately before extraction.

The three stable texture passes supplement the declared subsystem promises; they do not turn completion order into identity. Failure to converge before the timeout raises `async_source_timeout`, and a tree count disagreement raises `async_tree_inventory_mismatch`. The manifest records the readiness schema, expected tree count, observed stable-pass count, lighting-profile source readiness, and whether the freshly constructed city's canonical source record matched the active city's canonical source record. That equality is configuration/provenance equality, not a claim that geometry from the already-running city was exported. Elapsed readiness time is report-only and does not enter the manifest.

The exporter canonicalizes the resolved source record before and after extraction. A difference raises `source_mutated_during_export`. Sorting makes asynchronous completion order irrelevant; sorting may not conceal missing or duplicate entities.

Sky domes, lights used only for live rendering, camera helpers, origin axes, tile-grid lines, debug objects, the dynamic bus, color-PVS state, and camera-relative shadow-culling state are excluded unless an explicit later source-profile revision names them. Their exclusion is reported, not silently inferred.

## Evaluated Three.js geometry

### Geometry and accessors

Each geometry record declares:

- content-addressed geometry ID and `contentHash`;
- topology mode, which is `triangles` in V2;
- required `position` accessor;
- optional `normal`, `tangent`, `uv`, `uv1`, color, and named custom bake accessors;
- optional index accessor;
- ordered material groups and draw range;
- exact local counts and local bounds;
- ID-sorted referencing `objectIds`; instances reach the geometry through their object and explicit `geometryId`.

An accessor declares `bufferId`, `byteOffset`, `componentType`, source `arrayType`, `itemSize`, `count`, `normalized`, `interleaved`, and `byteStride`. It describes the evaluated Three.js `BufferAttribute` or `InterleavedBufferAttribute`. The exporter deterministically re-encodes the selected typed-array elements in little-endian order while preserving component type, values, interleaved stride/offset, and active capacity; that endian normalization is not quantization or geometry regeneration. Multiple accessors may reference one content-deduplicated buffer. `position` is normally `f32`; indices retain their evaluated unsigned width. Indices are scalar and non-normalized. Accessor ranges must fit inside the referenced buffer, strides must be valid, and every referenced vertex index must be in range.

After the declared little-endian typed-array encoding, the exporter preserves component values and widths, normalized flags, interleaving, vertex order, index order, counter-clockwise front-face winding, draw range, and material-group order exactly. It does not weld vertices, generate indices, recompute normals or tangents, triangulate non-triangle primitives, flip UVs, or remove degenerate data. Non-finite attributes, out-of-range indices, incompatible group ranges, and degenerate triangles fail validation. Unused capacity outside an attribute's declared active backing view is not exported.

Normals are required for a receiver. Tangents are required when a selected channel declares tangent-dependent input. Every selected UV set and custom bake attribute is exported by semantic name. Morph targets, skeletons, active deformation, GPU-only generated vertices, sparse accessors, unsupported primitive modes, and unresolved modifiers fail with a structured unsupported-feature error rather than being approximated.

### Instancing and transforms

Shared geometry is stored once. Every ordinary `Mesh` has one mesh-instance record with instance key `base`. Every live `InstancedMesh` instance has its own mesh-instance record, material-slot references, source provenance, and `sourceIndex`. V2 uses that zero-padded index in the producer-owned `InstancedMesh.instanceMatrix` order as the instance key. The active count is validated against matrix capacity and dormant capacity is omitted; asynchronous child traversal never supplies the index.

Three.js `matrixWorld` after the final world-matrix update is authoritative. For an instanced mesh:

```text
M_three_world_instance = object.matrixWorld * instanceMatrix
```

Matrices are 16 finite IEEE-754 binary64 values in Three.js column-major element order. They are not decomposed to translation/rotation/scale for authority. A V2 transform must be affine, nonsingular, and have a positive determinant for its linear 3x3 portion. Perspective, singular, non-finite, or negative-determinant transforms are rejected. A later format may add the framework-approved geometry normalization for negative determinants; V2 never passes one ambiguously.

The fixed Three.js-to-Blender basis is:

```text
C = [ 1  0  0  0
      0  0 -1  0
      0  1  0  0
      0  0  0  1 ]

M_blender = C * M_three * inverse(C)

Blender.x =  Three.x
Blender.y = -Three.z
Blender.z =  Three.y
```

One world unit is one metre. The live city origin is retained and map-origin metadata is recorded; recentering is forbidden. Positions transform with `C`. Normals use the inverse-transpose of the complete linear transform and are renormalized. Tangent XYZ follows the normal-space conversion, while tangent `w` is preserved because `det(C) = +1`. Logical UV origin remains lower-left and no V flip occurs in the bake-input package.

Each mesh-instance record stores `matrixThreeWorld`, `matrixBlenderWorld`, world bounds in both bases, determinant, object/root/category/chunk identity, and geometry/material references. Receiver and caster mappings reference the instance rather than duplicating reverse-reference arrays on it. Recomputing `matrixBlenderWorld` from `matrixThreeWorld` must reproduce its stored binary64 values under the documented operation order.

### Runtime shadow helpers

Color-PVS visibility and `ShadowCasterCulling` are transient camera optimizations and are never canonical caster inputs. The exporter resolves the declared caster state before those transient systems mutate `castShadow`.

Meshes marked `userData.isShadowCasterMerge` (or carrying the equivalent geometry/material flag) are derived current-renderer draw optimizations. They are excluded as independent source objects so their duplicated geometry cannot enter freshness twice, and the inventory reports the excluded proxy count. The original source meshes supply geometry and provenance. The exporter resolves their caster eligibility from the city's shadow-merge, instanced-caster, and shadow-culler ownership records before falling back to the evaluated source mesh flag; it does not trust the derived proxy's momentary boolean.

Optional instanced-detail shadow policy and every source opt-out are explicit profile fields and hash inputs. A runtime helper with no complete source mapping fails with `caster_provenance_missing`.

## Materials, textures, and alpha

### Material semantics

Materials are semantic bake records, not serialized shader programs. Each used material record includes, when applicable:

- semantic-record schema and evaluated Three.js material class/model; the adapter/version is declared by `extractorContract`;
- visibility; object records carry material-slot ownership;
- linear base color and emissive color/intensity;
- roughness, metalness, side, shadow side, and the explicit alpha record (`mode`, opacity, alpha-test threshold, `alphaToCoverage`, and texture inputs);
- vertex-color, flat-shading, depth/color-write, and evaluated blend state;
- map identities and effective UV set/transform/wrap/filter/row-orientation settings;
- normal-map identity, space, scale, and tangent requirement;
- AO, roughness, metalness, emissive, and light-map semantics when present;
- transmission, thickness, IOR, attenuation, and other fields needed to classify unsupported transport;
- evaluated caster/receiver eligibility and per-channel relevance;
- known custom material adapter data, including road-material semantics where supported.

V2 material records use schema `bus-sim-evaluated-material-semantics-v2`
and `extractorContract.materialAdapter` is exactly
`evaluated-three-material-semantics-v2`. In addition to the authored
numeric `side` and nullable `shadowSide`, every material carries
strict boolean `preserveShadowSide` and `isFoliage` values derived
from the corresponding evaluated material `userData` flags. Missing,
non-boolean, or additional unadapted semantics reject V2 validation; an old V1
material or manifest is stale rather than implicitly upgraded.

Arbitrary `onBeforeCompile`, custom shader code, uniforms, or program cache keys are not serialized. A material whose bake-relevant appearance depends on an unknown shader patch records the affected channel as unsupported with `custom_shader_semantics_require_compiler_adapter`; a required consumer must stop rather than approximate it. Its ordinary live rendering remains unchanged.

Receiver base color is recorded for provenance and indirect-transport classification but is not an input to light-only direct or indirect receiver output when it belongs only to the receiver. The same material color is hash-significant for indirect transport when the surface participates as a bounce source. This contextual distinction is represented in channel projections rather than guessed from the material record alone.

### Texture storage

Only textures referenced by exported used materials are included. Unused catalog textures are excluded. A same-origin source URL is normalized to its project pathname, removing the local server origin and delivery query from identity; an explicitly supported external URL remains absolute.

Fetchable repository image textures embed their exact encoded response bytes as `raw_source` buffers, with MIME/type, dimensions, normalized source path, source digest, and evaluated Three.js sampling transform. A deterministic `DataTexture` embeds its typed pixel values in canonical little-endian order plus width, height, component type, and row origin. Other readable image/canvas sources embed a full-resolution canonical RGBA8 readback; the repeated-export gate must prove those generated bytes stable. For every texture channel used by a non-opaque alpha expression, the package additionally stores one full-resolution scalar per pixel in the canonical source component encoding and records its channel, dimensions, byte length, and digest; RGBA image/canvas readback uses one unsigned byte per coverage scalar, while typed texture sources preserve their declared component width. The source record's 64-by-64 `alphaSamples` values are diagnostics only; they neither authorize freshness nor substitute for exact coverage bytes. Compressed/cube/array/3D/depth/framebuffer/video textures, explicit mip chains, tainted or unreadable sources, missing sources, and `downloads/`-only sources are unsupported.

Base-color and emissive textures are tagged sRGB-to-Linear-sRGB. Normal, roughness, metalness, AO, alpha, masks, IDs, and depth are non-color. The package never transcodes, resizes, mip-generates, colorspace-converts, or flips image bytes. Native row order and evaluated `flipY` are explicit. AI 529 must reproduce the declared logical lower-left UV convention from these fields.

### Alpha coverage and shadow semantics

Every nontrivial material use has an addressable alpha-input record. For the ordinary Three.js material path, pre-test coverage is defined as:

```text
coverage = opacity
         * vertexAlphaOrOne
         * mapAlphaOrOne
         * alphaMapGreenOrOne
```

`vertexAlphaOrOne` is present only when the evaluated material/attribute path enables vertex alpha. The declared UV set for each texture, texture matrix, wrap modes, row orientation, filter compatibility class, and material side are part of the alpha input. A fragment is discarded when `coverage < alphaTest`. Alpha is linear non-color coverage. `alphaToCoverage` is recorded but does not redefine coverage or the threshold; a compiler profile must explicitly state any sample-coverage treatment.

Caster coverage mode is one of:

- `opaque`: coverage is one;
- `cutout`: the declared coverage expression and threshold are authoritative;
- `forced_opaque`: the visible material remains transparent or transmissive, but the caster silhouette is opaque;
- `none`: the use is not a caster;
- `unsupported_blend_or_transmission`: no V2 static-caster approximation is permitted.

`userData.mergeShadowAsOpaque === true` on the source mesh resolves to `forced_opaque` for caster coverage and records that exact runtime source flag. It does not alter visible material opacity, receiver semantics, or indirect transport automatically. The evaluated material `side` and `shadowSide` are recorded explicitly.

The V2 `static_sun_depth` profile also authenticates this exact
`casterSidedness` policy:

```text
model: three-r183-effective-shadow-side-v1
twoSidedCasting: true
preserveMaterialFlagSemantics:
  material-userdata-preserveShadowSide-or-isFoliage-v1
```

Three r183 first chooses the authored shadow side: explicit `shadowSide`
wins; otherwise Front and Back are flipped for the shadow pass while Double is
retained. Under the authenticated `single_high` policy, ordinary caster
materials are then forced to DoubleSide. A material with either preservation
flag retains that authored Three shadow-side result. The exporter stores the
combined boolean as `casterMappings[].preserveShadowSide` and the numeric
result as `casterMappings[].effectiveShadowSide`. JavaScript and Python
consumers independently recompute both fields from the raw material record and
channel policy before accepting them.

Blended transparency or transmission without `mergeShadowAsOpaque`, a validated cutout threshold, or an explicit caster opt-out is unsupported for static-sun casting. Blended/transmissive receivers are unsupported for V2 direct/indirect light-only receiver promotion. They remain on the current renderer or are excluded by an explicit channel profile; a required downstream consumer must reject them. Ambiguous combinations such as missing alpha bytes, conflicting UV sets, or unknown map channels fail with `ambiguous_alpha_semantics` or the applicable structured texture/material error. A selected caster with an unadapted `customDepthMaterial` or `customDistanceMaterial` fails with `custom_shadow_material_adapter_missing`; the error names the object, root/path, shadow-material property/type, affected channels, and remediation. The explicit `mergeShadowAsOpaque` path remains supported as forced opaque.

The current runtime deliberately treats some glazing as opaque shadow silhouette through `mergeShadowAsOpaque`, while older window prose says glass must not cast. The evaluated runtime behavior above is exported and the conflict is emitted as `SPEC_RUNTIME_SEMANTIC_CONFLICT` in the validation report. AI 528 does not change either behavior or prose.

## Participant, receiver, and caster mappings

A mapping addresses one mesh instance and one ordered material-group/draw range. It contains stable mapping ID; mesh-instance, object, geometry, material, and alpha-input IDs; group/material indices; active reference `start`/`count`; channel relevance; `chunkId`; and the reporting category value. Ownership provenance is recovered through those foreign keys.

Participant mappings cover every visible exported static material-group/instance range. They are separate from evaluated Three.js cast/receive flags because indirect transport and AO depend on bounce/occlusion surfaces that may be neither a shadow-map caster nor a promoted receiver. Their per-channel relevance is true only when the material adapter supports the applicable indirect or AO semantics; unsupported cases remain explicit and are never silently included.

Receiver mappings additionally declare `geometricNormalAttribute`, available `uvSets`, `lightmapMappingId`, and whether a normal map prevents scalar-lightmap promotion under the AI 527 contract. Caster mappings declare coverage mode, authored side/shadow-side state, the strict preservation boolean, authenticated effective shadow side, and the resolved caster-policy source. A `mergeShadowAsOpaque` caster is supported as `forced_opaque`; it does not inherit unsupported blended visible coverage. Blender reconstruction retains authored side semantics for visible materials; the static-sun depth producer alone consumes the authenticated effective side for caster culling.

Duplicate or overlapping mappings for the same semantic role are rejected unless the channel profile explicitly defines non-overlapping index ranges. A receiver/lightmap mapping in this package is identity and source metadata only; AI 533 owns atlas generation and final receiver encoding.

## Profiles and hash domains

`source` contains the resolved city source record, export-profile ID, source selection, unsupported cases, and runtime/spec semantic conflicts. `extractorContract` identifies the exporter, canonicalizer, evaluated-geometry adapter, material adapter, texture adapter, and source-hash-set schema. These are deterministic contract values; executable paths and host details are excluded.

Each lighting-profile record has a stable `id` and its explicit profile semantics. The current directional-sun profile records the numeric direction in Three.js world coordinates plus linear color and intensity. An enabled environment/IBL profile records its explicit intensity and source identity; when it has a fetchable source, `sourceReference` records the profile-asset buffer ID, MIME type, byte length, and role-specific digest. A profile never reads an unnamed live global. Display exposure, tone mapping, bloom, and camera state are forbidden fields.

Each channel-profile record uses its stable `id` as the physical channel ID and contains the explicit configuration supplied for that channel, including `lightProfileId` or `lightProfileIds` where applicable. Participant/receiver/caster selection is projected from the evaluated mappings for that ID. All bake-affecting resolution, mapping, precision, sampling, alpha, sidedness, and quality inputs known at export time belong in this record rather than ambient runtime state.

Each compiler-reference record contains a stable `id`, schema, archive identity/digest, backend, implementation owner/status, and ID-stable repository-relative configuration references. It contains no absolute Blender path and makes no assertion that the referenced Blender build is installed. AI 529 replaces this reference-level expectation with its verified compiler signature.

All freshness hashes are lowercase SHA-256. A hash domain is calculated with the version-1 framing protocol `bus-simulator/illumination/bake-source/sha256-framing/v1`:

```text
SHA256(
  UTF8(protocol)
  || uint32le(byteLength(UTF8(domainTag)))
  || uint32le(byteLength(projectionBytes))
  || UTF8(domainTag)
  || projectionBytes
)
```

Explicit lengths make the two variable-width inputs unambiguous. Projections use the canonical JSON rules above and exclude their own digest fields, container offsets, integrity hashes, reports, timings, and artifact paths. Names included by a declared root or material provenance adapter are semantic V2 inputs; unrelated logs and generated artifact names are not.

### Required freshness domains and exact projections

The base hash set has schema `bus-simulator/illumination/bake-source-hash-set/v1`. `buildBakeSourceHashSet` calculates these exact fields and domains:

- `geometry`: `bus-simulator/illumination/bake-source/geometry/v1` over the canonical geometry projection supplied by the exporter;
- `usedMaterials`: `bus-simulator/illumination/bake-source/used-materials/v1` over the ID-sorted stable inventory supplied as `usedMaterials`;
- each `profiles[]` entry: `bus-simulator/illumination/bake-source/profile/v1/<id>` over that complete lighting-profile record;
- each `channels[]` entry: `bus-simulator/illumination/bake-source/channel/v1/<id>` over that complete channel-profile record;
- `compiler`: `bus-simulator/illumination/bake-source/compiler-reference/v1` over the complete compiler-reference inventory;
- `resolvedSource`: `bus-simulator/illumination/bake-source/resolved-source/v1` over exactly `{ geometrySha256, source, usedMaterialsSha256 }`, where `source` is a canonical clone of the exporter's resolved-source projection and the other two values are the hashes just calculated.

The exporter supplies `geometry` as `{ objects, meshInstances, geometries, buffers }`. Its objects and instances omit material IDs and evaluated participation-policy fields, and its buffer entries are semantic geometry descriptors rather than offsets. It supplies `usedMaterials` as one ID-sorted inventory containing all referenced material, texture-source, texture-binding, and alpha-input records plus normalized participant, receiver, and caster policy records. It supplies `resolvedSource` as the city/source-profile projection with roots, categories, chunks, unsupported cases, semantic conflicts, and receiver bake-layout records. Lighting profiles, channel profiles, and compiler references therefore remain independent of `resolvedSource` unless one of their values is also deliberately present in that resolved-source projection.

The semantic exporter extends the base set with each `channelSources[]` entry under `bus-simulator/illumination/bake-source/channel-source/v1/<channel-id>`. Its exact projection is `{ channelId, channelConfigurationSha256, lightingProfiles, source }`. `lightingProfiles` is the ID-sorted list of referenced role-specific lighting-profile projections: static-sun depth includes directional identity, direction, angular diameter, and filter model but excludes sun color/intensity; other channels include the complete referenced profiles. `source` contains the explicit participation policy and that channel's selected objects, instances, geometries, participant/receiver/caster mappings, local material-slot projections, local texture-source/binding projections, and alpha projections. Compiler references remain a separate compatibility input.

`static_sun_depth`, `direct_receiver`, `indirect_irradiance`, and `static_ao_bent_normal` each have an independent entry in `hashes.channels` and `hashes.channelSources`. No aggregate convenience digest may replace them during activation.

The manifest stores the digests under this required shape:

```text
hashes.schema = bus-simulator/illumination/bake-source-hash-set/v1
hashes.resolvedSource
hashes.geometry
hashes.usedMaterials
hashes.profiles[]: { id, sha256 }
hashes.channels[]: { id, sha256 }
hashes.compiler
hashes.channelSources[]: { id, sha256 }
```

The three arrays are ID-sorted stable inventories; there is no `hashes.algorithm` property in V2. Every digest is exactly 64 lowercase hexadecimal characters. A projection hashes referenced buffer digests and semantic descriptors, not container offsets; moving an unchanged buffer cannot change freshness.

Role-specific content identities use additional fixed domains:

- geometry extraction bytes and descriptor/object/instance identity projections: `bus-simulator/illumination/bake-source/evaluated-geometry-buffer/v1`;
- material semantic records: `bus-simulator/illumination/bake-source/material-semantics/v1`;
- texture bytes: `bus-simulator/illumination/bake-source/texture-content/v1`;
- texture source descriptors: `bus-simulator/illumination/bake-source/texture-source/v1`;
- texture bindings: `bus-simulator/illumination/bake-source/texture-binding/v1`;
- diagnostic 64-by-64 texture alpha samples: `bus-simulator/illumination/bake-source/texture-alpha-sample/v1/<channel>`;
- exact full-resolution texture coverage channels: `bus-simulator/illumination/bake-source/texture-coverage-channel/v1/<channel>`;
- alpha-input records: `bus-simulator/illumination/bake-source/alpha-input/v1`;
- fetched lighting-profile assets: `bus-simulator/illumination/bake-source/profile-asset/v1`.

These content identities are inputs to semantic projections and are not substitutes for the internal table's `bus-simulator/illumination/bake-source/buffer-integrity/v1` digest.

The live runtime must be able to reconstruct the same freshness projections from the resolved city without reading or trusting the package's claimed hashes. The derivation uses the same versioned schema and source adapters, but starts from the live evaluated inventory. Package filename, embedded hash assertion, timestamp, or cached export manifest is not an input. AI 528 proves deterministic source adapters, domain sensitivity, package-only hash reconstruction, active/fresh canonical source-record equality, and complete-package equality across two independently prewarmed clean cities. The package-only validator deliberately reports the already-running live inventory comparison as unperformed; AI 530 must perform that comparison before any eventual activation.

### Sensitivity matrix

`Y` means the domain changes. `C` means it changes only when the semantic is compiled into that channel. `N` means it is explicitly excluded.

| Input mutation | Resolved source | Geometry | Used materials | Sun depth | Direct receiver | Indirect | AO/bent normal | Compiler ref |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Used topology, attribute bytes, placement, or transform | Y | Y | N | Y | Y | Y | Y | N |
| Static caster/receiver eligibility or mapping | Y | N | Y | Y | Y | Y | Y | N |
| Alpha texture/channel/UV/transform/wrap/cutoff/sidedness | Y | N | Y | Y | Y | Y | Y | N |
| Sun direction | N | N | N | Y | Y | Y | N | N |
| Sun intensity or color | N | N | N | N | Y | Y | N | N |
| Sun angular size/filter model | N | N | N | C | Y | C | N | N |
| Environment/IBL profile | N | N | N | N | N | Y | N | N |
| Bounce-source albedo, emissive, or supported transport | Y | N | Y | N | N | Y | N | N |
| Receiver-only base color for light-only output | Y | N | Y | N | N | N | N | N |
| Receiver UV/lightmap mapping | Y | N | N | N | Y | Y | Y | N |
| AO radius, rays, samples, or sidedness | N | N | N | N | N | N | Y | N |
| Channel resolution, padding, precision, or layout | N | N | N | Y | Y | Y | Y | N |
| Referenced compiler script/config version or digest | N | N | N | N | N | N | N | Y |
| Camera pose/FOV, color PVS, tone map, exposure, bloom, or bus pose | N | N | N | N | N | N | N | N |
| Incidental discovery/traversal order or asynchronous completion order only | N | N | N | N | N | N | N | N |
| Unused catalog material, texture, building, or prop | N | N | N | N | N | N | N | N |

A mutation test must verify every `Y` and representative `C`/`N` entry. `hashes.resolvedSource` may change for a used semantic that one physical channel excludes; that channel's own entry in `hashes.channelSources` must remain stable.

## Validation and structured diagnostics

Validation occurs before any final package is promoted. An invalid export produces no final `.bsib`, is serialized as a structured exporter failure, and exits nonzero. `validation.json` describes the successfully validated representative package; an interrupted or invalid staged package is never promoted merely because bytes were written.

Semantic extraction and validation failures are `BakeSourceValidationError` values with this stable serialized shape:

```text
code: stable lowercase_snake_case identifier
message: concise human-readable explanation
context: canonical JSON object with applicable IDs, paths, expected/actual values, and remediation evidence
```

The reusable byte parser intentionally throws compact sentinel `Error.message` values such as `bake_source_package_magic_mismatch` and `bake_source_manifest_not_canonical`; it does not depend on the graphics error class. The exporter boundary normalizes either kind through `serializeBakeSourceError`. A known semantic error preserves `{ code, message, context }`; an otherwise unexpected error becomes `{ code: "unexpected_export_error", message, context: {} }`. Raw engine stack text may accompany a developer log but is not stable diagnostic identity.

Required hard failures include:

- bad magic/version/header, nonzero flags, unsafe lengths or offsets, overlap, gaps, trailing data, or any integrity mismatch;
- noncanonical manifest bytes, unknown required enum, malformed ID, duplicate ID, broken reference, missing provenance, or nondeterministic ID input;
- non-finite value, unsupported transform, negative determinant, count/stride/range mismatch, out-of-range index, invalid group, degenerate topology, incompatible attribute, or bounds mismatch;
- incomplete async content, undeclared readiness, source mutation during export, or placement/instance-count mismatch;
- missing/unreadable texture bytes, unsupported source, texture dimension mismatch, ambiguous alpha semantics, unsupported required material/shader/transmission behavior, or incomplete caster-source mapping;
- category, chunk, object, mapping, profile, or channel inventory inconsistency.

Warnings may document explicit opt-outs, excluded diagnostic objects, supported runtime/spec conflicts, and metrics that cannot be measured. A warning cannot downgrade a required selected-channel error.

## Round-trip and determinism gates

The package-only round-trip validator reads the emitted package from bytes; it does not reuse in-memory exporter objects. It verifies:

1. fixed header, canonical manifest and internal table, every buffer digest, and package-integrity digest;
2. identical stable ID inventories and all foreign-key/provenance mappings;
3. exact attribute bytes, component types, normalization flags, strides, counts, indices, group order, and winding;
4. local and world counts and bounds;
5. ordinary and instanced world transforms, Three-to-Blender conversion, and inverse conversion;
6. normals and tangents under the declared inverse-transpose/basis rules;
7. UV identities, texture bytes, texture transforms, material semantics, caster/receiver eligibility, and alpha inputs;
8. exact full-resolution texture coverage-channel bytes, channel identity, dimensions, sampling/UV/wrap metadata, material coverage expression, threshold, and sidedness needed to reconstruct alpha silhouettes;
9. category/channel inventories and all package hash projections independently reconstructed from package bytes.

During export, the same semantic validation also receives the fully prewarmed resolved Three.js source manifest and logical-buffer inventory and proves that the parsed canonical manifest and every logical package buffer match those source-derived values exactly. The outer browser gate then compares canonical manifests, source identities, inventories, exact coverage buffers, and complete package bytes from two independently constructed and prewarmed production cities. Neither check is mislabeled as an already-running runtime-city activation comparison.

Raw source/accessor bytes and integer identities must match exactly. Binary64 transform round trips must match the documented operation order; geometric comparisons use an absolute tolerance of `1e-9` for stored matrices and `1e-6` metres for independently recomputed bounds. Normal-direction comparison permits at most `1e-6` radians after normalization. Any larger tolerance requires a spec revision.

At minimum, deterministic fixtures cover canonical key reordering, repeated export, asynchronous tree completion order, shared geometry, ordinary and instanced meshes, interleaved attributes, transform conversion, normals/tangents, multiple UV sets, material groups, alpha map channels, `mergeShadowAsOpaque`, missing/corrupt data, relevant mutations, and irrelevant unused catalog mutations.

Two independently constructed and fully prewarmed clean exports of identical active gameplay configuration must produce identical manifest bytes, buffer table, buffer bytes, per-domain hashes, package digest, and complete `.bsib` bytes. Any nondeterministic container byte is an AI 528 failure, not an allowed GLB-style exception.

## Artifacts and reports

Generated AI 528 output is gitignored and lives under:

```text
tests/artifacts/illumination_528/
  packages/<city-id>/<profile-label>/representative_<city-id>.bsib
  reports/<city-id>/<profile-label>/inventory.json
  reports/<city-id>/<profile-label>/size_by_category_and_channel.json
  reports/<city-id>/<profile-label>/source_hash_sensitivity.json
  reports/<city-id>/<profile-label>/round_trip.json
  reports/<city-id>/<profile-label>/validation.json
  reports/<city-id>/<profile-label>/export_metrics.json
  reports/<city-id>/<profile-label>/determinism.json
  staging/<run-id>/...
```

The default representative path is `packages/bigcity2/default/representative_bigcity2.bsib`; command-line overrides must remain below the same artifact root. `run-id` is artifact-local and never enters the package. A failed or interrupted export can remain in `staging` and cannot be mistaken for the representative package. Final promotion occurs only after validation and round-trip success: any prior target is removed immediately before the staged file receives a same-volume rename.

Inventory and size reports include category, root, object, geometry, mesh-instance, triangle, material, texture, alpha-input, participant, receiver, caster, exact coverage-buffer, and byte counts. Channel budgets separately report relevant mapping/object/instance/triangle/material/alpha counts, full-texture bytes, coverage-channel bytes, lighting-profile source bytes, inclusive geometry bytes, and total inclusive input bytes. Export metrics report conditions, export time, package size, and peak memory when measurable. Unavailable metrics are `not measured` with a reason. Reports may contain timestamps and host diagnostics because they are not canonical inputs, but they must identify the package digest they describe.

No generated package or report is written beside source, under `screens/`, or into `downloads/`. Runtime code never consumes `downloads/`. A future retained production asset requires an explicit later asset/provenance decision; AI 528's representative export remains an artifact.

## AI 529 handoff

AI 529 receives one verified `.bsib` file and must:

- verify the fixed header and all integrity hashes before reconstruction;
- verify format/schema, coordinate, source, profile/channel, and compiler-reference contracts;
- reconstruct clean Blender geometry, instances, materials, textures, alpha coverage, casters, and receivers strictly from declared records;
- preserve stable IDs as custom metadata while treating Blender object names as diagnostic aliases;
- stop on unsupported or inconsistent inputs rather than opening or repairing a hand-edited `.blend` file.

AI 529 owns the exact Blender archive/build signature, scripted clean-scene reconstruction, Cycles settings, proof bakes, repeatability tolerances, and intermediate outputs. `hashes.compiler` in this package authenticates only the declared reference inventory until AI 529 binds it to an actual verified compiler signature.

## AI 530 handoff

AI 530 may reuse independently derived source and channel hashes plus stable receiver/caster IDs, but it does not ship `.bsib` as the runtime payload by default. It owns runtime chunking, compression, quantization, integrity tables, asynchronous loading, GPU upload, compatibility validation, and atomic activation. Any conversion from `.bsib` to a runtime container is a separately hashed derived stage.

No `.bsib` package may activate gameplay lighting directly, and no runtime payload may trust only the `.bsib` filename or embedded source assertion. The live resolved city must independently derive the compatible channel freshness identity.

## V2 non-goals

V2 deliberately does not define:

- Blender installation, invocation, baking, or `.blend` authority;
- runtime illumination binary transport or GPU formats;
- texture/geometry compression, quantization, atlasing, lightmap UV generation, static-sun tiling, filtering, or seam policy;
- incremental chunk invalidation or partial package promotion;
- dynamic bus geometry or bus pose as a static source;
- a generic arbitrary-shader serializer;
- approximation of unsupported blended, volumetric, transmissive, skinned, morphed, or GPU-generated geometry;
- changes to current gameplay lighting, shadows, AO, PVS, materials, or Options behavior.

Unsupported cases remain on the current renderer or fail a selected offline channel. They are never silently approximated merely to make export complete.
