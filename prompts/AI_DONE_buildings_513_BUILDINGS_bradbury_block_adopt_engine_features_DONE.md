# DONE

# Problem

`bradbury_block` (the Bradbury reference reproduction —
`downloads/buildings_references/2.png` / `3.png`, notes in
`docs/bradbury_block_reference_notes.md`) ships with config-level
approximations wherever the engine lacked a feature. AI 507-512 add those
features; this task closes the loop by adopting them in the building so the
render converges on the reference.

Run this LAST, after AI 507 (window reveals), 508 (lettering), 509
(ornament kit), 510 (portal fabrication framework), 511 (nested arched
window insets) and 512 (N-face facade model) land — the numeric order is the
execution order.

# Request

Update `src/graphics/content3d/buildings/configs/BradburyBlock.js`:

1. **Corner (AI 512):** author the ~3m AB chamfer as a real corner
   face with a window per floor — `window_bradbury_sash` on the brick floors,
   `window_bradbury_arch` on the arcade floor.
2. **Lettering (AI 508):** "BRADBURY" raised letters centered on the portal
   frieze band, terracotta/sandstone material.
3. **Window reveals (AI 507):** restore realistic deep-set joinery —
   `frame.inset` ~0.09 on `window_bradbury_sash` and `window_bradbury_arch`,
   ~0.06 on `storefront_bradbury` and `door_portal_bradbury`; confirm no
   shell ring remains and the reveals read as brick.
4. **Portal (AI 510):** author the entry as a portal fabrication def —
   nested arch orders carved/stepped into the wall with dedicated trim and
   joinery materials (NOT the wall texture rerun), colonette pairs, frieze
   panel, dark shadowed recess. Drop the interim AI 509 appliqué demo
   (`bands: N` header + ad-hoc colonette/frieze config) for the entry.
5. **Arch windows (AI 511):** replace any appliqué arch bands on
   `window_bradbury_arch` with nested arch-topped wall insets (outer inset
   panel, deeper inner inset, window at the innermost plane) as the
   reference does; keep the AI 509 continuous impost band through each
   arcade bay group. Molded capital profile on the pilasters.
6. Re-tune whatever the above disturbs (entablature height, arch verticalOffset
   against the impost band, parapet block rhythm) against the reference
   crops, and refresh `docs/bradbury_block_reference_notes.md` — items solved
   by AI 507-512 move from "not achieved" to "reproduced", with the remainder
   (sculpted foliate detail, fire-escape ladder detail, site context)
   restated.

## Delivery requirements
- Engine 2 only.
- Re-run `bradbury_block_capture.pwtest.js` and rebuild the reference
  side-by-side composites (`ai509_compare_composites.pwtest.js` pattern:
  reference | before | after in one image) for the portal, arcade and
  overall views.
- Full core suite green (modulo the documented pre-existing failures).

# Outcome (2026-08-27)

- **Corner (AI 512):** the ~3m chamfer is authored directly in the footprint
  loop (5-point plan) and promotes to real face B — corner storefront at
  ground (transom band continuing around), one sash per brick floor, one
  arch at the arcade; faces re-keyed A/B/C/D/E (D->A, E->C links,
  side fire escape retargeted to C). `edgeBevel` config dropped. The
  AI 512 `EDGE_BEVEL_WIDTH_MAX_METERS` 1.5->4.0 raise (documented in
  DONE-512 but not yet in code) landed here too.
- **Lettering (AI 508):** "BRADBURY" on the portal box frieze via
  `wallDecorations.lettering` (zone `opening_header`, terracotta), letter
  depth 0.22 so the sign stands ~7cm proud of the 0.15-proud box face; the
  def's `topMarginMeters` raised 0.25->0.5 so the box face reaches the band.
- **Reveals (AI 507):** `frame.inset` 0.09 on sash + arch defs, 0.06 on the
  storefront and entry door; no interior-shell ring, reveals read as
  brick/stone (verified in the graze/storefront captures).
- **Portal (AI 510):** the reviewed `portal_bradbury_entry` def from the
  AI 510 capture adopted as `portalDefinitions.items[0]` — box + blind pier
  panels + skirt base, two arched levels to the dark brownstone recess,
  archivolt ring on wedge imposts (walls: both), foliate-capital GLB relief
  atop each pier, one step; entry bay widened 3.6->5.6 (the box margins ARE
  the piers, the two 1m wall piers dropped); door def: semicircular arch
  (heightRatio 0.5), appliqué header/jambs/inline portal removed.
- **Arch windows (AI 511):** `insets` on both defs (arch: two arched steps
  0.08+0.08 deep; sash: one rectangular panel 0.06), appliqué `arched_band`
  header off; arcade bay groups on faces A/B/C with AI 509
  `arcade.impost.continuous` terracotta bands; all arcade windows unified at
  1.05m so every face springs from one line (side pairs 1.2->1.15 also for
  the shortened run); pilaster capitals `stepped`->`molded`.
- Composites: `ai513_compare_composites.pwtest.js` ->
  `ai513_{portal,arcade,overall}_compare.png` (reference | before | after);
  docs/bradbury_block_reference_notes.md refreshed (items 1-6 of the old
  gap list moved to "reproduced"; remaining: corner pavilions, sculpted
  facade capitals, secondary ornament, site context). Core suite green
  (3 documented pre-existing baselines only).
