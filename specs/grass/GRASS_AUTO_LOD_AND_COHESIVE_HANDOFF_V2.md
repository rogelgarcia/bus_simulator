# Grass Automatic LOD and Cohesive Handoff V2

## Scope and authority

AI 361 owns the corrective automatic representation hierarchy after AI 360's
closest-camera carpet: dense billboard coverage, cohesive middle patches,
distance/angle selection, stable handoffs, and the final geometry-to-texture
cutoff in the dedicated Grass Lab.

AI 358 remains the material/asset authority, AI 359 remains the physical
footprint authority, and AI 360 remains the near-mesh authority. AI 361 selects
already valid AI 360 roots but may not change their density, three-fiber shape,
height distribution, exact clipping, material response, or batching. AI 362
owns whole-system approval. AI 363 alone may attach the approved hierarchy to
gameplay.

`GRASS_AUTO_LOD_AND_CLUSTER_HANDOFF_V1.md` remains historical evidence. Its
single sparse cluster tier, `9/30 m` thresholds, rectangle rejection, and
near/cluster/texture schema are not the corrective approval path.

## Stable contract identity

- schema: `bus-simulator.grass-auto-lod`
- version: `2`
- application contract:
  `src/app/grass/GrassAutoLodContract.js`
- engine owner:
  `src/graphics/engine3d/grass/GrassEngine.js`
- simplified-field renderer:
  `src/graphics/engine3d/grass/GrassMidClusterSystem.js`
- canonical Lab adapter:
  `createGrassLabEngineConfig()`
- canonical Grass Lab snapshot contract version after AI 361: `10`
- footprint input: `bus-simulator.grass-coverage` version `2`
- near input: `bus-simulator.near-grass-carpet` version `2`
- appearance input: `grass.natural.maintained.material.v2`

The historical renderer class may retain `MidCluster` in its filename while
being evolved, but the V2 public contract and diagnostics expose distinct
`billboard` and `middle` tiers. A second evaluator, independently generated
field, or Lab-local material path is forbidden.

`GrassEngine` owns one sanitized AI 359 `{ definition, config }` input and
forwards the same identity and semantics to near, billboard, middle, and
localized-accent consumers. No consumer may reconstruct the definition from
rectangles, textures, route envelopes, or display controls.

## Canonical representation order and defaults

The automatic path uses four representations of one continuous maintained
carpet:

| Effective range | Representation | Owner / cost shape |
|---|---|---|
| `0-3 m` | close mesh | AI 360 area-complete roots, `64` root bins/m², `3` fibers/root |
| `3-8 m` | dense billboard coverage | one low card per eligible V2 field unit |
| `8-25 m` | cohesive middle patches | two crossed low cards per eligible V2 field unit |
| `25 m+` | far texture only | AI 358/359 opaque maintained-grass surface, zero field geometry |

The far surface remains present below every geometry tier. It is the continuous
color/coverage underlay, not a fifth geometry batch.

The canonical sanitized AutoLOD V2 defaults are:

| Field | Default |
|---|---:|
| `enabled` | `true` |
| `force` | `auto` |
| `nearEndMeters` | `3` |
| `billboardEndMeters` | `8` |
| `middleEndMeters` | `25` |
| `transitionWidthMeters` | `2` |
| `hysteresisMeters` | `0.75` |
| `angle.grazingDeg` | `12` |
| `angle.topDownDeg` | `70` |
| `angle.grazingDistanceScale` | `0.8` |
| `angle.topDownDistanceScale` | `1.2` |

The only V2 force values are `auto`, `near`, `billboard`, `middle`, and
`texture`. A legacy `cluster` value may be translated once at a compatibility
boundary, but it is not a V2 snapshot, UI, or approval value.

Ground-projected distance is multiplied by the clamped angle scale:

`effectiveDistanceMeters = distanceMeters * angleScale`

The `0.8` grazing scale extends world-space detail range; the `1.2` top-down
scale shortens it. All tier thresholds, handoffs, hysteresis, and the hard
cutoff operate in effective-distance space.

