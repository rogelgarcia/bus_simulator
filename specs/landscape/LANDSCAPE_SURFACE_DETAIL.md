# Fine landscape surface detail pages

Status: AI577 D2 contract. Implementation and measured results are recorded in
`prompts/AI_codex_landscape_577_MATERIAL_realistic_landscape_surfaces_and_multiscale_detail.md`.

D1 reconstructs continuous material coverage from the 1.953125 m native cover grid and
the 15.625 m natural-infill overview. Near the camera that reconstruction is
source-limited: long boundaries read as straight vector edges and narrow features or
junctions keep native-cell stair steps. D2 adds **generated** fine coverage pages below
the native level. They are derived visual detail produced from retained inputs by a
versioned recipe and seed. They are never presented as finer measured or imported data,
and they never change authoritative heights, cover, soil overrides or exact queries.

## Levels and addressing

Fine pages extend the categorical coverage quadtree below `grid.maxLevel`. The default
recipe adds three levels. For the coastal landscape (`maxLevel` 3):

| Level | Sample spacing | Page span | Role |
| --- | ---: | ---: | --- |
| L4 | 0.9765625 m | 250 m | Intermediate generated level |
| L5 | 0.48828125 m | 125 m | 50 cm near-camera target |
| L6 | 0.244140625 m | 62.5 m | 25 cm near-camera target |

IDs keep the `l<level>/c<column>/r<row>` form, rows increasing south. A fine page has the
same stored layout as a D1 mask page: `columns × rows` samples (257² on the coast) plus a
two-sample halo, packed as RGBA8 (261² texels). Its parent is the quadtree parent;
L4 parents are native pages. Fine descriptors are derived from the manifest grid on
demand. They are not manifest chunks, are not persisted, and carry `generated: true`,
`measured: false`, a fractional `sampleStride` and explicit world `spacing`.

Fine levels are optional, configurable and recipe-bound: `levels` 0 disables them, 2
stops at the 50 cm target and 3 reaches 25 cm. The viewer accepts
`landscapeSurfaceDetail=off|50cm|25cm`, defaulting to `25cm`.

## Inputs, recipe and identity

A page is a deterministic function of:

- the recipe (`landscape-surface-detail-v3`), its canonical hash and seed;
- the authenticated native cover channels whose samples fall within the page's
  canonical support window, and the overview cover used by natural infill;
- the ordered semantic soil overrides whose regions intersect the page's influence
  bounds, with their order, region geometry and soil;
- the soil catalog order, cover-to-soil mapping and planning-only classes;
- the page address and the landscape's spatial frame.

The manifest revision, heights, material bindings, camera, residency order and arrival
order are **not** inputs. A soil edit therefore changes only the identity of pages whose
influence bounds intersect the edited region; all other pages keep their identity and
can be reused. Every recipe declares a stable `family` (`landscape-surface-detail`) and an id of
the form `<family>-v<n>`. The seed defaults to a 32-bit FNV-1a hash of
`<landscapeId>|<recipeFamily>` (coastal landscape: 1207276911), so a later recipe version
changes page identities through its hash but keeps the procedural pattern's seed.
The identity key is a stable hash of the canonical JSON of all inputs. Inspection
retains the complete input list, recipe hash and seed of every resident page.

## Generation

Generation runs in two dedicated surface-detail workers, never in the render loop. The
recipe `landscape-surface-detail-v3` lives in `LandscapeSurfaceDetailRecipe.js`; its
validator and identity code live in `src/app/landscape/LandscapeSurfaceDetail.js`.

1. **Canonical support.** Native display labels (natural infill, without authored
   overrides) are built for a window covering the page, its stored halo, the boundary
   query radius, the maximum warp and a 19-cell smoothing dependency margin. Each sample
   reads authenticated same-level cover by canonical global coordinates, as D1 halos do,
   so the result does not depend on which pages are resident. A window in which more than
   12.5% of label edges are boundaries is rejected as *too fragmented*; this keeps scratch
   bounded by its published estimate. Coastal page windows reach at most 2.57%.
