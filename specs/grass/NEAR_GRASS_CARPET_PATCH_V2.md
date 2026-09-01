# Cohesive Near Grass Carpet Patch V2

> **Human visual validation: REJECTED (2026-08-31).** This specification documents the rejected AI 350–362/AI 537 solution for historical reference only. It is not an approved visual baseline and cannot authorize gameplay. See `GRASS_LAB_HUMAN_REJECTION.md`.

## Scope and authority

AI 360 replaces the historical sparse one-metre V1 patch appearance with the
canonical closest-camera mesh representation for corrective grass work. This
contract owns area-complete near placement, exact root clipping, the near blade
shape and height distribution, near batching, camera-cell stability, and the
forced-near diagnostic path in the dedicated Grass Lab.

AI 358 remains the appearance authority and AI 359 remains the physical
footprint authority. AI 360 consumes both without changing their semantics. AI
361 owns automatic tier ranges, billboard and middle-patch representations,
handoffs, and accent reconciliation. AI 362 owns whole-system approval, and AI
363 alone may attach the approved result to gameplay.

`NEAR_GRASS_CARPET_PATCH_V1.md` remains historical evidence. Its repeated
48-blade patch, rectangular whole-patch exclusion, and sparse V1 visual result
are not the V2 approval path.

## Stable contract identity

- schema: `bus-simulator.near-grass-carpet`
- version: `2`
- layout/config module:
  `src/graphics/engine3d/grass/GrassNearCarpetLayout.js`
- renderer: `src/graphics/engine3d/grass/GrassNearCarpetSystem.js`
- engine owner: `src/graphics/engine3d/grass/GrassEngine.js`
- canonical Lab adapter: `createGrassLabEngineConfig()`
- canonical Grass Lab snapshot contract version: `9`
- physical footprint input: `bus-simulator.grass-coverage` version `2`
- appearance input: `grass.natural.maintained.material.v2`

`GrassEngine.setNearCarpetCoverageInput({ definition, config })` forwards the
coverage input to
`GrassNearCarpetSystem.setCoverageInput({ definition, config })`. A canonical
Grass Lab run must provide AI 359's exact definition. Compatibility callers that
do not yet supply that optional input may retain their historical rectangle
behavior until AI 363; that compatibility must not be selected when a V2 polygon
definition is present.

The placement cache records AI 359's `boundarySignature`. The complete near
placement/cache identity additionally includes the near seed, terrain bounds,
camera ownership cell, `patchSizeMeters`, `bladesPerSquareMeter`,
`fibersPerRoot`, root jitter, root clearance, boundary-completion
spacing/inset/safety settings, the maximum blade width, tip distribution, and
every other setting that changes a root or fiber transform. Equivalent inputs
reproduce one stable placement signature. A changed boundary signature or
placement-relevant setting invalidates the affected cache before rendering.
`placementSignature` covers both root positions and the deterministic fiber
transforms/configuration rather than hashing the root list alone.

## Area-complete micro-carpet

V2 treats a deterministic world-space area bin as the coverage unit. It does not
randomly decide whether a one-metre patch exists. The canonical organization is:

| Property | Canonical value / meaning |
|---|---:|
| Ownership cell | `1.0 m x 1.0 m` world-aligned cell |
| Root-bin density | `bladesPerSquareMeter: 64` compatibility field; one represented root per bin |
| Nominal root-bin footprint | `0.125 m x 0.125 m` |
| Fibers per represented root | `3` deterministic one-triangle fibers |
| Nominal fiber cost | `192` triangles per represented square metre |
| World chunk size | `32 m` |

Every ownership cell intersecting the active near inspection region is
enumerated. Every root bin with a canonical root-eligible sample is an eligible
bin, and every eligible bin emits one represented root. The three fibers at that
root use deterministic yaw, width, height, bend, inclination, and restrained
brightness variation. They are an aggregated visual representation of a dense
natural carpet, not a claim to model literal real-world blade count.

