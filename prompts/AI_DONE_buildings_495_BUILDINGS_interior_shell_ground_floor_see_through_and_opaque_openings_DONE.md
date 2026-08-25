DONE

#Problem

Two related interior-shell defects observed in gameplay on the storefront building (mainstreet_block-style), and the per-floor inconsistency between them is itself unexplained:

1. Ground floor is see-through: looking through the storefront glazing at the corner, there are no internal walls at all — the view passes straight through the building and out the glazing on the other side (street visible through the building). A building must never read as a hollow glass tube.

2. Upper/other floors have interior walls but opaque openings: where the interior room DOES exist (white interior walls, floor visible), glazed doors/windows in those interior-backed walls show opaque wall behind the glass instead of the outside/parallax — a door frame with wall texture where its glass should be.

Why some floors get interior walls and others don't is not understood (per-layer `interior.enabled` in the config? layer height? storefront vs window assets?) — the investigation is part of this task.

Reference screenshots (unannotated — locations described here):
- `downloads/bug_refs/495_ground_floor_see_through.png`: through the right-hand storefront/door glazing the street, the blue bus, and buildings BEHIND the building are visible — the sightline crosses the entire ground floor and exits the far glazing; the left window likewise shows the grass field on the other side.
- `downloads/bug_refs/495_interior_opaque_opening.png`: camera looking into a ground-floor interior room (white walls, concrete floor, black ceiling); on the far interior wall a glazed double door's panes render as opaque wall texture instead of showing what is behind it.

# Request

Make the interior shell consistent and correct on every floor: every glazed opening must show something plausible behind the glass — parallax interior, real interior shell, or the outside if genuinely open — and never (a) a straight-through view crossing the whole building, or (b) blank opaque wall pressed against glass.

Tasks:
- Investigate and document (briefly, in this prompt when working it) the current per-floor interior behavior: what enables the interior shell per layer, why the ground floor of the affected building has none, and why openings in interior-backed walls are opaque. Check the building config (`MainStreetBlock` and friends) as well as the generator paths — a config authoring gap should be fixed in the config AND guarded against in the generator (sane defaults), not just patched in data.
- Ground floor fix: when a floor has glazing on multiple faces and no interior, provide occlusion — either enable the interior shell/parallax for that floor or generate a minimal opaque core so sightlines cannot cross the building. Choose the approach that fits the existing interior system; document the decision.
- Opaque-opening fix: openings (windows/doors) hosted on walls that back onto a real interior room must render their glass with a correct view: the interior shell needs openings/parallax panels behind glazing rather than solid wall. Coordinate with the parallax offset fix in AI 496 — if the root cause overlaps (panel placement), implement the shared part once.
- Keep the fix general: any building fabricated with mixed interior settings per layer must behave; add generator-level warnings when a config produces a see-through floor (glazing on 2+ faces, interior disabled, no core).
- Validate in gameplay-like conditions and the showcase scenario (`tests/headless/harness/scenarios/scenario_building_showcase.js`): camera at street level looking through the corner glazing (no through-view), and into an interior-backed opening (no blank wall behind glass).
- Tests: a generator/scene test asserting the ground floor of the showcase storefront config produces occluding geometry between opposite glazed faces; a test asserting openings on interior-backed walls emit parallax/opening geometry rather than solid wall behind the glass.

## Delivery requirements
- Engine 2 only: target the facade/bay building engine (facades/bays + window definitions). Do not extend engine 1 (the fixed-spacing `layer.windows`/`spaceColumns` path or the old `BuildingGenerator.js`); it is deprecated and frozen.
- Finish with a screenshot showing the feature in a rendered building — a before/after pair when the change improves something that already renders — and additionally a close-up version of the feature.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Outcome

### Investigation

Both defects come from the same gap: the interior shell is a crude ring that
neither knows about openings nor is guaranteed to exist.

**What enables the shell per layer.** `layer.interior.enabled` alone
(`isFloorLayerInteriorEnabled`). Nothing about openings, glazing or face count
fed into it.

**Why the ground floor was see-through.** Not a missing shell — the affected
building's ground floor *had* `interior.enabled: true`. It is that the glazing
had **nothing behind it**: those openings are authored `visual.interior: "none"`
(so no parallax panel) and `visual.disableShades: true`. A shade looks like an
occluder but is not one — its shader `discard`s every fragment once coverage
reaches 0, which is exactly what `disableShades` produces. The facade wall's
inner side is back-facing, so a street-level ray entered the glazing and left
through the far glazing. Reproduced on `gov_center_2` (every layer has
`interior.enabled: false`) and `beige_1`: a 1,680-ray sweep per building found
179 and 93 crossing sightlines. A raycast-based check only sees this once shade
quads are excluded, because the raycaster ignores shader `discard`.

**Why openings on interior-backed walls were opaque.** The shell wall is built by
`buildWallSidesGeometryFromLoopXZ`, which takes no cutouts, while the facade next
to it is built by `buildWallSidesGeometryFromLoopDetailXZ`, which does. So the
shell was a solid ring 0.01m behind the facade and every opening was backed by
blank wall — visible from inside the room as white panes, and from outside
wherever no parallax panel covered the glass.

### Changes

- Tag every facade opening cutout as **backed** or not: backed means it has a
  parallax interior panel behind its glass. Shades explicitly do not count.
- Emit the interior shell on any floor carrying unbacked openings even when
  `interior.enabled` is false, with a generator warning naming the layer and the
  faces — the see-through guard the config gap needed.
- Cut the shell at backed openings, so a room's wall is never pressed against the
  glass. Unbacked openings are left solid: the shell is the only thing closing
  that sightline.
- Build the shell loop corner-join by corner-join at its own depth so each point
  keeps its face id, and project facade cutouts onto that plane — the shell sits
  too far off the facade for the wall builder's segment test to match otherwise.
- Leave a 0.12m lip of shell around each cut: a parallax panel covers its opening
  head-on, but a grazing ray can slip past its edge, and the lip (hidden behind
  the panel) catches those.
- Configs: glazed openings that were authored `interior: "none"` and left their
  glass empty now name a preset — `shop` for MainStreetBlock's shopfronts and
  entrance, `office` for GovCenter2's civic windows and door, `res` for
  StoneLowrise2's entrance. Frosted bathroom sashes keep `none` deliberately.
- Document the occlusion contract in `BUILDING_2_SPEC_engine` §6.2.1 and the
  model spec.
- Tests: `building_interior_shell_occlusion` — no sightline crosses any of six
  buildings (oblique and head-on, ~200 rays each), and every parallax-backed
  opening on a shell floor is open in the shell rather than hidden behind it.
  Three of the seven fail before the fix.
- Captures: `tests/artifacts/screens/buildings/ai495_*_{before,after}.png`.

Sweep result: 0 crossing sightlines in 25,200 rays across all 15 catalog
buildings, from 272 before.

### Rejected approach

Setting the shell's walls back by a room depth (so glass reads as "a room in
there") was tried and reverted: the band it leaves around the perimeter is a
corridor, and grazing rays travel down it. It took the sweep from 272 crossing
sightlines to 400.

### Known gap

Openings that stay deliberately unbacked still show shell wall close behind the
glass. That reads correctly for obscured glazing, which is the only place the
catalog now uses it, but an author who sets `interior: "none"` on clear glazing
gets a blank pane rather than a warning; the warning only fires when the layer
also has no interior shell.