2. **Smoothed vector boundaries.** Multi-label marching squares extract the native label
   boundaries: vertices at edge midpoints, a junction vertex at the center of any cell with
   three or more labels, saddles connecting the minority label of the surrounding 4×4 block
   (ties: lower soil index). Chains are smoothed by a turning-limited local quadratic fit
   (triweight kernel, σ = 3 cells) that keeps junctions and sharp turns fixed. Displacement
   is capped at one cell and at 0.45 of the gap to other boundaries, so thin features cannot
   cross. Closed loops under eight cells are subdivided, rounded and rescaled to their
   original area. Staircases become straight lines (RMS 0.001–0.069 m from the fitted line
   for slopes 1/3, 1/7 and 1); one-cell strips, tapering strips and single-sample islands
   survive as smooth connected shapes; designed corners are rounded; straight coastal edges
   stay within 0.12 m of the D1 fitted contour. Geometry is derived from canonical global
   coordinates in a fixed order, so overlapping windows agree bit for bit in their shared
   region.
3. **Shared warp.** Each fine sample position `x` is displaced by a world-anchored vector
   warp `W(x)`: gradient noise with odd-quintic shaping, wavelengths 48/24/12/6 m and
   amplitudes 1.8/0.75/0.35/0.1 m. Over the coastal extent the mean is about 0.81 m per axis,
   the peak 2.86 m (bound 3 m), the maximum Jacobian norm 0.417 and the minimum
   `det(I+J)` 0.573, so the warp never folds. The same warp is evaluated in the terrain
   shader through the chunk `chunks/landscape/surface_warp.glsl`
   (`vec2 landscapeSurfaceWarp(vec2 worldXZ)`, uniforms from `landscapeSurfaceWarpUniforms`).
   Native and coarser coverage therefore meanders identically to the fine pages; the GPU
   agrees with JavaScript within 8.5e-5 m.
4. **Labels and boundary distance.** At `x + W(x)` the nearest smoothed segment gives the
   label (the side containing the point), the competing soil and the exact distance; the
   pair's signed distance is positive toward the larger soil index. Beyond the query radius
   the nearest native sample's label applies. Queries use a bucket grid with canonical tie
   breaking.
5. **Authored overrides.** Ordered overrides are composited at `x + W(x)` with exact
   signed distances of their circle, rectangle or polygon geometry. Each sample keeps its
   nearest *visible* boundary with a different soil: base edges hidden under an override and
   override edges hidden under a later override are skipped; inside an override, the soil
   just beyond each edge is read one millimetre outside it (the influence bounds include that
   millimetre). The semantic nibble uses exact containment at the unwarped `x`.
6. **Pair profiles and breakup.** A data catalog of unordered soil-pair profiles sets the
   transition width (at most 2.5 m) and breakup scale: loam|sand 1.2 m × 1.6,
   sand|seabed 2.0 m × 0.35, forest|loam 2.0 m × 1.8, forest|sand 1.4 m × 1.3,
   loam|seabed and forest|seabed 1.4 m × 0.8, any rock pair 0.8 m × 1.5, any unknown pair
   1.2 m × 1.2, otherwise 1.0 m × 1. Wide bands give the material height and clump
   competition room to interleave the two surfaces. A world-anchored scalar breakup (wavelengths 8/4/2/1 m,
   amplitudes 0.5/0.35/0.2/0.1 m, 35% ridged mix) displaces the boundary distance, fading to
   zero within 1 m of places where two different pairs' boundaries are equally near (this
   removes isolated junction texels). Each level includes only octaves whose wavelength is
   at least four of its sample spacings. The final coordinate is scaled by `0.75 / width`
   so the shared 0.75 m shader ramp yields the pair's width; labels are re-derived from its
   sign, so stored label and code always agree.
