# Grass Coverage and Sidewalk Edge V2

## Scope and authority

AI 359 replaces the historical rectangular V1 approval footprint with the
canonical polygon coverage contract for corrective grass work. This contract
owns the continuous substrate, the hard grass footprint, the exposed strip
between a sidewalk and grass, the structural root/thatch cut, and the tree-base
substrate exclusion in the dedicated Grass Lab.

AI 360 and AI 361 consume the occupancy, signed boundary distance, and root
eligibility defined here for their respective representations. AI 362 validates
the assembled lab system, and AI 363 is the only phase authorized to connect it
to gameplay. This specification does not authorize changes to near/middle
representation, automatic LOD, quality-preset policy, or gameplay.

AI 360's representation contract is
`specs/grass/NEAR_GRASS_CARPET_PATCH_V2.md`. It applies this query to every
micro-clump root, retains eligible bins from partially excluded ownership cells,
and keys its placement cache to this definition's `boundarySignature`.

The V1 contract in `GRASS_COVERAGE_AND_SIDEWALK_EDGE_V1.md` remains historical
evidence. Its rectangular partition, sparse fringe, alpha-cut cap, and three-draw
boundary are not the V2 approval path.

## Stable contract identity

- schema: `bus-simulator.grass-coverage`
- version: `2`
- application contract: `src/app/grass/GrassCoverageContract.js`
- sidewalk-loop producer and offset operation:
  `src/app/road_decoration/sidewalks/RoadSidewalkBuilder.js`
- rendered source handoff: `RoadEngineRoads.sidewalkOuterBoundaryLoops` and
  `RoadEngineRoads.sidewalkBoundarySource`
- boundary renderer:
  `src/graphics/engine3d/grass/GrassCoverageSurfaceSystem.js`
- canonical lab adapter: `createGrassLabCoverageDefinition()`

`boundarySignature` hashes the normalized source/onset geometry and source
identities. `sourceLoopIdentity` carries the ordered source identities used by
the definition. Consumers must invalidate cached placement or geometry when the
boundary signature changes; a display label or seed alone is not a substitute.

## Same-source polygon handoff

The canonical sidewalk exclusion must be derived from the exact RoadEngine data
used by the visible sidewalk:

1. RoadEngine derives its asphalt and junction primitives.
2. `buildRoadSidewalkOuterBoundaryLoopsFromRoadEnginePrimitives()` uses those
   same primitives and the same curb, sidewalk-width, start-offset, epsilon, and
   miter settings used by the sidewalk mesh.
3. RoadEngine returns those world-XZ loops together with a frozen source record.
   The record includes primitive IDs, per-loop IDs, loop count, and the geometry
   configuration that produced them.
4. The lab offsets each rendered sidewalk outer loop outward to create the grass
   onset loop. The default offset is `0.080 m`.

### Lab-only junction topology and canonical pairing

Shared RoadEngine asphalt, curb, sidewalk, and dirt builders retain their
historical primitive and offset paths. AI 359 does not prune, replace, or
stabilize those shared loops, so the existing asphalt-to-curb and
curb-to-sidewalk seams remain exact for every caller.

The canonical Grass Lab alone supplies `junctions.filletRadiusFactor: 1.0` to
its RoadEngine fixture. That fixture input produces a simple rendered sidewalk
outer loop and a simple `0.080 m` onset for the required curved, diagonal, and
corner views. It is not a new global RoadEngine default. AI 363 must consume
the actual gameplay road configuration and exported loops rather than copying
this Lab-specific factor as a gameplay requirement.

`buildRoadSidewalkGrassBoundaryLoopPairs()` creates the grass handoff from each
exported loop. It normalizes a non-mutating copy to counter-clockwise
orientation, removes duplicate/collinear noise once, and returns the normalized
`sourceLoop` together with the `onsetLoop` offset from that exact same point
list. Source and onset must have equal point counts, so they cannot drift into
different topology after normalization. The exported RoadEngine loop identity
remains the stable source identity for the pair.

The visible sidewalk and coverage system therefore share one topology source.
A separately reconstructed rectangle, route envelope, texture mask, or
hand-authored approximation is not an acceptable V2 boundary source. Curves are
the deterministic polyline tessellation produced by RoadEngine; diagonal runs
and both turn directions remain polygon edges rather than stepped cells.

Each boundary exclusion has these fields:

| Field | Meaning |
|---|---|
| `id` / `kind` | Stable semantic identity such as `sidewalk` or `tree_base` |
| `sourceIdentity` | Stable identity of the rendered physical source |
| `sourceLoop` | Physical sidewalk outer edge or trunk-clearance edge |
| `onsetLoop` | Hard grass exclusion edge after the substrate reveal |
| `substrateRevealMeters` | Declared source-to-onset distance for diagnostics |
| `shape` | Diagnostic shape label; it does not change sampling semantics |

Loops are normalized to non-degenerate counter-clockwise polygons. For a
sidewalk, the source loop is the visible outer edge and the onset loop is the
outward offset. For a tree, the source loop is the scaled trunk-clearance circle
and the onset loop is the scaled worn-substrate radius. Tree reveal width is a
separate localized value and must not be included when judging the sidewalk's
`60-100 mm` acceptance range.

