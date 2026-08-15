PLACEHOLDER — DO NOT IMPLEMENT YET. This document only captures the idea and its integration surface. Discuss the open questions with the user and get an explicit go-ahead before any implementation.

#Problem

The facade layout system is quad-locked: `computeQuadFacadeFramesFromLoop` requires the footprint to resolve to exactly 4 axis-aligned runs (faces A–D), and every subsystem is keyed on that enum — facade specs, face linking, `faceMaterials`, decoration-set targets, corner resolution, and the BuildingFabrication2 face picker. Anything that is not a plain rectangle cannot carry bays, window definitions, or decorations: chamfered corner bays (refs 1/5), angled street frontages, and multi-wing L/V/W-shaped buildings are out of reach. The edge bevel (AI_buildings_499) deliberately stops at cutting the geometry and leaves the facets layout-less.

Reference images: `downloads/buildings_references/` — 1 (chamfered corner storefront), 5 (full-height chamfered corner bay with its own windows/balconies).

# Idea (for discussion)

Generalize the facade model so a building has N named faces — A, B, C, D, E, F, G, H, I, … — derived from the footprint polygon's runs, each at an arbitrary angle, and each a first-class facade with the full feature set: bay layouts and fill patterns, window definitions, per-face materials, face linking, decoration sets, and silhouette depth offsets. This turns footprints into authorable buildings instead of extrusion-only shells:

- L-shaped, V-shaped, W-shaped buildings whose every wing face is a real facade.
- Chamfered/angled corner faces stop being a special case — a wide corner cut is just another face that can host a corner storefront (ref 1) or a windowed corner bay (ref 5).
- AI_499's main-corner bevel facet frames are the intended seam: a wide corner bevel promotes to a full face without re-deriving geometry.

Sketch of the shape of the work (not a task list yet):
- Face identity derives from footprint runs with a stable ordering; rect footprints must keep resolving to the same A–D so existing content is untouched.
- The quad silhouette solver generalizes to per-run frames. Window placement is already run-based and angle-agnostic; the bay/pattern solver and depth-offset silhouette need per-face frames instead of the A–D assumption.
- Corner resolution generalizes from orthogonal meetings to arbitrary angle pairs.
- GUI needs a scalable face representation (likely a plan-view face picker instead of four letter buttons).

Open questions to settle with the user BEFORE implementing:
- Face identity stability: when a footprint edit changes the run count or order, how do existing per-face configs (materials, bays, links, decorations) remap? Positional letters vs explicit face ids stored on footprint runs?
- Which footprint sources participate (hand-authored `footprintLoops` only, or city-organizer boundary-driven footprints too)?
- Interaction with `cornerTreatment` at non-90° arrises (quoins/strips on angled corners), and with belts/cornices (already loop-driven, should be free).
- Scope of the first slice: promote bevel facets to faces only (refs 1/5), or go straight to full L/V/W multi-wing footprints?
- Config migration strategy and which L/V/W building becomes the first showcase.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