## Four-weight evaluation contract

`evaluateGrassAutoLod()` returns:

- `weights: { near, billboard, middle, texture }`;
- `activeTier`;
- `transitionState`;
- `transitionProgress`;
- `distanceMeters`, `effectiveDistanceMeters`, `viewAngleDeg`, and
  `angleScale`;
- `beyondGeometryCutoff`.

Weights are finite in `[0, 1]` and sum to `1` within numeric tolerance. Only
adjacent tiers may have non-zero geometry weights in one handoff. Steady states
are `near`, `billboard`, `middle`, and `texture_only`; transition states are
`near_to_billboard`,
`billboard_to_middle`, and `middle_to_texture`.

The near/billboard and billboard/middle handoffs are centered on `3 m` and
`8 m` across the configured `2 m` width. The middle/texture handoff occupies
the final `2 m` before `25 m`; no geometry is permitted at or beyond the
effective cutoff.

Weights are selection inputs, not material opacity. Geometry remains opaque or
alpha-tested according to its asset contract. Handoffs change deterministic
coverage-unit occupancy rather than applying a broad transparent ring.

## Stable complementary handoffs

Every V2 field unit has one stable sample for each handoff. Its collision-safe
identity includes the raw world-unit key, field seed, handoff ID, AutoLOD
schema/version, and the complete AI 359 boundary signature. The outgoing and
incoming tier must use that same sample and complementary thresholds.
Independent tier hashes are forbidden because they can make both tiers absent
in the same area.

During a handoff:

- every eligible unit is represented by the outgoing tier, incoming tier, or
  both;
- a narrow deterministic overlap is allowed and reported;
- `unrepresentedEligibleUnits` remains zero;
- the incoming tier cannot appear before the preceding tier's handoff;
- non-adjacent geometry tiers cannot overlap;
- the texture underlay remains present throughout.

The `0.75 m` hysteresis is applied to the previous unit state, not by moving the
physical thresholds or the AI 359 footprint. Forward and reverse sweeps may
switch at different points inside the bounded hysteresis interval, but a
stationary camera cannot oscillate.

Selection is evaluated per shared world unit. It is never evaluated
independently per card, per AI 360 fiber, or with a frame-varying random value.
Camera-cell changes diff retained/entering/leaving units and do not reseed
unchanged world units.

## Shared exact-coverage field layout

Billboard and middle tiers consume one deterministic, world-aligned
`1 m × 1 m` field-unit layout. A represented unit owns one exact-eligible root.
The two tiers reuse that root/key rather than generating unrelated grids.
The rendered root uses deterministic independent X/Z jitter bounded to
`±0.45` of the unit, and card scale variation is symmetric around nominal
scale. Handoff distance remains measured from the canonical cell center rather
than the jittered render root, so visual irregularity cannot alter tier
identity or transition timing.

For every candidate unit:

1. deterministic canonical samples are queried through
   `sampleGrassCoverageContract(definition, x, z, config)`;
2. an eligible sample must be occupied, positive on the grass side, and
   `rootEligible: true`;
3. exact polygon exclusions take unconditional precedence over compatibility
   rectangles;
4. a partially excluded unit remains eligible when any canonical sample can
   produce a valid root;
5. deterministic boundary-completion samples may sit at
   `rootClearanceMeters + epsilon` on the occupied side;
6. every emitted root is resampled after layout construction.

Whole-unit center rejection is not sufficient. Sidewalk, tree, diagonal,
curved, and corner slivers must survive without a one-metre moat. Rejected
samples emit no instance, vertex, or triangle.

The field layout exposes:

- `coverageMode` and AI 359 `boundarySignature`;
- a `placementSignature` covering seed, terrain bounds, active camera cell,
  unit size, all root samples/transforms, coverage config, card transforms, and
  every placement-relevant setting;
- `candidateUnits`, `eligibleUnits`, `representedUnits`, and
  `unrepresentedEligibleUnits`;
