# DONE

#Problem

Reference facades rarely place identical windows at even spacing. They use rhythms: paired windows separated by wide piers (A-B-A-B), alternating wide/narrow assets, and — on classical buildings — arched windows grouped into arcades that share a springing line and column rhythm.

This prompt was originally written as "build a pattern system". The audit below (done 2026-08-25) found that the pattern system already exists: `facade.layout.bays.items` IS the sequence and `facade.layout.groups.items` IS the repeating unit. Rebuilding it would duplicate shipped work, so the request is now scoped to the three things the existing bays+groups system genuinely cannot express.

Reference images: `downloads/buildings_references/` — 7 (paired windows between piers), 8 (uniform pairs in stone frames), 15 (wide/narrow mix per floor), m4 (paired-window rhythm in clay), 2 top floor and 6 (arched arcade rhythm).

## Audit — what bays + groups already express (do NOT rebuild)

- **Sequence + repeat**: `solveFacadeBaysLayout` (`FacadeBaysSolver.js`) expands contiguous, non-overlapping bay groups as whole units, center-out, repeat-if-fits. An A-B-A-B rhythm is `[window, narrowPier, window, widePier]` grouped and repeated.
- **In-group vs between-group spacing**: needs no new concept — they are simply two pier bays of different widths inside the group.
- **"Pair" without a pre-authored paired asset**: either two window bays inside the group, or one bay with `window.repeat.count = 2` plus padding.
- **Wide/narrow mix per floor**: different bay widths / window defs inside one group.
- **End-of-facade resolution**: group repeats are emitted whole (never a half group), leftover length goes to expand-preferring bays, and ungrouped bays before/after the group act as end caps.
- **Linking/mirroring**: face linking and `linkFromBayId` already apply to grouped bays.
- **GUI**: the BF2 group popup creates/lists/deletes groups from a contiguous bay selection.

## Gap 1 — column stacking is not locked across layers

`solveFacadeBaysLayout` is called once per face **per layer** with that layer's face length and no shared topology, while the older fill-pattern path does thread a per-face topology (`facadePatternTopologyByFaceId`). The moment two floor layers have different face lengths (a `planOffset` setback), the repeat counts diverge and the columns stop stacking. Nothing an author can do with groups fixes this — the solver is missing the input.

## Gap 2 — no arcade

Nothing in `src` knows what an arcade is. `archRise = arch.heightRatio * width`, so the springing line is a function of opening width: equal-width arches happen to line up, and any wide/narrow rhythm does not. There is also no impost — the piers between arches read as plain piers, not as arcade columns.

## Gap 3 — group repeat bounds and arcade are not authorable

The solver already reads `group.repeat.{minRepeats,maxRepeats}` but the BF2 group popup never writes them, so every group is "repeat if it fits". There is no place to turn an arcade on either.

# Request

Close the three gaps above. Design principle (applies project-wide): ONE layout feature — the arcade is a MODE of the existing bay group, not a sibling feature, and column stacking is an option of the existing bay layout, not a second solver.

Tasks:
- **Stacking lock**: resolve bay repeat topology once per face (reference = the shortest applicable floor-layer face length) and reuse it for every layer, so columns stack. Author-visible as `facade.layout.stacking.mode` (`lock_columns` default, `per_layer` opt-out). A layer that cannot fit the locked topology must fall back to a local solve with a warning rather than producing broken geometry.
- **Arcade mode on the group**: `group.arcade` makes every arched opening in the run share ONE springing line, computed deterministically so no arch is ever pushed past its natural (semicircular) rise, plus an optional impost band across the run's pier bays at that springing height so the columns read as arcade columns. Auto and explicit springing heights.
- **Shared model module**: normalizers + springing math live in one three-free module under `src/app/buildings/` shared by the solver, the generator and the GUI (the facade-solver-renormalizes-bay-windows lesson: every new bay/group field must survive all three whitelists).
- **BF2 GUI**: group repeat min/max controls and the arcade toggle (+ impost) in the group popup, with live preview.
- **Showcase**: an arcade facade and a setback tower proving columns stack across layers; validate via `tests/headless/harness/scenarios/scenario_building_showcase.js`.
- **Tests**: solver unit tests for topology reuse across face lengths, locked-topology overflow fallback, group repeat bounds, arcade springing resolution (including the mixed-width case), and a GUI test for the new controls.

## Delivery requirements
- Engine 2 only: target the facade/bay building engine (facades/bays + window definitions). Do not extend engine 1 (the fixed-spacing `layer.windows`/`spaceColumns` path or the old `BuildingGenerator.js`); it is deprecated and frozen.
- Finish with a screenshot showing the feature in a rendered building — a before/after pair when the change improves something that already renders — and additionally a close-up version of the feature.


## Summary of changes

- Rescoped the prompt itself: bays + groups already ARE the pattern system (audit above), so only the three gaps below were built.
- New `src/app/buildings/FacadeBayGroupModel.js` — one three-free model shared by solver, generator and BF2 GUI: group repeat bounds, arcade config, facade stacking spec and the shared-springing math.
- `FacadeBaysSolver`: split into `computeFacadeBaysTopology()` + a `topology` input on `solveFacadeBaysLayout()`; a locked topology carries the reference face's ABSOLUTE bay widths, so a shorter layer drops whole repeats at the same pitch instead of re-fitting its own rhythm.
- `FacadeBaysSolver`: expanded bays now carry their group's `arcade` mode (piers included) and whether a group owns them.
- Generator: per-face topology pre-pass keyed by face id + bay-layout signature (works for per-layer facades, which is all BF2 writes), reference = the longest face, graceful per-layer fallback with a warning.
- Generator: arcade runs resolve ONE springing line per floor (highest natural springing wins, so no arch is stilted), applied to both the window mesh and the facade wall cutout.
- Generator: new `bay_arcade_impost` band on the run's pier bays at the springing line, so the piers read as arcade columns.
- `BuildingMaterialSlots`: the arcade impost material joins the slot-resolution pre-pass.
- BF2 GUI: group rows gained repeat min/max spinners and the Arcade + Impost toggles; the grouping panel gained the face-level "Lock columns across layers" toggle.
- Specs updated: engine §5.6 (stacking lock) and §7.1 (arcade), model (group rhythm + stacking authoring), UI (new group controls), facade layout (ArcadeSpec / FacadeStackingSpec).
- Tests: 9 node unit tests for the model, 6 solver/generator tests in the core suite, and a BF2 GUI e2e test for the new controls.
- Showcase: `tests/headless/visual/specs/ai493_bay_rhythm_capture.pwtest.js` renders arcade before/after + close-up and setback-stacking before/after + close-up.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
