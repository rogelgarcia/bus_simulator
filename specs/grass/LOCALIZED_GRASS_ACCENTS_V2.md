# Localized Grass Accents V2

> **Human visual validation: REJECTED (2026-08-31).** This specification documents the rejected AI 350–362/AI 537 solution for historical reference only. It is not an approved visual baseline and cannot authorize gameplay. See `GRASS_LAB_HUMAN_REJECTION.md`.

## Scope and authority

AI 361 owns the corrective rendering and automatic-LOD reconciliation of
explicit tree and feature grass accents in the canonical Grass Lab. This
contract preserves AI 356's deterministic city-shaped input records while
replacing its V1 material, binary-coverage, near-only visibility, and worn-disc
rendering behavior.

AI 358 remains the appearance/atlas authority. AI 359 owns tree-base and
sidewalk exclusions plus the continuous substrate visible through those holes.
AI 360 owns the primary near carpet. AI 361 accents are a bounded embellishment
of explicit features; they are never a field-distribution mechanism.

`LOCALIZED_GRASS_ACCENTS_V1.md` remains historical evidence. Its single-card
V1 atlas instances, V1 binary sampling, near-tier-only mask, and separate worn
substrate batch are not the V2 approval path.

## Stable contract identity

- schema: `bus-simulator.grass-localized-accents`
- version: `2`
- placement contract:
  `src/app/grass/GrassLocalizedAccentContract.js`
- renderer:
  `src/graphics/engine3d/grass/GrassLocalizedAccentSystem.js`
- engine owner:
  `src/graphics/engine3d/grass/GrassEngine.js`
- canonical Lab adapter:
  `createGrassLabEngineConfig()`
- footprint input: `bus-simulator.grass-coverage` version `2`
- LOD input: `bus-simulator.grass-auto-lod` version `2`
- appearance input: AI 358 `ACCENT_CLUMP`
- substrate ownership: `coverage_tree_hole`

The V2 public input remains:

```js
GrassEngine.setLocalizedAccentInput({
    treePlacements,
    featurePlacements,
    coverageDefinition,
    coverageConfig
});
```

The coverage definition/config must be the same sanitized AI 359 identity used
by the boundary and field tiers. V2 never creates a tree disc, reconstructs an
exclusion, or substitutes compatibility rectangles when exact polygons exist.

## Preserved source records

Tree and optional feature records preserve these fields:

- finite `x`, `y`, and `z`;
- `rotation`;
- `scaleVar`;
- `variant`;
- stable `id` when supplied.

The Lab may derive an ID only when a source record lacks one. A derived ID is
based on record kind, stable index, and normalized coordinates; camera state or
render order cannot participate.

The canonical fixture retains four tree records and one optional explicit worn
feature record. The word `worn` describes the feature's placement intent only;
it does not authorize a substrate overlay. No road, sidewalk, polygon boundary,
or random field location automatically creates an accent.

Equivalent profile seed, V2 accent seed, source records, coverage signature,
config, and LOD settings reproduce the same normalized inputs, root transforms,
atlas variants, and placement signature after reload.

## Canonical V2 defaults

| Field | Default |
|---|---:|
| `enabled` | `true` |
| `featureAccentsEnabled` | `true` |
| `seed` | `grass-localized-accents-v2` |
| `clustersPerTree` | `4` |
| `clustersPerFeature` | `3` |
| `trunkRadiusMeters` | `0.55` |
| `ringInnerMeters` | `0.82` |
| `ringOuterMeters` | `1.25` |
| `cardWidthMeters` | `0.24` |
| `cardHeightMeters` | `0.075` |
| `cardsPerCluster` | `2` |
| `scaleVariation` | `0.14` |
| `brightnessVariation` | `0.08` maximum |
| `atlasVariants` | `8` |

Tree radii are multiplied by the source `scaleVar`. The root ring begins
outside both the scaled trunk-clearance radius and AI 359's tree grass-onset
loop. The canonical tree substrate onset is based on the historical
`0.76 m` worn radius, but that radius is now polygon input owned by AI 359, not
a disc generated or rendered here.

`clustersPerTree` remains sanitized to `3-6`; `clustersPerFeature` remains
sanitized to `1-4`. These bounds constrain explicit accents only. They do not
scale field density or add accents to every eligible square metre.

## Exact AI 359 root and envelope eligibility

Every proposed accent root is evaluated through
`sampleGrassCoverageContract(definition, x, z, config)` and must report:

- `occupied: true`;
- positive-on-grass `boundaryDistanceMeters`;
- `rootEligible: true`.