7. **Encoding.** Encoding follows the D1 mask format exactly: R semantic (low nibble) and
   display soil (high nibble); G the nearest native cover ID with east/south half ties; B/A
   the lexicographic pair index and a 12-bit code over ±4 fine sample spacings. `0xf001`
   marks the uniform fast path only when the 6×6 label neighborhood is uniform, no boundary
   lies within the search radius and all four cell-corner codes are invalid; other texels
   without a boundary in range store `0xf000`. The search radius is
   `max(4, ceil((maxWidth/2 + breakupReach) / spacing) + guard)` samples — 7, 11 and 19 at
   L4, L5 and L6 — so every unsaturated pair ramp lies outside fast-path cells. The guard
   must be at least `ceil(√2 · (1 + Σ 2πa/λ))` (3 for this recipe), covering how far a warped
   distance can change across one cell diagonal; a partly blended ramp is confined to
   3.68 m of a boundary (1.25 m half-width plus 2.43 m breakup reach).

The generator is pure JavaScript using only arithmetic and `sqrt`, requests no height
channel and allocates bounded, accounted scratch. Warm Node timings around the coastal
anchor are 18.6/19.1/13.5 ms median per L4/L5/L6 page (estimated scratch 12.97/5.81/3.40 MB,
observed at most 1.96/1.29/1.03 MB). Adjacent pages produce bit-identical shared border and
halo texels (324 tested pairs), because every value is a function of canonical world
positions and canonical inputs only.

## Rendering

Fine pages occupy additional layers of the existing nearest-filtered mask
`DataArrayTexture`, after the native slots; they add no texture sampler (the fragment
shader stays at fifteen). Fine slots are marked `meta.w = 2`. Per-slot uniform arrays are
sized by the compile-time `LANDSCAPE_COVERAGE_SLOTS` define:
`min(81, floor((maxFragmentUniforms − 134) / 4))` — seventeen native mask slots plus at most
64 fine slots, four vectors per slot over 134 fixed vectors (warp, clump and D3 stochastic
tiling uniforms included). This machine compiles 81 slots (1,024 vectors); the WebGL2 minimum
of 224 vectors yields 22 slots (5 fine); devices below 202 vectors fail explicitly.
`uMaskSlotRanges` bounds every slot search to resident slots.

The shader reconstruction of each page is the D1 reconstruction: cubic one-hot fallback,
grouped pair contours, uniform fast path and footprint minification. AI577 D2 corrected one
D1 shortcut: when the 6×6 label support is uniform the fitted pair contour is still applied
(the CPU reference always did). Native fits never extend into uniform support, so native
coverage is unchanged, while generated pages whose wide pair ramps extend past their label
boundary are no longer truncated at a cell line.

Hierarchy evaluation is split by the shared warp. The fine chain is walked at the unwarped
world position — the warp is already baked into generated pages — with D1 availability
fades over same-level neighbors (uniform pages count as fully available) and footprint
walking from L6 through L5 and L4. The remaining weight is handed to the native hierarchy
evaluated entirely at `warped = world + landscapeSurfaceWarp(world)`: native and coarser
slots are selected by containment of the warped position, filtered with derivatives of the
warped coordinates (taken in uniform control flow) and faded with the D1 availability
field. Material textures stay at the unwarped position. Native and fine boundaries
therefore meander identically; only smoothing and breakup octaves differ at hand-offs.
`uSurfaceWarpEnabled` is enabled by the viewer and defaults to 0 for synthetic probes.

## Physical interleaving