- `eligibleAreaSquareMeters` and `representedAreaSquareMeters`;
- `rejectedByKind`, including `sidewalk` and `tree_base`;
- `exactPostcheckFailures` and `exactEnvelopeFailures`.

Canonical exact fixtures require:

- `coverageMode === "exact_polygon"`;
- `unrepresentedEligibleUnits === 0`;
- `exactPostcheckFailures === 0`;
- `exactEnvelopeFailures === 0`.

A boundary-signature, terrain-bound, root-clearance, unit-layout, or
placement-relevant geometry change invalidates both simplified-tier caches
before the next visible frame. Appearance-only changes update shared material
state without moving roots.

## Geometry envelope at hard cuts

Root eligibility does not authorize a card to cross an onset loop. Every card
uses the root's positive boundary distance to clamp its footprint near a hard
cut. The system may orient the low card toward occupied grass, reduce its
lateral reach, or both. It may not move the root onto substrate, omit the
eligible unit, or use a conservative whole-card exclusion moat.

Envelope probes include both base corners and the maximum transformed card
reach. All probes must remain outside physical source loops and on the occupied
side of the onset. Failures increment `exactEnvelopeFailures` and fail the
contract.

Terrain height is sampled at each root. The AI 359 structural base remains the
root/thatch reference. Simplified cards declare their rendered base/tip bounds
separately; they do not redefine AI 360's absolute near-tip distribution or
turn `25-30 mm` into a universal canopy height.

## Billboard and middle geometry

Both simplified tiers consume the same field-unit key/root:

| Tier | Geometry per represented unit | Triangle cost |
|---|---|---:|
| Billboard | one low atlas card | `2` |
| Middle | two deterministic crossed low atlas cards | `4` |

The nominal source rectangle is AI 358's `1.15 × 0.055 m`
`MID_CLUSTER` atlas interpretation. Deterministic yaw, bounded scale,
atlas variant, and restrained instance brightness vary the silhouette without
creating isolated tall objects. The billboard may use a bounded camera-facing
yaw bias with canonical gain `0.65`, but it cannot fully lock, flip, or change
world-unit identity.
Middle cards keep stable world orientation.

The billboard tier sinks its rendered base `0.010 m` into the opaque AI 359
cap to hide isolated atlas-tip fragments at grazing handoffs. This does not
change the `1.15 × 0.055 m` source card, root identity, eligibility envelope,
triangle count, or material. Middle cards use zero sink. Diagnostics report
rendered base and tip offsets separately from source height.

One card per metre is a complete overlapping strip field because its nominal
width exceeds the unit spacing. It is not the V1 pattern of one crossed card
every two metres. The far surface fills micro-coverage between alpha-tested
silhouettes.

## Shared AI 358 material contract

Billboard and middle batches share one AI 358 V2 `MID_CLUSTER` material object
resolved through `PbrTextureLoaderService`. It consumes:

- `midClusterColor`;
- `midClusterNormal`;
- `midClusterRoughness`;
- `midClusterAo`;
- separate `midClusterCoverage` through `alphaMap`.

The material retains the `4 × 2` eight-variant atlas, `0.35` alpha cutoff,
alpha-to-coverage when MSAA is available, cell-local UV remapping, zero-coverage
gutters, trilinear mips, opaque PBR channels, `vertexColors: false`,
`world_up_blend: 1.0`, depth writing, and runtime emissive intensity `0`.
Grass cards neither cast nor receive shadows.

Per-instance color is a restrained multiplier of the shared material, not a
new palette. Under neutral daylight and overcast, each simplified tier's median
geometry-on/texture-only luminance ratio must remain within `0.90-1.10`.

AI 361 must not add a tier-local texture loader, URL convention, palette,
material calibration, packed-alpha fallback, or separate billboard/middle
material response.

## Batching, culling, and uploads

`GrassMidClusterSystem` owns exactly two global instanced field batches in the
canonical Lab: one billboard batch and one middle batch. Both share the
material and field layout. A steady state draws at most one simplified batch;
a handoff may draw both.

