# DONE

# Problem

The AI 509 demo dressed the `bradbury_block` arch windows with `bands: 2`
appliqué archivolts — double arch rings laid ON the wall face. That is not
what the reference does (user review vs
`downloads/buildings_references/2.png`, top-floor arcade and the brick
floors):

- In the reference there is a LARGER inset carved into the wall (a recessed
  panel), and inside that inset a second, deeper inset where the window
  actually sits.
- There is no applied arch element at all: the "archivolt" reading comes from
  the arch-topped EDGES of those nested insets stepping in depth (and on the
  brick floors the same nesting is rectangular — pier panel, then window
  recess).

The engine can only carve ONE rect/arch cut with ONE reveal depth per
opening (`revealDepth`), so nested stepped insets around an opening are
currently impossible; appliqué bands were the wrong tool.

# Request

**Nested wall insets** as an opening feature (windows and doors alike):

- Config on the opening (`window.insets`, list of 1..3 steps, outermost
  first): each step gives extra size around the previous step
  (`marginMeters` per side, or explicit width/height padding) and a
  `depthMeters` it recesses to. The opening's frame mounts at the innermost
  plane (its `frame.inset` measures from there), so existing openings without
  `insets` are unchanged.
- Each step's head follows the opening: arch-topped iff the opening is arched
  (the step's arch derives from the opening arch rise at the step's width),
  rectangular otherwise — the arched reading must come from the stepped
  insets, with no appliqué band.
- Implement as REAL carving in the facade wall: extend the cutout/reveal
  machinery from one (rect, revealDepth) to a step stack — outer cut with
  reveal walls to depth1, inner cut from depth1 to depth2, ... Reveal walls
  and the step faces (the visible rings/shoulders between steps) carry the
  wall material by default with an optional per-step override, reusing
  `revealMaterialIndex` (AI 509).
- The AI 507 interior-shell rule extends to the stack: the shell hole must
  clear the INNERMOST frame plane; intermediate step faces are facade-owned
  geometry, never shell.
- `bands: N` on `arched_band` headers stays for genuine appliqué archivolts;
  the bradbury windows move to insets in the adoption pass.

## Delivery requirements
- Engine 2 only.
- Unit guards: a two-step inset carves two reveal depths with the step faces
  between them; an arched opening's steps are arch-topped and follow the
  opening arch; the shell clears the innermost frame (AI 507 guard extended);
  an opening without `insets` builds byte-identical wall geometry to today.
- Before/after of the `bradbury_block` top-floor arcade (and one brick-floor
  window) vs the reference in ONE composite image
  (`ai509_compare_composites.pwtest.js` pattern). Adoption into the bradbury
  config lands in AI 513.

# Outcome (2026-08-27)

Implemented as `insets` on the opening (window definition item, sibling of
`settings`/`decoration`/`portal`; per-bay `window.insets` override passes
through the solver): 1..3 steps, OUTERMOST first (the portal-level dialect),
each `{marginMeters | widthPaddingMeters/topPaddingMeters/bottomPaddingMeters,
depthMeters, material}` where `depthMeters` is how much deeper that step's
floor sits than the plane before it.

- `normalizeOpeningInsetsConfig` (WindowFabricationCatalog) is the one
  normalizer used by the generator, the BF2 View library paths, and the
  catalog result — all three whitelists extended, plus the AI 491 material
  pre-pass resolves per-step `material` slots.
- The generator resolves the CONTOUR STACK (`resolveOpeningInsetContours`):
  arched openings keep every contour concentric with the cut circle (radial
  growth = width padding, head rises by exactly that; a semicircle stays
  semicircular via the chord identity), rect heads use the top padding. The
  wall face opens to the OUTERMOST contour; the wall builder emits per-step
  reveal walls over their own depth ranges plus wall-parallel shoulder rings
  (planar wall UVs, so masonry coursing continues into the recess; ring paths
  and reveal walks share one arc sampling so edges meet exactly).
- The frame mounts at the innermost plane by bumping `frame.inset` with the
  carved sum at placement time (the portal recess pattern), which makes the
  AI 507 shell extension automatic (`shellRevealDepth` = total). Step
  reveal/shoulder materials route through the AI 509 `revealMaterialIndex`
  mechanism. A portal def excludes insets (warning); the outer contour clamps
  to the bay strip.
- Unit guards in `tests/core.test.js` (contour concentricity, two reveal
  depths + shoulder rings + arch-following crown in a full build, shell
  clearance, byte-identical wall geometry without insets, normalization).
- Two defects caught in visual review and fixed:
  1. `projectFacadeCutoutOntoShell` spreads `{...cutout}`, so `insetSteps`
     leaked onto the interior shell — the shell re-emitted the whole ring
     stack in white plaster ~13cm in front of the brick steps (the shell
     plane rides the proudest strip while the arcade bays are recessed).
     The shell projection now nulls `insetSteps`; the AI 507 core guard
     probes the whole outer-contour region so this class regresses loudly.
  2. The bay-strip clamp assumed one opening per bay; arcade bays use
     `repeat: 3`, so neighbouring outer contours overlapped and left shell
     slivers at the arc crossings. With repeats the clamp now fits each
     stack to its SLOT — neighbouring arcs just touch at the springing
     points, which is exactly the reference's continuous arcade rhythm.
- Captures: `ai511_insets_capture.pwtest.js` (arcade front/graze + brick-floor
  sash, before/after via AI511_TAG) and the two-row composite
  `ai511_compare_composites.pwtest.js` →
  `tests/artifacts/screens/buildings/ai511_insets_compare.png`. The bradbury
  adoption (replacing the arcade `arched_band` header with insets in the real
  config) stays with AI 513.