Generated pages define where two materials share coverage; the D1a height competition and
the `landscape-material-clumps-v1` relief (`LandscapeMaterialBlend.js`,
`chunks/landscape/material_clumps.glsl`) decide how they interleave inside that band. Each
material receives world-anchored clump relief from four rotated octaves of the warp's
lattice noise (frequencies 1/2.3/5.3/12.1 per wavelength, amplitudes 1/0.8/0.6/0.45, each
fading from λ/16 to λ/4 meters per pixel), with billow shaping for loam, forest and rock
(creases become gaps between tussocks, litter patches and boulders) and smooth shaping for
sand, seabed and unknown: loam λ 0.9 m weight 0.65, sand 1.6 m 0.35, forest 1.1 m 0.5,
rock 1.3 m 0.6, seabed 2.0 m 0.3, unknown 1.0 m 0.4. The relief
`r = max(0, 2·max(clumpDetail, textureDetail) + 7·weight·clump + 2.5·textureDetail·(h − 0.5))`
reweights coverage in log space, `c' ∝ c·exp(smoothstep(0.03, 0.2, c)·r)`, and the D1a
competition then resolves blade and grain edges on `c'`. Zero coverage stays zero,
single-material interiors are exact, tails below 3% coverage can only lose weight, one
normalized weight set drives every PBR channel, and clumps are seeded per soil from the
landscape seed and independent of texture residency, so they are stable through tier
arrival. The interleaved part of a straight ramp measures 0.66 m of the 1.2 m loam|sand
band, 1.14 of 2.0 m forest|loam, 0.42 of 0.8 m rock|loam and 0.72 of 1.4 m forest|sand;
clumped area stays within 0.97–1.02× the semantic coverage. Clumps add at most about 0.2 ms
GPU at the AI577 poses. Historical sidecars without relief metadata keep legacy mixing. Since
AI577 D3 the relief `h` and texture detail feeding the clump and competition terms are the
stochastically sampled relief, blended with the same weights as color, normals and ORM.

## Planning, residency and failure

The appearance planner extends visible native leaves of the mask partition into fine pages
when the child level's sample spacing projects above half the mask pixel target (default:
above 2 px), using closest view depth with transverse magnification capped at 2 and 65%
hysteresis. Fine pages are planned only below native pages that the unchanged native mask
plan wants; others are reported as `surface-detail-native-capacity`. Requests are prioritized
by projected sample pixels, then camera distance. A child requires a resident parent with
progress 1.

Capacity is `min(coverageSlots.detail, 64, floor(headroom / pageBytes))`, where headroom is
the appearance GPU ceiling minus the native slots, every material's largest tier plus its
32-pixel fallback (three mipped maps each) and one tier-transition overlap. It is 64 at
384/192 and 256/128 MiB, 12 at the historical 128/64 MiB and 0 below 8 MiB of appearance GPU
(16/8 MiB) or with detail off. The fine layers are a separate ledger entry
(`appearance-surface-detail-array`, 17,438,976 bytes CPU and GPU at 64 slots); with fine layers
present the first upload allocates storage and uploads only the root layer.

Pages resolve as **uniform** — no generation, slot or upload, descendants uniform too —
through a conservative main-thread proof over resident native pages (about 0.7 ms, within a
3 ms per-frame request allowance), the generator's support shortcut, a uniform parent or the
cache's uniform memo. Two detail workers (`LandscapeSurfaceDetailWorker.js`) each reserve
792,588 bytes of context (overview copy, natural-infill construction and an LRU of six
authenticated native cover pages loaded by `loadLandscapeCoverChannel`); each running job
reserves its level's scratch estimate before dispatch (12.97, 5.90 and 3.46 MB at L4, L5 and
L6). Up to four uploads per frame share the remaining 8 MiB allowance. Each record holds an
approximate appearance lease independent of geometry and native query leases. Failed
generation or support retains the parent coverage, records the failed identity and retries
once after 2.5 s; cancellation terminates obsolete worker jobs.

The view-owned cache (`LandscapeSurfaceDetailCache.js`) is a content-addressed byte LRU of
`min(48, floor(appearance CPU ceiling / 8 / pageBytes))` pages — 48 shipped, 30 at 128/64 MiB,
0 below 8 MiB of appearance GPU — plus a byte-free memo of up to 4,096 uniform identities. It
survives source reload, takes evicted pages and those carried through `coarsenForReload` or
disposal, and a hit moves the page out of the cache so bytes are never counted twice. It is
disposed with the view and on budget reconfiguration. After a soil edit only pages whose
influence intersects the edit regenerate; the coastal browser test regenerated 2 pages and
reused 6 from the cache. `appearance.settled` requires no pending, missing or transitioning
fine work; capacity- or budget-limited pages are reported as explicit degradation.

