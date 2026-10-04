# Continuous landscape surface coverage

AI577 D1 separates continuous display-material weights from source categories,
terrain tessellation, and the PBR texture pattern. The versioned recipe lives in
`LandscapeSurfaceCoverage.js`; the shader implementation is
`materials/landscape/terrain.frag.glsl`. This contract does not claim additional
measured terrain or stored submeter source data.

## Authority and coordinates

Imported land-cover bytes, ordered authored soil overrides, source revisions,
native queries, heights, geometry and saved landscape payloads remain unchanged.
The existing deterministic natural-presentation policy supplies inferred display
soil for planning-only cover. Canonical soil catalog order identifies the six
weight channels. Appearance inspection continues to report nearest categorical
soil/cover; continuous coverage has a separate inspection function.

Coverage is evaluated in world X/Z meters, independently for each fragment. It
can therefore be inspected at 0.25–0.5 meter increments near the camera. Those
increments are evaluation positions, not the resolution of new measurements or
of a retained fine raster. The coastal native cover spacing remains 1.953125 m;
the root natural-infill reference remains 15.625 m. The source contour can remain
limited by those grids, especially while a coarse source mask is resident.

## Derived contour fit and near reconstruction

`LandscapeContourCoverage.js` fits a bounded 9 by 9 source neighborhood around
samples adjacent to a material boundary. It admits only exactly two display soils,
with a sufficiently straight boundary-midpoint PCA fit, bounded residuals, and a
single separator that classifies **all 81 original sample centers** correctly.
The quantization margin is included in this check. Isolated islands, channels,
junctions and nonseparable curves keep the fallback field. This is a derived
visual contour, not a source-category edit or measured shoreline.

The fitter writes the lexicographic unordered pair index 0–14 and a signed
12-bit distance in the two additional texture channels. Pair 15 means no fit.
B contains the low distance byte; A contains the pair nibble above the high
distance nibble. Positive distance points toward the larger soil index. The
range is ±4 times the larger source spacing: the coastal native quantization
step is approximately 0.00382 m, not a claim of source accuracy. R/G retain
the existing packed soil and original cover bytes verbatim.

The otherwise unused invalid-pair payload `0xf001` marks an exactly uniform
6 by 6 display-soil neighborhood at offsets -2 through +3 from the texel.
Ordinary invalid fits use `0xf000`. For the uniform marker, the shader can return
the anchor's one-hot soil after one fetch: this neighborhood contains every
near and bounded minification tap, and all four fitted corner records are
necessarily invalid. The marker therefore skips reconstruction work without
changing coverage, source bytes, texture patterns or filter quality. It occupies
existing B/A bits and adds no allocation or sampler.

The shader groups the four bilinear corner records by pair. Each group's summed
valid corner weight is its confidence, and its signed distance is the weighted
distance divided by that confidence. Pair coverage mixes with the fallback using
this continuous confidence. Different pairs and rejected corners cannot trigger
an all-or-nothing cell switch. Fit coverage joins the near field before the
near-to-minified-filter crossfade; the far response is not attenuated twice.

## Fallback reconstruction and transition width

The near field reconstructs one-hot material samples with an interpolating
Catmull–Rom kernel (`a = -0.5`) over four samples per axis. It retains source-node
labels, including a one-sample island or one-cell channel. It does not numerically
interpolate categorical IDs. Negative interpolation lobes are removed separately
for each material, followed by normalization. A C1 positive activation over
weights 0–0.01 avoids a discontinuous derivative at the clamp:
`positive(w) = w²(2 epsilon - w)/epsilon²` inside that interval. Larger positive
weights are unchanged. Gradients include this activation and the normalization
quotient rule.

For normalized weights `w_i` and their world gradients `g_i`, the shared gradient
scale is `G = max(1e-5, max(i,j) length(g_i - g_j))`. The competitor margin is
`d_i = (w_i - max(j != i) w_j) / G`. A symmetric smooth ramp spans the recipe's
0.75-meter band around zero. Each ramp is multiplied by its nonnegative `w_i`
before normalization. Thus absent materials remain absent, a dominant material
always contributes, and a junction cannot produce a zero total or black hole.