The query covers terrain bounds, exact sidewalk onset loops, tree-base onset
loops, and every later exact exclusion. Exact polygons unconditionally win over
compatibility rectangles. Humidity, dryness, material alpha, far coverage, and
the accent-enabled flag cannot change physical occupancy.

Tree roots are also checked against the scaled source trunk radius. The
AI 359 tree onset normally rejects that region first, but the explicit trunk
check remains a diagnostic invariant rather than an alternate exclusion.

A root in a partially excluded source ring is rejected individually; other
eligible roots for that source remain. A source record is not dropped merely
because one proposed root fails. Rejected roots emit no instance, vertex, or
triangle.

Each two-card clump uses signed boundary distance to orient inward and clamp its
lateral envelope at hard cuts. Base corners and maximum transformed reach are
postchecked against the same definition. The system may reduce a clump's reach
but may not move its root onto substrate or create a conservative source-wide
moat.

Canonical exact fixtures require:

- `coverageMode === "exact_polygon"`;
- `unrepresentedEligibleRoots === 0`;
- `exactPostcheckFailures === 0`;
- `exactEnvelopeFailures === 0`.

## Placement and appearance

Each represented root renders one low clump made from two deterministic crossed
cards, totaling four triangles. The nominal physical card is AI 358's
`0.24 × 0.075 m` `ACCENT_CLUMP` rectangle. Deterministic yaw, bounded scale,
and one of eight atlas variants provide local irregularity without creating a
tall isolated object or a new palette.

The clump root follows terrain height and the AI 359 structural-base reference.
Diagnostics report actual base/tip bounds separately. The localized clump may
be longer than the near fibers; it must remain below the project's tall
vegetation category and cannot redefine AI 360's near-tip distribution.

Per-instance color is a restrained multiplier of the shared V2 asset. The
historical independent `dryTint` palette is not a V2 appearance authority.
Under neutral daylight and overcast, accent geometry-on/texture-only median
luminance must remain within `0.90-1.10`, and the accent must not appear as a
neon or self-lit point.

## Shared AI 358 material contract

All V2 accent clumps share one material resolved through
`PbrTextureLoaderService` from `pbr.grass_low_cut_maintained_v2`. It consumes:

- `accentClumpColor`;
- `accentClumpNormal`;
- `accentClumpRoughness`;
- `accentClumpAo`;
- separate `accentClumpCoverage` through `alphaMap`.

The material retains the `4 × 2` eight-variant atlas, `0.35` alpha cutoff,
alpha-to-coverage when MSAA is available, cell-local UV remapping, the
zero-coverage gutter, opaque PBR channels, trilinear mips,
`vertexColors: false`, `world_up_blend: 1.0`, depth writing, and runtime
emissive intensity `0`. Accent cards neither cast nor receive shadows.

The accent system must not share the physically different `MID_CLUSTER` atlas
as a substitute, add a local texture loader, invent URLs, repack coverage into
PBR alpha, or add an accent-specific calibration/palette.

## Continuous substrate and removal of the worn batch

AI 359's continuous substrate is already visible through each exact tree hole.
V2 therefore emits no worn-substrate mesh:

- `substrateOwnership: "coverage_tree_hole"`;
- `wornPatches === 0`;
- `wornTriangles === 0`;
- `wornDrawCalls === 0`;
- `wornMaterialPaths === 0`.

A legacy `wornEnabled` control may be accepted only at a compatibility boundary
and ignored for an exact V2 definition. It must not recreate the V1 disc. The
optional feature record may place grass clumps around its explicit position,
but it cannot paint an opaque brown circle over live grass.

## Automatic-LOD reconciliation

Accents consume the exact AutoLOD V2 evaluation from
`GRASS_AUTO_LOD_AND_COHESIVE_HANDOFF_V2.md`. Their geometry weight is:

`accentGeometryWeight = 1 - weights.texture`

Explicit accents therefore remain stable through close, billboard, and middle
field representations. They share the final middle-to-texture transition
progress, stable sample policy, hysteresis, and effective `25 m` cutoff.
Accents do not switch off at the close/billboard boundary and therefore cannot
form a tree-centered near-tier ring.

The final transition uses each accent key plus the canonical
`middle_to_texture` handoff ID. Repeated forward/reverse paths preserve bounded
hysteresis; stationary frames do not oscillate. Manual `accent` evidence
isolation may show already eligible clumps only inside the effective cutoff. It
cannot extend their layout or hide the required far underlay.

`geometryBeyondCutoff` must be zero. A card whose root is inside but transformed
envelope would cross the cutoff is culled or clamped and reported through the
envelope diagnostics.

## Batching, culling, and updates

The canonical V2 accent renderer owns exactly one global instanced clump batch.
Two crossed cards are one instance geometry, so root/card counts do not grow
draw calls. The removed worn batch contributes no mesh or draw.

