#Problem

Ground-floor storefront display glazing (AI 488 `storefront` asset type) does not show its shop parallax interior. From street level the glass reads as a flat fake sheet: diagonal light-gray bands over a mauve field, with no recognizable shop behind it. Upper-floor windows on the same building show their residential parallax interiors correctly, so the parallax system as a whole works — the failure is specific to storefront glazing.

Reported by the user against `storefront_row_2`; reproduce with the ground-floor shop row at street level.

Diagnostic evidence already gathered (AI 496 follow-up):
- A scene probe confirms the storefront glazing DOES build a live interior: `interior.enabled: true`, atlas `window_interior_atlas.shop_wide_6x4_01` bound with a texture (`interiorMatHasMap: true`), one visible interior mesh per glazing instance. The panel is not missing — it is not reaching the camera.
- A real registration bug was found and fixed on the way: the shop atlases were registered from their FILENAMES, which do not match the images (`wide_6x4_01` is actually 3x3, `cinematic_8x4_01` is 4x4, `square_4x4_01` is 3x1). A wrong grid makes the shader sample a sliver across neighbouring photos. Both declaration sites (layout catalog + per-atlas metadata) were corrected. **This did not change the symptom** — the render is pixel-identical before and after — so a second, independent cause remains.
- The bands are unchanged by an atlas swap, so they are probably not the interior texture at all.

## ROOT CAUSE LOCATED (do this first)

Isolation renders settled it. Rendering the storefronts with the glass made fully
transparent leaves the diagonal bands **unchanged and more vivid**, each opening
tinted differently — those per-instance tints are `instanceInteriorTint`. So the
bands ARE the parallax panel, and it is not the glass, not occlusion, and not the
atlas grid.

`getOrCreateInteriorAtlasTexture` (`WindowMeshMaterials.js`) builds a
**procedural placeholder** canvas (`makeProceduralInteriorAtlas`) first and swaps
in the real PNG afterwards. The diagonal bands are that placeholder. Note the key
scheme: an empty URL takes the pure-procedural branch (`proc|c:..|r:..`) that
never loads an image at all.

Therefore the shop atlas URL is almost certainly resolving to empty at runtime:
`getWindowInteriorAtlasById(s.interior.atlasId)?.url ?? ''`. Residential/office
windows render real photos through the identical code path, so the loader itself
works — the difference is the SHOP atlas id lookup.

Confirm before fixing (one probe): in a built scene, log
`getWindowInteriorAtlasById('window_interior_atlas.shop_wide_6x4_01')` and the
resolved `url` actually handed to the texture loader, and whether the swap-in
callback ever runs for a shop atlas. The PNGs themselves are fine: both
`parallax_interior_atlas_residential.png` and
`parallax_interior_atlas_wide_6x4_01.png` return HTTP 200 from the dev server.

Also worth checking while in there: the capture harness gates on "textures
ready", yet a placeholder-only atlas apparently satisfies that gate — so the
readiness metric does not count interior atlases. Make a never-loaded interior
atlas visible to that gate (or to a warning), so this class of bug cannot render
silently again.

Already fixed on the way (keep, unrelated to the remaining symptom): the shop
atlases were registered from their FILENAMES, which do not match the images
(`wide_6x4_01` is really 3x3, `cinematic_8x4_01` is 4x4, `square_4x4_01` is 3x1).
Both declaration sites were corrected against the actual PNGs.

Superseded hypotheses (ruled out by the isolation renders above, kept for the record):
1. The storefront glass is near-mirror (`roughness 0.03`, `envMapIntensity 1.0`, `opacity 0.24`) and its environment reflection buries whatever is behind it.
2. Something opaque sits between the glass and the parallax panel — e.g. the interior shell wall/floor of a floor layer with `interior: { enabled: true }` (overlaps AI 495), or a storefront zone slab (bulkhead/fascia/transom) covering more than its band.
3. The glazing zone's derived settings (via `makeStorefrontZoneSettings`) place the panel outside the visible cut, or the shop preset's `uvZoom`/`parallaxScale` crop lands on a flat region of the atlas cell.

# Request

Make storefront display glazing show its shop interior from street level, the way upper-floor windows show theirs.

Tasks:
- Diagnose first, with evidence, not by pattern-matching: isolate the layers (render with the glass layer suppressed, and with the interior shell disabled) to determine which of the hypotheses actually holds. Report which one it was.
- Fix the identified cause. If it is the glass material, re-balance storefront glass so the interior reads while the glass still looks like glass (reflection should not be removed wholesale — a shopfront needs some sheen). If it is occlusion, fix the placement/ordering so the panel is visible through its own opening, and coordinate with AI 495 rather than duplicating shell logic.
- Verify the shop atlas cell actually lands on shop content at the configured `uvZoom` / `parallaxScale` for the storefront's wide opening aspect; adjust the shop preset if the crop is degenerate.
- Re-evaluate whether the AI 488 shop-preset detune (`uvZoom 2.4`, `parallaxDepthMeters 5.0`, `parallaxScale 0.7`) is still needed once the interior is actually visible. It was chosen against an artifact that may have been this bug rather than a genuine grazing-angle limit.
- Guard the class of bug that produced the mis-registered atlases: the existing `shop_interior_atlases` test compares one declaration against another declaration, so both can be wrong together. Add a check that validates a declared grid against the actual image (e.g. decode the PNG header for dimensions and assert the cell aspect is plausible, or detect seam lines), so a filename can never again be the source of truth.

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