The opaque AI 359 cap remains underneath the fibers. It owns continuous
coverage between the resolvable near fibers, so density tuning never reveals an
empty ground layer. Random cell selection, one visible blade every few metres,
and field-wide isolated tufts are forbidden as the primary near representation.

The diagnostics derive represented area from the same deterministic bins used
for placement. `eligibleBins - representedBins` is
`unrepresentedEligibleBins`, and the canonical near path requires it to be
zero. A bin that contains no eligible canonical sample is excluded rather than
counted as a missing representation.

## Exact AI 359 clipping

AI 359's query is authoritative for every emitted V2 root:

1. `sampleGrassCoverageContract()` is evaluated against the supplied exact
   coverage definition and sanitized coverage config.
2. The sample must be occupied, have positive-on-grass signed boundary
   distance, and report `rootEligible: true`.
3. The canonical `0.003 m` root clearance remains owned by AI 359. AI 360 reads
   it and does not redefine it.
4. The same test applies to rendered-sidewalk onset loops, tree-base onset
   loops, terrain bounds, and any later exact polygon exclusion.
5. Rejected roots emit no instance, vertex, or triangle.

Exact polygon exclusions take unconditional precedence over compatibility
rectangles. Rectangle envelopes, far-texture alpha, material coverage, humidity,
dryness, and antialias factors may not decide near placement when polygons are
available.

An ownership cell is never rejected merely because its center or one corner is
inside an exclusion. Eligible bins in the remainder of that cell still render.
At a physical cut, deterministic boundary-completion roots may be placed at
`rootClearanceMeters + epsilon` on the occupied side of the exact onset loop.
Those roots pass the same authoritative query before emission. This closes the
historical conservative moat without moving the polygon or putting a root on
the exposed substrate.

`boundaryRoots` counts accepted completion roots. `clippedRoots` counts
otherwise proposed roots omitted because the exact query rejected them.
Sidewalk and tree rejections are reported separately. A post-build pass samples
every emitted root again; `ineligibleRoots` must be zero.

The root test owns physical placement. Fiber width and bend remain bounded by
the declared geometry distribution; they must not be used to move the root
across the onset or claim occupancy on the substrate side.

Root clearance alone is not sufficient if a fiber's maximum lateral bend could
cross the onset. A boundary micro-clump must orient its fibers toward occupied
grass and verify the relevant base/tip envelope samples, or inset the root by
the complete declared lateral reach. This constraint preserves exact visual
clipping without creating a conservative whole-bin moat.

## Structural base and blade-height semantics

AI 359's `0.0275 m` structural-base height is an absolute elevation above the
terrain in the canonical flat Lab fixture. It is the top of the opaque cap and
the root elevation of the near fibers. It is not the blade height and is not a
universal canopy limit.

The canonical V2 near range is expressed as absolute blade-tip elevation:

| Property | Canonical value |
|---|---:|
| Structural base / root elevation | `0.0275 m` |
| Visible blade-tip minimum | `0.040 m` |
| Visible blade-tip maximum | `0.075 m` |
| Corresponding visible fiber length | `0.0125-0.0475 m` |

Tip elevation varies deterministically across the interval. The implementation
must retain multiple observed heights, directions, bends, and inclinations; it
may not collapse the carpet to one height or reinterpret `25-30 mm` as a canopy
ceiling. A changed structural-base height shifts root elevation, while a changed
tip distribution changes fiber geometry. Diagnostics report both configured and
observed minimum/maximum values so side-profile evidence cannot conflate them.

## AI 358 appearance and material path

Near fibers consume `LOW_CUT_GRASS_ASSET_FAMILY.nearBladeAppearance` and the
shared V2 material response:

- base color `#494E30`;
- tip color `#616743`;
- roughness `0.94`;
- metalness `0`;
- emissive color black and emissive intensity `0`.

