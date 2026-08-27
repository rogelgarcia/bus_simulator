# DONE

# Problem

The classical ornament vocabulary is too thin to match period references. On
the Bradbury reference (`downloads/buildings_references/2.png` / `3.png`)
vs the `bradbury_block` reproduction:

1. **Pilaster capitals** are foliate/molded terracotta; the engine capital is
   a prismatic flat/stepped extrusion (AI 487) and reads as a plain block.
2. **The entry portal** has a multi-band archivolt (3+ nested bands), coupled
   colonettes with capitals, a frieze panel and finials; the engine offers one
   `arched_band` header + plain jambs + steps.
3. **The `arched_band` header itself renders damaged-looking** on wide arches:
   at portal scale (~2.6m wide) the band shows kinked/stepped geometry at the
   springing and small square "ears" where the curve meets the shoulders (see
   `tests/artifacts/screens/buildings/bradbury_entry.png`, user-reported as
   "the decoration in the arched door is damaged"). Likely the band polyline
   resolution / shoulder join in `buildWindowHeaderSurroundGeometry`.
4. **Grouped arches share no impost/sill band**: the reference's arcade
   springs from a continuous band per bay group; engine arches are individual
   windows (per-window sill + band), and the AI 493 `arcade.impost` only bands
   PIER bays between openings — there is no continuous band THROUGH a group of
   arched openings.
5. **The portal recess interior** renders in a fixed light material with no
   config hook, so recessed entries glow instead of shading.

# Request

- Capital profiles: add at least one molded capital profile (stacked
  torus/echinus curves approximating a foliate silhouette) selectable via
  `capital.profile`, keeping the AI 503 outward-projection convention.
- Arched surround: support `bands: N` (nested archivolt bands with per-band
  step) on the `arched_band` header type, and FIX the springing/shoulder
  artifact at large widths (smooth curve, no ears) — treat the fix as a bug
  even if the bands feature slips.
- Portal surround: optional colonettes (cylindrical, with base + capital) and
  a frieze panel band above the arch, all in the wall-material dialect.
- Continuous impost/sill band option for grouped openings: a band at
  sill/springing height running THROUGH the openings' piers and jambs of one
  bay group (extend the AI 493 arcade dialect or the belt system).
- Portal recess material hook (`portal.recessMaterial`, wall-material
  dialect) so the entry reads shadowed masonry.

## Delivery requirements
- Engine 2 only.
- Unit guards per feature (band count, capital profile emits, recess material
  resolves; arched band vertices monotone along the curve — no kinks).
- Before/after close-ups of the `bradbury_block` portal and arcade (adopted
  in AI 513 (the adoption pass; renumbered 2026-08-26)).

## Summary of changes (2026-08-26)

- **Arched-band fix** (WindowDecorationSurroundGeometry.js): the band's arcs
  now BOTH terminate on the horizontal springing line (classical impost cut)
  instead of a radial cut — the radial ends were the "ears"/kinked stubs on
  wide arches. Root cause of the "buried" look was separate: surround
  `depthMeters` snapped to a [0.02, 0.08, 0.12] option list, so the portal's
  authored 0.24m archivolt silently became 0.12m and sat flush with the proud
  rustication (z-fighting dots). The option list now reaches 0.3m.
- **`bands: N`** on `arched_band` headers (+ `bandStepMeters`, sanitized in
  WindowMeshDecorationTemplates): N nested archivolt rings split the radial
  height, each ring stepping back toward the opening; outermost keeps full
  depth, all rings >= 20mm proud. Wired through the generator and the window
  mesh debugger rig.
- **Molded capital**: `capital.profile: 'molded'` (FacadeBaysSolver whitelist,
  generator emitter, BF2 UI select) — four prismatic courses tracing neck ->
  echinus -> cove -> abacus, mirrored for bases, AI 503 outward-positive.
- **Continuous impost**: `arcade.impost.continuous: true`
  (FacadeBayGroupModel) — the impost emitter now also bands opening bays'
  jamb strips (bay edge -> opening edge, between repeats), splitting spans
  around the solved placements so the band runs THROUGH the run and breaks
  only at the arches.
- **Portal surround + recess** (WindowFabricationCatalog normalization,
  generator emitters): `portal.colonettes` (engaged plinth/shaft/cap columns,
  1-2 per side, threshold -> springing, role `portal_colonette`),
  `portal.frieze` (panel band above the head, role `portal_frieze`), and
  `portal.recessMaterial` — reveal quads of the recess get a dedicated facade
  material group (`revealMaterialIndex` through the wall builder, group
  handed back to the wall material after the reveals). Slot refs resolve via
  the pre-pass (`recessMaterial` added to the decoration-material walker).
- Core tests (AI 509): arc-on-circle + springing-line guards (radial-ear
  regression), 3-band ring depths, molded 4-course stack widening to 0.16m
  projection, continuous-impost jamb bands (and default still skipping
  opening bays), recess reveal group routing (and staying on the wall
  material without the hook), colonette/frieze emission + normalization.
- Captures: `ai509_ornament_capture.pwtest.js` (before = pre-fix code, after
  = patched bradbury via in-page config overrides; adoption lands in AI 513 (the adoption pass; renumbered 2026-08-26))
  and `ai509_compare_composites.pwtest.js` building reference-vs-before-vs-
  after single images: `ai509_portal_compare.png`, `ai509_arcade_compare.png`
  under tests/artifacts/screens/buildings/.
- Spec: BUILDING_2_SPEC_engine.md §6.2.5.
