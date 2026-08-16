# DONE

## Summary of changes
- `ParallaxPanelOverscan.js` (new): overscan math — panel depth behind the glass (derived from the glass/shade/interior z-offsets) x tan(72 deg max grazing angle), clamped by an absolute cap and by the wall gap to the neighbouring opening; zero depth = zero overscan (unchanged panels).
- `WindowMeshGeometry`: the interior parallax panel is now its own oversized quad instead of reusing the opening geometry, with UVs pinned to the OPENING rect so 0..1 still spans exactly what it spanned before (visible interior is pixel-identical head-on; the overscan runs outside 0..1 where the shader's existing clamp continues the image outward). Panel overscan added to the geometry cache key.
- `WindowMeshGenerator`: the interior mesh uses the oversized panel (falling back to the opening geometry when no overscan is needed), and the interior instance attributes are bound to whichever geometry it uses.
- `WindowMeshSettings`: new `interior.overscanClampMeters` (null = unconstrained) carrying the per-placement neighbour-gap clamp.
- `BuildingFabricationGenerator`: computes each opening's neighbour gap from the bay slot (next repeat slot, or half the slack plus bay padding at the bay edge), quantized to 5 cm so near-identical bays still share one geometry bucket, and passes it on the placement settings.
- Capture harness: `CAMERA_DIR` / `CAMERA_PADDING` / `CAMERA_TARGET_Y_FRAC` / `CAPTURE_SUFFIX` env overrides for street-level and grazing-angle inspection shots.
- Tests: 8 node unit tests for the overscan math (depth/angle -> extension, absolute cap, neighbour clamp, null-gap regression, depth derivation) and 4 browser tests (panel exceeds the opening by the expected overscan, scales with depth, respects the clamp, UVs pinned to the opening rect, generator passes the clamp end-to-end).
- Pre-existing opening-size tests now measure the opening layers explicitly (the parallax panel is deliberately larger and hidden behind the wall), keeping their original intent.
- Validated by before/after grazing captures on `storefront_row_2`: changed pixels sit exactly on the window reveals and are ~48% darker (bright hole -> interior content).

## Findings / follow-ups
- The reveal gap and the shop-preset "streak" artifact are two different failure modes. This work fixes the GEOMETRIC gap. Re-strengthening the AI 488 shop parallax preset (uvZoom 1.6 / depth 9 / scale 1.5) was tested and still produces the diagonal UV-clamp streaks on storefront glazing, so the preset stays at its AI 488 values. Closing that one needs the shader's `uvLocal` clamp reworked (e.g. atlas cells with a bleed margin, or a boxed reveal), which is not in this prompt's scope.
- The optional boxed-reveal fallback was not needed: no showcase opening hit a clamp tight enough to leave the sliver exposed.

#Problem

The window parallax interior panel sits at a depth offset behind the glass plane, sized to the opening. At grazing view angles the offset exposes the gap: a bright sliver of "hole" is visible along the window reveal between the glass edge and the panel edge (observed in gameplay along the left and bottom edges of windows viewed at a shallow angle — the panel visibly does not cover the line of sight through the opening's edge).

Reference screenshot (unannotated — location described here):
- `downloads/bug_refs/496_parallax_gap_grazing_angle.png`: upper-floor window viewed at a shallow angle; a bright L-shaped sliver runs down the inside of the left frame edge and along the bottom rail — the exposed gap between the glass plane and the parallax panel sitting behind it. The neighboring window to the left shows the same sliver on its left edge.

# Request

Make the parallax panel cover all sightlines through the opening. Preferred approach (cheap, chosen for simplicity): oversize the panel proportionally to its depth behind the glass — the deeper the panel sits, the larger it must extend beyond the opening on every side, so any ray entering through the opening at a plausible angle still hits panel. A boxed reveal (side strips connecting glass to panel, forming a closed light box) is the fallback/optional upgrade if oversizing alone cannot close the gap at extreme angles or causes bleed into neighboring openings.

Tasks:
- Compute the required overscan from geometry: panel extension per side ≈ panel depth × tan(max expected grazing angle); pick a max-angle constant that closes the artifact in practice (street-level gameplay angles) without inflating panels absurdly. Apply to the parallax panel sizing in the window fabrication path (see `normalizeWindowFakeDepthConfig` / parallax panel emission in the window mesh code).
- Overscan must scale with the actual configured depth per asset (windows with deeper fake depth get proportionally larger panels); zero depth = no overscan (unchanged).
- Guard against neighbor bleed: oversized panels from adjacent windows must not overlap each other's openings or poke out of wall edges; clamp per-side extension where openings are close (bay spacing known at generation time).
- Check UV handling: the parallax shader must keep the interior image aligned to the opening, with the overscan area continuing the interior naturally (not stretching/shifting the visible portion at normal viewing angles).
- If clamping makes coverage impossible somewhere (very tight spacing + deep offset), fall back to the reveal box for that opening only — implementer's judgment whether this case actually occurs.
- Coordinate with AI 495 (interior shell openings) — if that work changes where panels are placed, land the shared placement/sizing logic once.
- Validate at grazing angles in the showcase scenario (`tests/headless/harness/scenarios/scenario_building_showcase.js`) and in gameplay-like camera positions; before/after screenshots.
- Tests: a unit test for the overscan math (depth/angle → per-side extension, clamped by spacing); a generator-level test asserting panel dimensions exceed the opening by the expected overscan for a configured fake depth.

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