This is a local first-order contour-distance estimate, not an exact signed
distance transform. The common gradient scale can broaden junctions when another
material pair has a larger gradient. Support gating modifies the exact response
profile slightly. The transition width is approximately constant in world meters
rather than one entire source cell at every LOD. The reconstruction support and
material blend width are distinct concepts: reducing the blend width alone does
not remove long straight segments in a digitized contour.

## Screen filtering and source limits

Near a boundary, the ramp uses analytic box integrals of a locally planar margin.
Projected widths use the continuous maximum absolute pairwise gradient projection
onto each screen derivative, divided by `G`. This common footprint avoids a jump
when two competitors exchange rank. The integrals are exact for a single locally
planar smooth ramp. The gradient-scale variation, common conservative junction
footprint, support gating and final normalization make full material coverage an
approximation to the filtered nonlinear contour field.

Degenerate projected widths use a one-dimensional integral or a point evaluation
instead of dividing by a nearly zero product. Outside the ramp's full support the
answer is directly zero or one. These choices keep axis-aligned views finite.

As the world footprint approaches one source cell, coverage blends to a positive
cubic B-spline one-hot field integrated over a conservative axis-aligned world
footprint box. The interval is 0.5–1 source cells. The box uses
`abs(dFdx(worldXZ)) + abs(dFdy(worldXZ))`; for rotated/sheared pixels it is the
pixel's bounding box, not the exact parallelogram. This is a bounded minification
approximation, not an exact average of the sharpened near contour.

A page supports a maximum filter width of two source cells. The shader selects
resident ancestors for larger footprints and blends through the one-to-two-cell
selection interval. At the root, support is capped and inspection reports when
the requested footprint exceeds this limit. Ancestor categories are decimated
source data, not averages of all native categories. Exact native-area-preserving
coarse weights and independently stored fine coverage pages belong to the later
surface-data stage; D1 must not describe its filtering as either of those.

## Canonical halos and residency

Each RGBA8 display page has a two-sample stored halo. Its worker input has a
six-sample halo, covering the stored halo plus the four-sample fitting radius.
Canonical global sample coordinates
choose ownership of duplicate boundary samples. A halo always uses authenticated
same-level source cover, regardless of which adjacent visual pages are resident
or which page requested first. Only the landscape exterior clamps. Authored
overrides are evaluated at the same canonical world position in every page.
Halo-only materials participate in interests, preventing an edge from selecting
an unreferenced fine material.

The worker fetches required cover pages serially and discards each after filling
its owned source-neighborhood samples. A coastal page touches at most nine source
pages. Generic one-interval source pages can touch at most 196 tiny owners; the
halo remains a bounded 14 by 14 source window in that case. No height channel or
full-terrain raster is requested.
A failure in any required halo source rejects that detail page and retains the
already-valid parent. The appearance instance and landscape revision invalidate
the whole dependency set after edits; source IDs are retained for inspection.

For coastal 257² source pages, the stored shape is 261². Seventeen RGBA8 slots are
4,632,228 bytes on CPU and GPU, 2,386,562 bytes more on each than the original
unpadded RG8 array. Five slots are 1,362,420 bytes. Decode admission reserves padded
RGBA output, temporary 269² RG source support, and eight bytes per original sample:
945,598 bytes per coastal request. This includes serial fetch/hash/decode overlap
and worker transfer staging; the fitter has no extra typed-array scratch.
There are still fifteen fragment samplers and no additional texture. The shared 8 MiB upload cap,
CPU/GPU budgets, ancestor ownership, cancellation, retry and disposal rules remain
in force.

Coverage and hierarchy weights blend before material evaluation. Each referenced
PBR soil is shaded once using the final normalized weight. The physical material
tile periods, near/macro texture blend, catalog calibration and material-page
tiers are not changed by this reconstruction.