Compatibility rectangles may be converted into polygon exclusions when no V2
polygon source is supplied. They exist for legacy callers and tests only. When
exact boundary exclusions are supplied, legacy rectangle fields are not an
approval source and downstream tiers must not use them in place of the polygon
contract.

## Occupancy, distance, and root eligibility

`sampleGrassCoverageContract(definition, x, z, config)` is the authoritative
query. The three placement signals are deliberately independent of material
alpha and substrate color:

| Signal | Contract |
|---|---|
| `occupied` / `occupancy` | Hard boolean/numeric inclusion: inside terrain bounds and outside every onset loop |
| `boundaryDistanceMeters` | Signed Euclidean distance to the nearest grass-onset loop; positive on occupied grass and negative in an exclusion |
| `sourceBoundaryDistanceMeters` | Signed distance to the associated physical source loop; negative inside the sidewalk/trunk source |
| `rootEligible` | Occupied and at least `rootClearanceMeters` from the onset loop |
| `antialiasFactor` | Narrow visual edge factor only; it never changes hard occupancy or root eligibility |

Samples outside terrain bounds are always unoccupied and root-ineligible.
Downstream geometry must test each root or a provably equivalent fine-grained
unit. Using cap alpha, far-surface coverage, humidity, dryness, density, or a
soft biome weight to decide physical occupancy is forbidden.

The canonical root-clearance default is `0.003 m`. The clearance is measured on
the grass side of the onset loop. A root on the source-to-onset substrate strip,
on its boundary, inside a tree exclusion, or outside terrain bounds is rejected.
AI 360 and AI 361 own enforcement for their geometry, but they may not redefine
the sign or eligibility semantics.

## Physical dimensions

| Property | Canonical value / range |
|---|---:|
| Sidewalk-to-grass substrate reveal | `0.080 m` default; `0.060-0.100 m` accepted |
| Structural root/thatch base | `0.0275 m` default; `0.025-0.030 m` approval reference |
| Grass-onset antialias width | `0.012 m` default; `0.015 m` hard maximum |
| Root clearance | `0.003 m` default |
| Dense cut-edge sample spacing | `0.018 m` default |
| Dense cut-edge root inset | `0.004 m` default |
| Visible cut-edge blade-tip elevation | `0.040-0.075 m` default distribution |

The structural base and visible blade tips are separate quantities. The
`25-30 mm` range describes the shallow root/thatch body, not a universal canopy
ceiling. Profiles may use longer, bent, and irregular blades, provided each root
remains eligible and the physical cut still reads as a shallow maintained layer.

Changing a config display value does not move polygon geometry by itself. Any
change to sidewalk reveal must regenerate the onset loops from the unchanged
rendered source loops and produce a new boundary signature.

## Substrate and material policy

The PBR substrate is one continuous surface beneath the complete lawn,
sidewalk-adjacent reveal, and tree exclusions. The narrow visible strip is real
uncovered substrate between `sourceLoop` and `onsetLoop`; it is not a brown
overlay or material crossfade.

Where this maintained-grass boundary is active, RoadEngine is called with the
legacy sidewalk edge dirt strip suppressed. The old translucent dirt material
may remain available to unrelated callers, but it must not be drawn underneath
or beside the V2 approval edge.

The cap and edge materials resolve through the shared catalog/calibration
pipeline and consume AI 358's corrected V2 grass appearance. The cap is fully
opaque within the triangulated hard footprint:

- `transparent: false`;
- no alpha map or auxiliary far-coverage cutout;
- `alphaTest: 0` and no alpha-to-coverage dependency;
- depth writing enabled;
- humidity and dryness may alter bounded PBR response but never footprint.

AI 358's far coverage texture remains appearance/asset data for card use. It
must not punch square, stochastic, or micro holes through the V2 physical cap.
The edge is likewise opaque and zero-emissive. Neither boundary material may add
a Grass Lab-local texture loader or calibration path.

## Boundary geometry and draw contract

`createGrassCoveragePartition()` returns one terrain contour, polygon hole loops
at every grass onset, stable boundary segments, and diagnostics. The renderer
triangulates the contour with all holes into one cap mesh at the structural-base
height.

One second batched mesh contains the complete physical edge:

- two side triangles per boundary segment form a dark root/thatch cut rather
  than a flat green wall;
- densely spaced, deterministic crossed cut blades grow from roots inset onto
  eligible grass;
- all sidewalk and tree edges share the same edge material and draw.

Every proposed dense-edge root is sampled through
`sampleGrassRootEligibility()` before its two crossed triangles are emitted.
Rejected proposals contribute no vertices, root sample, or triangles and are
reported by `rejectedCutEdgeRoots`. The final canonical fixture emits `46,879`
eligible roots and reports zero rejected candidates and zero post-build
ineligible roots.

Static partition construction, cut-edge emission, and geometry-safety sampling
always evaluate an enabled geometry config. Runtime `enabled` remains a
visibility/cost switch only. Disabling coverage, changing a definition or
geometry setting, and re-enabling it therefore cannot cache missing blades or
false intrusion diagnostics.

