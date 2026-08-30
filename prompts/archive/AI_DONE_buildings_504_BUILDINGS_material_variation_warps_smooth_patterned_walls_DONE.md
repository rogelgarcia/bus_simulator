# DONE

# Problem

World-space material variation visually WARPS smooth, brightly patterned wall
materials: on `pbr.rusticated_ashlar` the crisp horizontal block courses turn
into diagonal dashes marching up the wall, and the masonry reads sheared /
"melted". On busy brick albedos the same settings only read as plausible grime,
which is why this went unnoticed — the showcase set put the standard
`materialVariation` recipe (world space, scale 0.16, wearTop/Bottom/Side) on an
ashlar base and the corruption is unmistakable.

This is not sun angle and not the texture itself: an A/B with identical camera,
geometry and lighting flips the defect on and off with `materialVariation.enabled`.

A second symptom of the same defect (user-reported on images 02 and 21 as
"seams / texture discontinuation on the first floor"): because the displacement
field does not stay continuous across wall-segment boundaries, the displaced
pattern also BREAKS at vertical seams wherever the wall is split into segments
(bay boundaries, cutout splits). A/B on the Arcade Hall base shows the wall
seam-free with variation off and seamed + warped with it on — so the seams in
those review images are this defect, not a UV-anchoring problem. (A separate,
variation-independent UV defect at face ends is filed as AI_buildings_506.)

Reported by the user while reviewing showcase images 23 ("warped textures"),
02/21 (first-floor seams) and 04/05 (warping at grazing). Found 2026-08-26.

Evidence (tests/artifacts/screens/showcase/):

- `probe_ashlar_var.png` vs `probe_ashlar_novar.png` — SAME view of the Garden
  Court ground floor; variation on vs off. Off: rectangular blocks, clean
  horizontal joints. On: the relief/joint shading is displaced into diagonal
  dashes and the block pattern is destroyed.
- `probe_seams_var.png` vs `probe_seams_novar.png` — SAME straight-on view of
  the Arcade Hall arcade base; variation off is seam-free and continuous,
  variation on shows the warped pattern breaking at vertical segment seams.
- `showcase_02_arcade_hall_front.png`, `showcase_21_garden_court_street.png`
  — the user-reported first-floor seams / pattern discontinuities.
- `showcase_04_arcade_hall_grazing.png`, `showcase_23_garden_court_closeup_side_b.png`
  — the warp at grazing/review framing.
- `showcase_05_arcade_hall_street.png`, `showcase_06_arcade_hall_closeup_arcade.png`,
  `showcase_13_setback_tower_street.png` — same recipe on ashlar bases of the
  other showcase buildings; diagonal streaking clearly visible on 06.

Observations for diagnosis:

- The displaced shading has sharp block-shaped edges — it looks like the wall's
  own normal/AO detail sampled at an offset/rotated position, not like an
  additive dirt layer. Suspect the world-space wear layers perturb the texture
  lookup (or the AO/normal blend samples world-space coordinates that mix the
  vertical axis into U) rather than only modulating tint/roughness.
- The diagonal direction appears consistent across faces A and B (both
  axis-aligned walls), which rules out a per-face UV authoring mistake in the
  configs.

# Request

Find why world-space material variation displaces/shears the perceived surface
pattern on smooth bright materials, and fix it so wear reads as tint/roughness
modulation (vertical streaks, corner grime) without corrupting the underlying
masonry pattern. Add a visual guard on a bright patterned material (ashlar), at
a straight-on camera, variation on vs off.

## Delivery requirements
- Engine 2 only.
- Before/after screenshots on `pbr.rusticated_ashlar` with the standard wear recipe.

## Summary of changes (2026-08-26)

- Root cause: the WALL preset in `MaterialVariationSystem.js` shipped
  `antiTiling.enabled: true` (per-2m-cell UV offset up to 0.28 + rotation up
  to 22°, plus an fbm warp in quality mode) — every texture lookup goes
  through `mvMatVarUv`, so any recipe that did not explicitly author
  `antiTiling` inherited the perturbation. On busy brick it reads as grime; on
  crisp ashlar it shears the coursing into diagonal dashes, and because the
  cells live in texture-UV space the displaced pattern breaks at every
  wall-segment seam (which AI 506's per-strip U reset supplied in quantity).
- Fix: the wall preset's anti-tiling is now OPT-IN (`enabled: false` default).
  Every tuned engine-2 config (`BrickMidrise2`, `GovCenter2`, `StoneLowrise2`,
  `MainStreetBlock`) already authored it off; authored `antiTiling` configs
  keep working. The SURFACE preset (roads) keeps its default — asphalt has no
  coursing to corrupt and relies on it to hide repeats.
- Core test: `wall anti-tiling is opt-in, not a preset default (AI 504)` —
  wear-only recipes normalize with anti-tiling off and a zero `anti` uniform,
  explicit opt-in survives, surface default unchanged.
- Capture spec `ai504_variation_ashlar_capture.pwtest.js`: Garden Court ashlar
  ground floor straight-on, variation on vs off, plus an in-scene guard that
  no wall material carries an active anti-tiling uniform. Before/after pairs
  in `tests/artifacts/screens/buildings/ai504_*` (before = pre-fix shader:
  pattern scrambled; after = clean coursing with wear shading intact).
- Also resolved the review's "first-floor seams" (02/21) and the flat smeared
  strip near the BC corner (filed under AI 506): both were this lookup warp —
  A/B re-render with the fix shows crisp continuous blocks in those framings.
- Documented the rule in `BUILDING_2_SPEC_engine.md` §6.
