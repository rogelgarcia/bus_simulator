# LOD3 card silhouettes and near transition

Date: 2026-10-03. User-reported LOD2/card mismatch after the coverage correction.

## Reproduction

Select `tests/headless/visual/specs/grass_view_cards.pwtest.js` with the standard
selected-test runner. Fixed seed 4219, 1600 × 1000, DPR 1, game lighting. Eight
bus-height poses are supplemented by close views at 2 m height and 30° tilt,
bearings 0/90/180°. Force LOD2 or cards, then render the actual 3.5–5 m band.

Artifacts: `tests/artifacts/screens/grass_debug_v2/transition_lab/view_cards_fidelity/`.
Previous source was copied into `previous_source/` before experiments. When
available, the test serves it through request overrides to reproduce matched
old-card close views; it never overwrites the current source. Previous bus
captures remain in the sibling `view_cards_coverage/` directory.

## Experiments

| Step | Hypothesis / isolated change | Result |
|---|---|---|
| 1 | Two directional images contain different leaves; retain one image per rotating card. | Sharper silhouettes, fewer translucent wisps. Clumps remain. Rendering checks pass. |
| 2 | Bus pitch is too shallow for nearby grass; capture at 30° instead of 13.6°. | More leaning blade shapes in close views; isolated 50 cm tufts remain. |
| 3 | Split ten 50 cm cards into twenty 25 cm cards; test 20 cm source depth. | More even distribution, but excess green coverage (80.6% versus LOD2 74.0%). |
| 4 | Reduce source depth to 16 cm and calibrate constant material tint. | Coverage 72.2%, slightly below reference. Choose 17 cm, then fine-tune blue tint. Final coverage 73.7%; leaf RGB within about 1.5/255 of LOD2 averages. |
| 5 | Dither, not the card texture alone, produces the near-band stipple. Use MSAA coverage only for the LOD2/card boundary. | Matched close transition captures lose the coarse dotted pattern. Other transitions and original geometric mode retain their old blending. |
| 6 | Validate motion and cost after cleanup to one sample per atlas. | Eight bus poses, three close poses, orbit and forward sequence pass with no GL errors or rebakes. Paired soil-subtracted benchmark passes. |

## Cause and retained fix

Average green coverage hid differences in leaf silhouette and clustering. Wide
groups captured from a low angle looked upright; cross-fading unrelated captures
made partial silhouettes. Screen-door fading made those differences conspicuous
at the near boundary. Narrower groups, a steeper capture, stable images and
multisample boundary coverage address these separately. The original leaf-based
LOD3 stays selectable. Current details and measured timings are recorded in
`specs/grass/GRASS_TRANSITION_LAB.md`.

The result still has no per-leaf parallax. Captured normals rotate with the card,
and finite MSAA coverage/per-cell transition weights can cause small density
changes. Close views are improved, not identical to LOD2. No visual pass/fail
baseline was promoted; inspect the report's matched splits and motion sequences.


## Wider intermediate cards and far canopy (2026-10-05)

The near/card fix exposed a separate LOD3→canopy mismatch at the new 16 m
switch. Preserved source and all trial evidence are under
`tests/artifacts/screens/grass_debug_v2/transition_lab/wide_cards/`.

1. Add 75 cm cards, four/m², captured at canonical bus pitch, initially with
   30 cm source depth. Four cardinal bus bearings show excess coverage and
   dark green clumps; three/m² leaves large gaps.
2. Reduce source depth to 22 cm, ground span to 37 cm. Keep four/m² and adjust
   leaf-only tint. Render 3/4/6 density alternatives; four best matches the near
   cards around 14–24 m. Source leaves are 126–141 including clipping padding.
3. Cap the existing canopy oblique-overlap correction and reduce its yellow-green
   tint. Far mip pixels still classify as green more often than card pixels;
   this is not an exact semantic coverage metric. Preserve original images to
   prevent claiming equality from a single average.
4. Extend selector/helpers/bands to six levels; reuse complementary screen-door
   fading at the canopy and sample coverage between cards. Add bridge bypass
   with identical duplicated 3→5 band limits. No runtime rebakes during motion.
5. Hardware benchmark initially overflowed the 24-query pending ring when six
   scenes were submitted per RAF. Drain between full paired cycles; fail on
   missing queries. The rerun retains all six rounds × thirty paired samples.
   Full-scene detail costs +0.437 ms GPU and roughly +0.157 ms selection/batch
   CPU per moving frame; isolated LOD4 is 27% cheaper than isolated LOD3.
6. Fifteen selector unit tests, integration probes (UVs, internal ramps, ground
   coverage, side cutoff, navigation, controls), and all five complementary
   blend boundaries pass. Wide capture motion metadata remains unchanged.