The shared far surface remains the color and luminance reference. Near geometry
uses one normal material path, is opaque and depth-writing, and does not use
transparent sorting or alpha-derived occupancy. Restrained deterministic
per-root variation may modulate the shared palette, but it may not introduce a
second palette, self-lit lift, or per-patch material.

The near micro-mesh uses its physical mesh normals. AI 358's
`world_up_blend` policy remains specific to billboard and accent cards; applying
that card policy is not required for the opaque near mesh.

The Grass Lab's existing catalog and material composition path supplies the
appearance payload. The near renderer must not create a texture resolver,
loader, URL convention, or independent calibration path. The card-atlas alpha
and mip rules remain AI 361 concerns and do not alter this opaque micro-mesh.

## Batching, culling, and upload contract

All near roots share one micro-clump geometry and one material. Roots are
batched into world-aligned chunk `InstancedMesh` objects. Draws may therefore
grow only with the bounded number of visible chunks, never with roots, bins, or
ownership cells. With a `32 m` chunk and the canonical bounded forced-near
inspection radius, the near subsystem intersects no more than four chunks and
therefore contributes no more than four logical draws.

Every chunk keeps frustum culling enabled and recomputes its bounds after an
instance-buffer write. Grass casting and receiving shadows remain disabled.
Instance data are retained while an ownership cell remains active. Crossing a
camera-cell boundary diffs the prior and next cell sets and rewrites only chunks
affected by entering or leaving roots.

After the camera, coverage signature, and placement settings settle, the near
system performs zero recurring instance-buffer uploads. A render loop may update
visibility and diagnostics without marking static instance buffers dirty.
Appearance-only changes update the shared material or tiny shared geometry as
needed; they do not invalidate root placement.

## Forced-near inspection and AI 361 handoff

`texture_only` and `near_mesh` are evidence roles, not production LOD modes.
Both retain the same AI 359 substrate, cap, cut edge, camera, lighting,
exposure, and quality state. Both hide V1 field geometry, middle clusters, and
localized accents. `texture_only` hides only the AI 360 fibers; `near_mesh`
shows the complete bounded near candidate region.

Forced-near inspection uses the configured near radius and never expands to a
middle-tier or field cutoff. It does not establish automatic distance ranges,
overlap, hysteresis, or quality-preset policy. AI 361 will consume this
representation and its placement contract, then own the canonical automatic
order and handoffs.

Disabling or switching evidence visibility must not rebuild AI 359's boundary,
destroy a valid near cache, or report hidden geometry as visible cost. Returning
to normal mode restores the engine-owned visibility state without leaving
middle or accent groups incorrectly hidden.

## Required diagnostics and determinism

The near snapshot exposes at least:

- contract version, near seed, `placementSignature`, AI 359
  `boundarySignature`, source-loop identity, and `coverageMode`
  (`exact_polygon` or compatibility);
- ownership-cell size, `bladesPerSquareMeter` root-bin density,
  `fibersPerRoot`, active radius, and root-clearance value;
- `diagnostics.candidateBins`, `eligibleBins`, `representedBins`,
  `unrepresentedEligibleBins`, `eligibleAreaSquareMeters`, and
  `representedAreaSquareMeters`;
- proposed roots, root instances, fiber instances, boundary roots, clipped
  roots, `rejectedByKind.sidewalk`, `rejectedByKind.tree_base`,
  `exactPostcheckFailures`, and flattened post-build ineligible roots;
- minimum emitted-root boundary distance and configured/observed base and tip
  elevations;
- near triangles, logical draws, material paths, total/visible/culled chunks,
  and opaque/depth/shadow/frustum safety flags;
- last and total buffer updates, stationary frames, entering/leaving/retained
  cells, and cache hits, misses, and invalidations;
- evidence role and whether non-near representations are hidden.