## Budgets

User direction on 2026-10-03 prioritizes realism over memory limits until the D6
optimization pass. The shipped landscape budget is therefore **384 MiB controlled CPU /
192 MiB estimated GPU**, still with 8 MiB of uploads per frame. Appearance ceilings are
half of each total. The historical 128/64 MiB profile left terrain geometry GPU-degraded
in every AI577 capture view. At 256/128 MiB and above, geometry reaches its 1.5-pixel
target in all four views. Explicit lower profiles remain supported, and fine detail
degrades first under them.

## Inspection and diagnostics

`snapshot().appearance.detail` reports the recipe id, hash and seed, levels, capacity and its
reason, wanted/resident/uniform IDs, pending work, cache hits and misses, generation time
statistics, errors, upload bytes, controlled bytes and per-page identities;
`snapshot().surfaceDetail` reports the selected mode, `snapshot().appearance.surfaceWarp` and
`.materialClumps` the active warp and clump settings. `coverageSample(x,z)` reports the finest
resident page, labeled `generated`/`measured` with level, spacing and identity key; native pages
are inspected at the JavaScript-warped position with the warp Jacobian, matching the shader.
`appearanceSample(x,z)` continues to report the native categorical source. Test hooks add
`detailSample(x,z)` (generator internals evaluated in a detail worker), `setSurfaceWarp` and
`setMaterialClumps`. The viewer accepts `landscapeSurfaceDetail=off|50cm|25cm` (default
`25cm`, an explicit error otherwise) and shows a compact fine-coverage line in the panel.

Two shader diagnostics support transition review: `surface-level` tints the shaded surface
50% toward the level color of the finest contributing page (L0 blue, L1 cyan, L2 green,
L3 yellow, L4 orange, L5 red, L6 violet, L7 white) and `surface-coverage` writes unlit,
post-tone-map false colors of the normalized weights before height competition, using the
generator review palette. `snapshot().appearance.coverageSlots` reports the compiled slot
layout.

## Measured results

Measured on the RTX 3060 / ANGLE D3D11 test machine at 1920×1080, the realism profile and
the four AI577 poses (game POV, oblique, top-down 50 m, medium distance); evidence is under
`tests/artifacts/screens/landscape/ai577/d2/`. Median GPU frame time with fine detail off,
50 cm and 25 cm (warp and clumps on in all three): 4.82 / 5.94 / 6.91 ms, 7.12 / 9.24 / 11.15 ms,
3.02 / 3.21 / 3.40 ms and 10.43 / 14.61 / 17.44 ms. Resident fine pages at 50 cm / 25 cm:
26 / 53, 31 / 64, 2 / 6 and 41 / 64 (oblique and medium are capacity-limited at 25 cm).
Appearance GPU rises from 24.5 to 41.1 MiB, mostly the fixed 64-slot fine array. Cold load to
settled fine coverage at the game POV takes about 6.3 s from navigation and 3.8 s after a camera
change. At the game POV, 50 cm and 25 cm pages look nearly identical because shader clumps
provide most near-field interleaving; 25 cm remains the realism default and 50 cm is the
measured optimization candidate for D6.

## Limitations

The warp, smoothing and breakup are artistic procedural detail anchored to the source
boundaries; they do not invent terrain-driven ecology, which is planned for D5.
Planning-only areas inherit the 15.625 m natural-infill shapes, smoothed but not
re-inferred. Because distances are measured in warped space, effective transition widths
vary by about 0.61–1.39× along a boundary. Breakup can still interrupt strips narrower
than about 1 m whose two sides are the same soil pair. Where the soil under an override
changes partway along one override edge, the generator can store "no boundary" within
about 0.4 m of that edge. Boundaries move by at most a few decimetres across fine-level
hand-offs (breakup octaves); the shared warp removes the native-to-fine meander jump.