Each mesh keeps valid computed instance bounds and frustum culling enabled.
Global capacity may grow geometrically, but a world unit, card, or polygon edge
must not add a draw. A future bounded-chunk adapter may subdivide for city
culling only if the combined draw budget and identical placement signatures
are retained.

Changed unit sets update only affected instance data. Exact camera visibility
state participates in the update key, so motion inside one ownership cell
cannot leave a stale visible set. Once camera, angle bucket, boundary signature,
AutoLOD state, and placement settings settle, the
field system performs zero recurring instance-buffer uploads. Material-only
changes do not rebuild placement.

Per-tier statistics include:

- `visibleUnits`, `instances`, `triangles`, and `drawCalls`;
- `transitionUnits` and `overlapUnits`;
- `totalBatches`, `visibleBatches`, and `culledBatches`;
- `lastBufferUpdates`, `totalBufferUpdates`, and `stationaryFrames`;
- `geometryBeyondCutoff`.

## Diagnostic forcing and evidence isolation

Automatic LOD is the production and approval path. Force modes are diagnostic
only. They may isolate an already eligible representation but never:

- create roots outside AI 359 coverage;
- expand AI 360 forced-near beyond its bounded near inspection;
- put billboard or middle geometry beyond the effective `25 m` cutoff;
- alter the far surface, substrate, cap, or physical edge;
- establish a second set of thresholds.

The Lab/capture API exposes deterministic evidence roles `auto`,
`texture_only`, `close`, `billboard`, `middle`, and `accent`. It also exposes
three handoff cameras with repeatable pre/center/post offsets and fixed-progress
`forward`, `reverse`, `strafe`, and `flyover` paths. A hysteresis-reset control
must make repeated motion sequences comparable.

## Localized-accent handoff

`LOCALIZED_GRASS_ACCENTS_V2.md` is the authoritative accent contract. Accents
consume the same AutoLOD evaluation and AI 359 coverage input. Their geometry
visibility follows `1 - textureWeight`, so explicit accents remain coherent
through close, billboard, and middle states and use the same final
middle-to-texture mask/hysteresis. They do not create another field tier or
extend the cutoff.

## Combined diagnostics and budgets

The Grass Lab snapshot exposes:

- AutoLOD schema/version, full sanitized config, force, weights, active tier,
  transition state/progress, distance, view angle/scale, and world cutoff;
- handoff IDs, shared samples, outgoing/incoming/overlap/unrepresented unit
  counts, and hysteresis state;
- field `boundarySignature`, `placementSignature`, coverage mode, coverage
  unit diagnostics, rejection counts, and exact failures;
- billboard/middle material identity, atlas role/maps, alpha/mip/normal policy,
  opacity, depth, shadow, and culling flags;
- boundary, near, billboard, middle, accent, and combined visible triangles and
  logical draws;
- renderer totals, CPU/GPU timing when available, buffer updates, and actual
  geometry beyond cutoff.

The `1920x1080` gate remains:

- average GrassEngine CPU `<=0.60 ms`;
- measured whole-frame GPU timer-query mean `<=1.50 ms` when supported;
- approximately `5-6` typical grass logical draws and `12` hard maximum;
- `<=200,000` combined visible grass triangles;
- zero geometry beyond cutoff;
- zero recurring stationary uploads.

The triangle total includes AI 359 boundary, AI 360 near, billboard, middle,
and localized-accent geometry. The canonical AI 359 reference boundary already
uses `95,219` triangles; approximately `50,000` is therefore field-hierarchy
guidance where practical, not a combined cap.

Low quality disables near, billboard, middle, and accent geometry while
retaining the corrected far surface, continuous substrate, opaque cap, and
maximum-two-draw physical boundary.

## Current validation state

The implementation candidate satisfies the V2 functional, deterministic,
coverage, cutoff, triangle, draw, upload, and bounded visual-handoff checks.
The focused AI 361 unit/contract slice passes `84/84`, and the Grass Lab
browser regression slice passes `5/5`. The billboard base-sink
native crop reduced affected silhouette area by `70.2%` while leaving the
texture and middle references byte-identical.