Current implementation and limitations are described at the top of
`specs/grass/GRASS_TRANSITION_LAB.md`. Wide cards remain grouped and the far
canopy lacks leaf parallax; the bridge trades extra rendering for a gentler loss
of depth. No AI-generated textures or new standalone offline bake process.

## Foreground continuity and wide-card rows (2026-10-05)

User reported a bare patch following the camera, repeated layers in wide cards,
and lost blending. Browser-control attachment failed with a Windows sandbox ACL
initialization error, so verification uses reproducible headless views rather
than claiming to have inspected the exact open camera state.

1. Capture bus front/rear, 40° close, 85° overhead and a 65 cm low camera, with
   blended and isolated LODs. The reported large hole did not reproduce in those
   initial static captures. Record that limit instead of attributing it to a
   source-texture gap. The existing test used geometric LOD3, so change its
   movement regression to exercise the actual card path.
2. Find two code problems: fade weights are constant over an entire metre,
   and candidate support accounts for camera movement but not rendered vertex
   offsets. Evaluate decoded/expanded positions before projection and include a
   1.4 m geometry envelope. Fifteen selector tests pass, including an expanded
   support sweep. The same-position cached/fresh renders change over 99% fewer
   pixels than patch switching across two 6 m drives.
3. Repeated two-metre points with tiny jitter produce aligned rows. Independent
   random cell phase breaks the rows but leaves clumps at shared cell edges.
   Replace it with world-seeded jittered strata, plus stable yaw/width/depth/
   height variation. Remove the now-unused best-candidate startup search.
4. Expand source depth from 22 to 42 cm: rejected for dense clumps. Settle on
   32 cm and 62 cm ground span at four 75 cm cards/m². Foreground coverage checks
   at every sampled band below 2 m exceed 65% of the matching LOD2 reference.
   This is a fixed green classifier, not a semantic mask. Keep isolated close
   LOD4 images in the report so its remaining grouping is visible.
5. Version the changed shader/material/entry dependency chain together. This
   avoids stale open-browser modules, but is not evidence that caching caused
   the user's particular foreground hole.
6. A complete paired performance run retained all samples but had unstable
   results, even for the unchanged canopy. GPU utilization remained 100% after
   the benchmark process exited. Retain the raw run, label it inconclusive,
   and do not claim a speed improvement or compare means with the prior run.

Evidence: `tests/artifacts/screens/grass_debug_v2/transition_lab/card_continuity/`.
The card atlas sizes, four/m² default, and 0.6 / 0.8 / 1 / 16 / 32 m switches
are unchanged. No live rebaking or per-card CPU updates were introduced.

## Washed-out card transition (2026-10-05)

Compared the existing square-root MSAA opacity fade, ordinary alpha with depth
writes disabled, staggered individual-card windows, and a complementary opaque
pixel dissolve. The first trial was deliberately not solved by retinting the
leaves: isolated LOD renders establish the color range that the transition
should preserve. Front/rear/side poses use the same bus height, pitch and sun.

- Plain alpha removes some haze but darkens classified leaf pixels by roughly
  10–14 green-channel display values versus isolated references. Reversing
  batch draw order changes 132,789 pixels by more than 3/255; instanced cards
  are not individually sorted.
- Staggered fades preserve opaque color but create larger clumps: measured
  32-pixel-block coverage deviation in the middle band rises to roughly
  0.10–0.14, versus around 0.05–0.07 for the opaque dissolve.
- Fine complementary dissolve retains the source leaf color without fading
  all overlapping layers together. It replaces the old eight-pixel Bayer
  transition grid with a static interleaved-gradient threshold. This is still
  dithering, explicitly, and not a no-noise transparency solution.
- Promote dissolve to the default, retaining all alternatives under Fade.
  UI/URL/API changes rebuild band material variants; source materials and
  texture sizes remain unchanged. No extra texture or render passes.
- Synthetic probes pass all five boundaries, including reversed draw order.
  Actual-scene reversal changes only 177 pixels. Eight-direction captures and
  both moving-camera cache comparisons pass; no runtime shadow regeneration.
- GPU use remained 100% outside the browser test, so record exact draws,
  geometry and memory rather than misleading milliseconds.

Primary background: NVIDIA's Stochastic Transparency (I3D 2010) discusses
fixed alpha-to-coverage mask correlations and transparent sorting. This much
simpler dissolve uses no stochastic subpixel passes or temporal accumulation.
Evidence: `tests/artifacts/screens/grass_debug_v2/transition_lab/fade_styles/`.
Remaining limitations: fine grain without TAA, wide-card grouping, and LOD5's
flat geometry. Separate full-LOD renders plus image compositing would avoid
transition stipple at the cost of additional targets and passes.