The clump mesh retains computed instance bounds and frustum culling. It is
shadow-free, alpha-tested, depth-writing, and not transparently sorted.
Capacity may grow geometrically without recreating the mesh every frame.

Layout rebuild occurs only when source records, seed, terrain, exact coverage
signature/config, or placement-relevant accent settings change. AutoLOD/camera
motion updates visible instance occupancy while retaining stable root
descriptors. Once state settles, the system performs zero recurring
instance-buffer uploads.

## Required diagnostics

The accent snapshot exposes:

- schema/version, config, evidence role, and
  `substrateOwnership`;
- source tree/feature counts and normalized source IDs;
- AI 359 `coverageMode`, `boundarySignature`, source-loop identity, and root
  clearance;
- accent `placementSignature` and compatibility
  `deterministicSignature`;
- `candidateRoots`, `eligibleRoots`, `representedRoots`, and
  `unrepresentedEligibleRoots`;
- `rejectedByKind.sidewalk`, `rejectedByKind.tree_base`,
  `rejectedInsideTrunk`, and any out-of-bounds rejection;
- `exactPostcheckFailures`, `exactEnvelopeFailures`, and minimum emitted-root
  boundary distance;
- potential/visible clumps, cards, instances, triangles, draws, and material
  paths;
- atlas/material identity, maps, variant count, alpha cutoff, normal policy,
  emissive, opacity, depth, shadow, and culling flags;
- AutoLOD weight, transition progress/clumps, geometry beyond cutoff, and
  retained/entering/leaving roots;
- total/last buffer updates and stationary frames;
- zero worn patch/triangle/draw/material counts.

Equivalent inputs must reproduce placement signature, root positions, clump
transforms, atlas variants, triangle counts, and rejection diagnostics after
reload. A changed AI 359 boundary signature invalidates the layout before the
next visible frame.

## Cost and combined-budget obligations

The default four-clump tree costs `16` grass triangles. The optional default
three-clump feature costs `12` triangles. All visible V2 accents share one
logical draw and one material path; hidden or empty layouts cost zero draws.

Accent cost participates in the AI 361 combined budget:

- approximately `5-6` typical grass logical draws;
- `12` hard logical-draw ceiling;
- `200,000` combined visible-grass triangle ceiling including AI 359 boundary,
  AI 360 near, billboard, middle, and accents;
- zero geometry beyond cutoff;
- zero recurring stationary uploads.

Counts of sources, clumps, or instances are diagnostic context and never
replace triangle, draw, memory, frame-time, CPU, or GPU measurements.

Low quality renders zero accent geometry while retaining the AI 359 substrate,
tree holes, cap, physical edge, and corrected far surface.

## Regression and visual gates

Automated coverage includes:

- exact sidewalk/tree polygons winning over contradictory rectangles;
- deterministic source normalization and reload signatures;
- partial source rings retaining all other eligible roots;
- every root and clump envelope passing AI 359;
- zero worn-disc geometry/material/draw cost;
- one V2 `ACCENT_CLUMP` material path with separate coverage alpha,
  world-up normal policy, and zero emissive;
- stable close/billboard/middle visibility and complementary final texture
  handoff;
- deterministic forward/reverse hysteresis and zero stationary oscillation;
- zero cutoff violations and stationary uploads;
- low-quality geometry disabled;
- combined draw/triangle compliance.

AI 361 evidence under `tests/artifacts/screens/grass/ai361/` includes matched
tree and optional-feature views in `texture_only`, `auto`, and `accent`
evidence roles, plus the aligned four-light appearance matrix and final
handoff/motion frames required by
`GRASS_AUTO_LOD_AND_COHESIVE_HANDOFF_V2.md`. Frames are UI-free native
`3840x2160` lossless PNGs at pixel ratio `1` and carry exact signatures,
coverage/rejection diagnostics, material identity, per-tier and combined cost,
and verified dimensions.

## Downstream obligations and non-goals

AI 362 validates this exact placement, material, LOD, substrate, diagnostics,
and cost contract. AI 363 reuses the approved city-shaped source records and
renderer without adding a gameplay-only accent path.

This contract does not:

- change AI 356 source record identities or distribute accents field-wide;
- change AI 358 atlas pixels, dimensions, palette, or shared loader;
- change AI 359 tree/sidewalk polygons, substrate reveal, cap, or edge;
- change AI 360 near placement or geometry;
- create a worn substrate overlay;
- create a separate LOD evaluator or extend the geometry cutoff;
- approve the assembled runtime or authorize gameplay;
- change terrain height, collision, navigation, roads, sidewalks, or trees.
