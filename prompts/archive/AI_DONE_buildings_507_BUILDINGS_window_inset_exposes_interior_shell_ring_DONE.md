# DONE

# Problem

A window definition with `frame.inset` deeper than ~1cm renders with a light
ring around the frame — the AI 495 interior shell showing in FRONT of the
recessed frame.

Mechanism (diagnosed 2026-08-26 while building `bradbury_block`, raycast
verified):

- The interior shell plane sits at the face's minimum bay depth minus
  `FLOOR_INTERIOR_SHELL_INSET_METERS` (0.01) — i.e. 1cm behind the facade wall
  FRONT on a flat face (`shellDepthOf`, BuildingFabricationGenerator ~8413).
- Shell cutouts are shrunk by `INTERIOR_SHELL_REVEAL_METERS` (0.08) per side
  (`projectFacadeCutoutOntoShell`, ~5530-5546).
- So for a frame inset > 1cm, the frame sits BEHIND the shell face and the
  shell's 8cm hole margin reads as a pale ring in front of the frame (probe:
  shell face z=20.99 in front of frame z=20.91, wall front z=21.0).

Every stock def with a ~9cm inset (e.g. `window_black_6_panels_tall`,
`window_sash_trim_surround`) shows this ring today; it reads as an unintended
pale "surround". `bradbury_block` works around it with `frame.inset: 0`
(flush sashes), but the reference wants ~10cm reveals — deep-set windows are
currently impossible to author correctly.

# Request

Make recessed window frames read correctly:

- The shell hole must clear an inset frame — e.g. expand the shell cutout to
  at least the wall cut size when the opening's frame is inset, or
- have the facade own reveal geometry from wall front to the frame plane (the
  cutouts already carry `revealDepth = frame.inset`) in the wall material, so
  the visible reveal is brick/stone, not shell.

Check the same interaction for door and storefront cuts.

# Delivery requirements
- Engine 2 only.
- Core test in the spirit of the AI 502/506 wall guards: an opening with
  `frame.inset: 0.09` has no shell geometry visible inside the cut in front of
  the frame plane, and the reveal faces carry the wall material.
- Before/after close-up of a deep-set sash (re-baseline `bradbury_block` in
  AI 511 with `frame.inset` restored to ~0.09).

## Summary of changes (2026-08-26)

- `projectFacadeCutoutOntoShell` (BuildingFabricationGenerator.js) now sizes
  the shell hole from where the opening's frame plane sits. It recovers the
  cutout's bay-front depth from the face frame and subtracts the cutout's
  `revealDepth` (= frame inset, incl. portal recess and storefront zones);
  when that frame plane clears the shell plane by at least half the shell
  setback (`FLOOR_INTERIOR_SHELL_INSET_METERS * 0.5`), the hole keeps the AI
  495 reveal-ring shrink (0.08m/side). Otherwise the hole GROWS past the wall
  cut by `INTERIOR_SHELL_CLEARANCE_METERS` (0.02m/side), so no shell reads in
  front of the recessed frame; the facade's own reveal walls (wall material,
  built from the cutout's `revealDepth`) line the cut and hide the hole edge.
- Street-floor legacy cutouts (`revealDepth = outer - interior depth`) keep
  the ring: their filling sits at the interior plane, 1cm in front of the
  shell, so the same rule picks the shrink branch for them.
- Core tests (tests/core.test.js, AI 507): a unit test on the projection
  (flush frame keeps the shrunk ring, 9cm inset grows the hole past the cut,
  a proud-bay frame ahead of the shell keeps the ring), and a full-build test
  with `window_black_6_panels_tall` (inset 0.094) asserting no interior-shell
  vertex inside the cut in front of the frame plane and that the reveal box
  spans wall front -> frame plane inside the facade mesh's base wall material
  group. Both verified red against the pre-fix margin logic.
- New capture spec `ai507_window_inset_capture.pwtest.js`: close-up of a
  deep-set sash in brick (before: pale shell ring floats in front of the
  frame; after: clean brick-lined recess). Evidence pair in
  `tests/artifacts/screens/buildings/ai507_deep_inset_sash_{before,after}.png`.
- Spec: BUILDING_2_SPEC_engine.md §6.2.1 documents when the shell cut shrinks
  vs when it must clear the wall cut. `bradbury_block` re-baseline with
  restored insets stays with AI 511 as planned.