## Generated fine levels and the shared warp

AI577 D2 adds generated fine pages below the native level in up to 64 extra layers of the
same array (a separate 17,438,976-byte ledger entry at 64 slots) and evaluates native and
coarser coverage at the warped position `world + landscapeSurfaceWarp(world)`, selecting
native pages by containment of that position. The fitted pair contour is now applied even
when the 6×6 label support is uniform, matching the CPU reference; native fits never reach
uniform support, so native coverage is unchanged. Details are in
[LANDSCAPE_SURFACE_DETAIL.md](LANDSCAPE_SURFACE_DETAIL.md); the production-shader seam
verification includes the D2 fine-level probe.

## Hierarchy transitions and scheduling

Each level defines one availability field from the minimum of the surrounding
tiles' progress fields. Inside a tile, its term is its current progress; outside
it, the term approaches one with smoothstep of distance to that tile's rectangle.
Missing same-level tiles have progress zero, while outside-landscape neighbors
have progress one. The band is twice the parent spacing and is capped at tile
width so a 3 by 3 neighborhood suffices, including for tiny source pages. Eight
neighbor progress values are prepared on the CPU for each resident slot. At a
corner, every participant therefore sees the same minimum including the diagonal;
sequential edge fades cannot select different mixtures on opposite sides.

Coverage combines along the resident ancestor chain using those availability
weights, normally evaluating one field in a fully resident interior. Footprint
selection first walks metadata and evaluates at most two filter levels per field.
The Windows shader uses fixed vector weights, avoiding dynamically written
struct-member arrays that the D3D shader backend cannot address reliably.

View planning and demand admission run before geometry admission. The protected
credit is bounded by the appearance ceilings (half of each total since AI577 D2) and the shared total
budget (384/192 MiB shipped since AI577 D2). It includes intended material tiers and one sequential decode allowance;
resident or pending resources replace the credit instead of being double-counted.
This removes a race where longer halo I/O let geometry consume intended material
capacity first. Decreasing demand releases unused credit promptly. The base
allowance, failure behavior and authoritative consumer leases remain intact.
`LandscapeAppearanceDemand.js` bounds speculative credit by an attainable tier
composition under the existing appearance CPU/GPU ceilings. It follows material
interest priority, includes fixed masks/context and coarse fallbacks, and counts
one peak decode allowance. A 16/8 MiB profile therefore protects its attainable
128-pixel pages instead of pinning CPU space for impossible 512-pixel pages;
independent native-source leases retain their capacity. When all requested tiers
fit, the protected byte totals are unchanged.

## Verification

`landscape_surface_coverage.test.js` exercises source-node preservation, isolated
islands, narrow channels, triple junctions, absent-layer exclusion, competitor-tie
continuity, world-meter transition widths, numerical ramp quadrature, minification,
canonical halos, serial source acquisition, untouched source arrays and failed
support. Browser evidence must additionally demonstrate rendered terrain, visible
contour improvement at the exact saved cameras, correct mixed-LOD borders and
bounded memory/uploads. Pure interpolation tests alone do not establish that a
real digitized shoreline has improved. The before/after evidence is retained under
`tests/artifacts/screens/landscape/ai577/d1/`.
`landscape_contour_coverage.test.js` checks the fitted field, packed distance,
native classification constraints, rejected narrow features, and actual coastal
long-step reduction. Uniform-support tests check all 36 veto positions, retained
source bytes and exact one-hot equivalence across near and minified footprints;
the production-shader probe additionally compares complete rendered frames with
the marker enabled and disabled; since AI577 D2 it compiles the device-chosen
`LANDSCAPE_COVERAGE_SLOTS` count and reproduces the historical 17-slot samples exactly. Availability tests include a four-tile corner with unequal
arrival progress and a missing-child edge. Budget tests delay appearance work
while geometry attempts admission, then verify exact credit replacement/release.