Equivalent seed, terrain, camera ownership cell, coverage definition/config,
and near settings must reproduce identical eligible/represented bins, root and
fiber counts, transforms, placement signature, triangle counts, and material
path count after reload. Boundary-signature changes must increment cache
invalidation and rebuild before the next visible frame.

Coverage-derived partition/edge data are cached across camera-cell moves and
reused until their boundary signature or placement-relevant coverage config
changes. Candidate-bin sampling may short-circuit after the first eligible
canonical sample, but the optimized result must remain byte-for-byte
deterministic with the full query.

## Performance and headroom

The corrective runtime ceiling remains `200,000` visible grass triangles and
`12` logical grass draws at the `1920x1080` performance gate. Costs include AI
359's cap and physical edge. Because the canonical AI 359 boundary already uses
`95,219` triangles and two draws in the Lab fixture, an approximately `50,000`
total-grass target is not literally attainable there; it remains an aspirational
field-geometry target where practical, while the `200,000` ceiling is the hard
authority.

AI 360 reports near-only, boundary, and combined cost separately. The selected
root density must produce a cohesive result at the required close views while
leaving measured triangle and draw headroom for AI 361's billboard, middle, and
accent tiers. Instance count is diagnostic context and is not a substitute for
triangle, draw, memory, frame-time, CPU, or GPU measurements.

## Regression and visual gates

Automated regression coverage must include:

- exact polygons winning over deliberately contradictory compatibility
  rectangles;
- per-root clipping for straight, curved, diagonal, inside-corner,
  outside-corner, and tree-base exclusions;
- zero `exactPostcheckFailures`, zero ineligible emitted roots, and zero
  `unrepresentedEligibleBins`;
- boundary-completion roots reaching the physical cut without a whole-cell
  moat;
- signature/config cache invalidation and deterministic reload;
- camera-cell retention, bounded changed chunks, chunk culling, and zero
  recurring stationary uploads;
- one opaque, depth-writing, zero-emissive, shadow-free near material path;
- AI 358 geometry-on/texture-only median-luminance ratios within `0.90-1.10`
  for the neutral daylight and overcast comparisons;
- configured and observed non-uniform tip-height range;
- near-only and combined triangle/draw budget compliance;
- compatibility behavior remaining opt-in and gameplay remaining unchanged.

AI 360 evidence lives under the ignored directory
`tests/artifacts/screens/grass/ai360/`. Capture matched `texture_only` and
`near_mesh` frames for `0.30 m`, `0.50 m`, and `1.00 m` camera heights plus
grazing, forward, oblique, top-down, physical-cut low side-profile, and bus-scale
views. Every delivered frame is a UI-free lossless PNG from a real
`3840x2160` drawing buffer at pixel ratio `1`; each pair keeps camera, target,
lighting, exposure, and quality state identical.

The manifest records the state and diagnostics above together with near,
boundary, combined, and renderer costs. Same-condition before/after tables
report hardware, resolution, settings, density/coverage, workload/camera,
warm-up, sample count, statistic, frame time/FPS, relevant memory, triangles,
draws, and CPU/GPU timing. An unavailable metric is labeled `not measured` with
a reason; a missing required image is a failed completion gate.

## Downstream obligations and non-goals

AI 361, AI 362, and AI 363 consume this V2 representation without forking its
area-complete bins, exact root query, placement signature, height semantics,
appearance family, or batching contract. AI 361 may control which already-valid
near roots are visible during a handoff, but it may not replace them with sparse
random patches or rectangle-derived exclusion.

This contract does not:

- change AI 359 polygon construction, substrate reveal, cap, physical edge, or
  two-draw boundary ceiling;
- create billboard or middle-patch geometry, automatic LOD ranges, transition
  overlap/hysteresis, or localized-accent rendering;
- change quality-preset policy or issue whole-system approval;
- rebake AI 358 assets or create a near-local material loader;
- alter collision, terrain height, navigation, roads, sidewalks, or gameplay;
- authorize gameplay integration before AI 362 approval and AI 363 execution.
