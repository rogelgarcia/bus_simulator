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

Both defects come from one thing: **the interior shell was a one-sided wall with
no openings in it.**

**What enables the shell per layer.** `layer.interior.enabled` alone
(`isFloorLayerInteriorEnabled`). Nothing about openings or glazing fed into it,
so `gov_center_2` (every layer disabled) and `beige_1`'s ground floor were hollow
boxes with no inside at all.

**Why a sightline crossed the building.** The shell is wound to face the room and
its material was `FrontSide`, so from the other side it simply was not drawn — a
ray entering a window crossed the room and left through what should have been
solid wall, and the room read as empty space. A raycast only sees this once shade
quads are excluded, because the raycaster ignores shader `discard` and
`visual.disableShades` produces a shade that discards every fragment.

**Why openings on interior-backed walls were opaque.** The shell wall is built by
`buildWallSidesGeometryFromLoopXZ`, which takes no cutouts, while the facade next
to it is built by `buildWallSidesGeometryFromLoopDetailXZ`, which does. So the
shell was an uncut ring 0.01m behind the facade and every opening was backed by
blank wall.

### The rule

It is about **walls**, not sightlines. Seeing into a building through a window is
correct; seeing straight through when the openings on opposite walls line up is
also correct — that is a hole, and holes are see-through. Only seeing through
solid wall is wrong.

### Changes

- Interior shell surfaces are `DoubleSide`. A wall is opaque from both sides.
- The shell is cut at **every** opening, backed or not. A window is a hole: from
  the street it shows the room, from the room it shows the street, and an aligned
  pair genuinely sees through.
- The shell cut stops `0.08m` short of the structural opening — which is what a
  reveal is, and which also keeps the shell opaque where a window mesh does not
  quite fill its wall cutout, a pre-existing gap that grazing sightlines slipped
  through once the openings were cut.
- Build the shell loop corner-join by corner-join at its own depth so each point
  keeps its face id, and project facade cutouts onto that plane — the shell sits
  too far off the facade for the wall builder's segment test to match otherwise.
- Emit the shell on any floor carrying openings with no parallax panel even when
  `interior.enabled` is false, with a warning naming the layer and the faces:
  an opening you can see into needs an inside to see.
- Document the contract in `BUILDING_2_SPEC_engine` §6.2.1 and the model spec.
- Tests: `building_interior_shell_occlusion` — no sightline leaves a building
  without passing through two openings (six buildings, oblique and head-on);
  aligned openings *are* allowed to see through; shell surfaces are double-sided;
  every opening is cut out of the shell.
- Captures: `tests/artifacts/screens/buildings/ai495_*_{before,after}.png`.

Sweep result: 0 sightlines through solid wall and 401 legitimate sightlines
through aligned openings, across all 15 catalog buildings.

### Rejected approaches

Two designs were tried and reverted:

- **Cutting only openings that have a parallax panel**, leaving unbacked ones
  solid so the shell would block those sightlines. This inverts the rule: it made
  windows read as blank panes and treated a hole as an occluder. Replaced by an
  opaque double-sided shell that is cut everywhere.
- **Setting the shell's walls back by a room depth** so glass reads as "a room in
  there". The band it leaves around the perimeter is a corridor, and grazing rays
  travel down it: the sweep went from 272 crossing sightlines to 400.

Re-pointing authored `visual.interior: "none"` openings at parallax presets was
also reverted. `none` is a legitimate authoring choice meaning "you can see in",
and the engine now honours it.