The boundary subsystem therefore has a hard ceiling of two logical draws when
both parts are visible: one opaque cap draw and one combined root/thatch plus
dense-cut-edge draw. The already existing substrate draw is excluded from this
ceiling. Visibility may reduce the count, never increase it. Per-loop,
per-segment, or per-blade draw growth is forbidden. Grass shadows remain off and
both meshes retain frustum culling.

Geometry safety is stricter than visual overlap. Every cap, side, and cut-edge
vertex owned here must stay out of the physical source loops, and every recorded
cut-edge root must pass root eligibility. The system reports true physical-source
and grass-onset intrusions separately from Float32-quantized boundary contacts.
True intrusions and ineligible edge roots must be zero; contacts are accepted only
when their depth stays within the scale-aware two-ULP position tolerance.

## Tree-base substrate ownership

Each canonical tree placement contributes a deterministic hard polygon hole.
Its inner source loop is the scaled trunk-clearance radius and its onset loop is
the scaled worn-substrate radius. The same continuous substrate is visible
through that hole.

V2 does not draw an opaque worn-material disc over live grass. Localized accent
placement may continue outside the onset loop, but it must query this contract
per root. AI 361 may reconcile the look of those accents without restoring the
disc or changing the exclusion.

## Required diagnostics and determinism

The lab snapshot must expose enough data to trace a render back to its source
and prove the acceptance gates:

- source-loop identity, boundary signature, source and onset loop counts;
- sidewalk onset minimum/maximum independently from tree reveal widths;
- structural-base height and visible blade-tip minimum/maximum;
- antialias width and root clearance;
- total, sidewalk, tree, diagonal, and curved segment counts;
- inside/outside corner counts;
- occupied, excluded, and root-eligible boundary probes;
- maximum and mean source-to-onset deviation;
- cap, root/thatch, dense-edge, and total triangle counts;
- proposed roots rejected before emission, emitted root samples, and any
  post-build ineligible roots;
- cap, edge, and total logical draws plus material paths;
- opaque/alpha flags, source intrusions, sampled edge roots, and ineligible roots.

Equivalent source geometry, settings, and seed must reproduce the same
normalized loops, identities, boundary signature, triangle counts, root sample
counts, and diagnostics after reload. The seed may vary deterministic cut-edge
blade details; it must not move the occupancy/onset polygon.

## Regression and visual gates

Automated regression coverage must include:

- same-source parity between rendered sidewalk loops and coverage source loops;
- `80 mm` default and `60-100 mm` accepted sidewalk reveal;
- signed occupancy/distance/root samples on both sides of the onset;
- straight, curved, diagonal, inside-corner, outside-corner, and tree-base
  topology;
- zero road, sidewalk, trunk, cap, side, or dense-edge intrusion;
- opaque cap with no auxiliary alpha holes and suppressed legacy dirt fade;
- at most two boundary logical draws excluding substrate;
- stable geometry/signatures after reload.

AI 359 evidence lives under the ignored directory
`tests/artifacts/screens/grass/ai359/`. Capture at least nine matched camera
states, each as a substrate-only and boundary-final pair: straight inspection at
`0.30 m`, `0.50 m`, and `1.00 m`, plus zoomable straight, curve, diagonal,
inside-corner, outside-corner, and tree-base views. Every delivered frame must
be UI-free lossless PNG from a native `3840x2160` drawing buffer at pixel ratio
`1`. The pair must keep camera, target, lighting, exposure, and quality state
identical and disable legacy near, cluster, and localized geometry.

The prompt may not complete until the manifest contains all required pairs,
native dimensions are verified, and measured before/after cost tables report
cap/boundary/total grass triangles and logical/renderer draws for the exercised
fixtures and presets. Missing timing must be labeled `not measured` with a
reason; it cannot be replaced by an estimate.

## Downstream obligations and non-goals

AI 360, AI 361, AI 362, and AI 363 must consume this exact V2 definition and
signature. In particular, they must preserve polygon onset geometry, signed
distance orientation, root clearance, tree holes, opaque cap behavior, shared
substrate ownership, and the two-draw boundary ceiling.

`GrassEngine.setNearCarpetCoverageInput({ definition, config })` forwards this
contract to
`GrassNearCarpetSystem.setCoverageInput({ definition, config })`. When
`definition.exclusions` contains exact polygons, compatibility rectangles are
ignored even if a caller also supplies them. Every represented root passes the
authoritative query; deterministic boundary-completion roots sit at
`rootClearanceMeters + epsilon` on the occupied side so the carpet reaches the
cut without restoring V1's whole-patch moat. A boundary-signature or
root-clearance change invalidates the near placement cache before rendering.

This contract does not:

- alter near density, near patch construction, billboard/middle geometry, LOD
  ranges, quality presets, or localized placement seeds;
- approve the combined V2 grass hierarchy;
- install staged AI 358 assets into gameplay;
- change collision, terrain height, navigation, road, or sidewalk behavior;
- authorize gameplay integration before AI 362 approval and AI 363 execution.