The hardware GPU gate remains failed on the RTX 3060 WebGL2/D3D11
reference: all five unmodified `1920x1080` rows measured above `1.50 ms`
(`2.0390`, `2.7656`, `2.3978`, `2.9434`, and `4.7930 ms` means for low,
default, high, top-down, and close/billboard overlap). CPU means remain below
`0.60 ms`. A draw-order A/B was rejected because four of five rows still
failed and output pixels changed. Profiling with all AI 361 field geometry
removed still measured the inherited scene near `2.67 ms`.

The user transferred that unchanged whole-scene GPU optimization and separate
performance approval to AI 537. The measurements remain failed baseline
evidence rather than a pass, projection, or permission to weaken the gate. They
no longer block completion of AI 361's hierarchy implementation after its
fresh final-code visual/functional matrix passes. AI 362 owns visual,
functional, motion, and determinism approval; AI 537 owns the final performance
approval. Gameplay remains blocked until both approvals pass.

## Determinism, regression, and visual gates

Automated coverage includes:

- exact polygons overriding contradictory compatibility rectangles;
- partial sidewalk/tree/corner units surviving while every root and envelope
  passes the exact query;
- equivalent inputs reproducing field/placement signatures and tier transforms
  after reload;
- all three distance handoffs at grazing, neutral, and top-down angles;
- adjacent tiers only, complementary masks, zero missing eligible units, and
  bounded overlap;
- deterministic forward/reverse hysteresis and strafe camera-cell crossings;
- bounded changed batches and zero recurring stationary uploads;
- forced tiers remaining inside coverage and cutoff;
- zero bright/card-band material regressions and the required luminance ratios;
- no field/accent geometry in the low fallback;
- combined triangle/draw compliance.

AI 361 evidence lives under the ignored directory
`tests/artifacts/screens/grass/ai361/`. Every final image is a UI-free lossless
PNG from a real `3840x2160` drawing buffer at pixel ratio `1`.

The final after matrix contains:

- texture/auto identical-camera pairs at all three handoffs;
- tree, far, grazing, top-down, bus, physical-cut, and cutoff views;
- aligned texture/close/billboard/middle/accent views under daylight,
  overcast, golden-hour, and night lighting;
- forward and reverse pre/center/post frames at all three handoffs;
- strafe left/center/right frames;
- six fixed-progress flyover frames.

The manifest records exact camera/target/height, effective distance, angle
scale, lighting, exposure, quality, evidence role, weights, signatures,
per-tier diagnostics, triangles, logical/renderer draws, and verified image
dimensions. Before/after cost tables use identical conditions and report
hardware, resolution, settings, coverage/density, route, warm-up, sample count,
statistic, frame time/FPS, memory, CPU/GPU timing, per-tier cost, and combined
budget verdict. Missing evidence or measurements are failed gates; unavailable
metrics are `not measured` with a reason, never projections.

## Downstream obligations and non-goals

AI 362, AI 537, and AI 363 consume this V2 evaluator, shared layout,
signatures, material ownership, handoffs, and budgets unchanged. AI 362 may
tune only bounded evidence settings; architectural failures return to AI 361.
AI 537 may optimize whole-scene rendering only while preserving AI 362's
approved visual/functional output. AI 363 may adapt terrain/camera inputs after
both approvals but may not create a gameplay-only LOD policy.

This contract does not:

- rebake or recolor AI 358 assets;
- move AI 359 onset loops, substrate reveal, cap, edge, or tree holes;
- change AI 360 roots, density, fibers, height, or near materials;
- create field-wide localized tufts or a worn substrate overlay;
- approve the assembled runtime;
- modify gameplay, collision, terrain height, roads, sidewalks, or navigation;
- authorize gameplay before AI 362 visual/functional approval, AI 537
  performance approval, and AI 363 execution.
