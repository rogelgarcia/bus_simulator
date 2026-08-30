DONE

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

### Also RULED OUT: atlas resolution and loading

An in-browser probe resolved and loaded both atlases successfully:
- `window_interior_atlas.residential_4x4` -> `.../parallax_interior_atlas_residential.png`, loads OK 1024x1024
- `window_interior_atlas.shop_wide_6x4_01` -> `.../parallax_interior_atlas_wide_6x4_01.png`, loads OK 1536x1024, cols/rows 3x3

So the id lookup, the URL, and the download all work for shop atlases. The
placeholder is displayed even though the real texture is available, which means
the failure is in the **swap-in or material binding**, not in resolution:
`getOrCreateInteriorAtlasTexture` mutates `tex.image` on the cached placeholder
after `loader.load` resolves. Suspects, in order:
- the storefront's interior material is created from a DIFFERENT texture instance
  (or a clone) than the cached one that gets mutated, so the swap never reaches it;
- the material/texture is uploaded and never re-uploaded (`needsUpdate` lost, or
  the texture is copied into an atlas/merge path that snapshots the image);
- the geometry merger (`BuildingGeometryMerger`) dedupes storefront materials and
  keeps a different instance than the one the loader patches.

Next probe: in a built scene, compare the identity of
`getOrCreateInteriorAtlasTexture(shopUrl)` against the actual
`interiorMesh.material.map` on a storefront instance (`===`), and log
`material.map.image.width` a second after load. If they differ, that is the bug.

Note: `uvZoom` is NOT the cause either — dropping the shop preset from 2.4 to 1.0
shows MORE repetitions of the same band pattern, which is procedural-placeholder
behaviour, not a photo.

RULED OUT (do not re-test): load timing. Capturing after a 12s wait shows the
same placeholder, while upper-floor residential windows in the same frame show
real photos. Both PNGs are comparable in size (~2.4 MB) and both return HTTP 200.
So the shop atlas image swap never happens at all — the suspect remains the URL
handed to `getOrCreateInteriorAtlasTexture` resolving empty for SHOP_* ids
(taking the pure-procedural branch), NOT a slow or failed download.

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

# Diagnosis (what it actually was)

Isolation renders plus a GPU read-back settled it, and it was **not** the URL
resolution suspected above. Evidence, in order:

1. A scene probe showed the storefront interior material bound to the real
   `parallax_interior_atlas_wide_6x4_01.png` (1536x1024 `IMG`), with correct
   3x3 instance UV offsets/scales. So the CPU side was already right.
2. Hiding the panel removed the bands (27.8k px of the frame), so the bands were
   the parallax panel, not the glass and not occlusion.
3. Rendering the atlas texture verbatim on a quad in front of the camera showed
   the **procedural placeholder** for the shop atlas and the real photos for the
   residential atlas — i.e. the GPU held different pixels than `texture.image`.

Root cause: `getOrCreateInteriorAtlasTexture` swapped the downloaded image into
the live texture with `tex.image = loaded.image`. three.js allocates *immutable*
GPU storage (`texStorage2D`) the first time a texture `Source` is uploaded,
sized from the image it held then — the 1024x1024 placeholder canvas. Keeping
that `Source` means the follow-up upload is only a `texSubImage2D`, which a
1536x1024 atlas cannot fit, so it was silently rejected and the placeholder
stayed on screen. Residential worked purely by coincidence: its atlas is
1024x1024, the same size as the placeholder.

# Summary of changes

- Interior atlas swap now disposes the placeholder allocation and adopts the loaded texture `Source`, so a differently sized atlas actually reaches the GPU.
- Interior atlas textures carry a `pending`/`failed` flag; the harness "textures ready" gate no longer accepts a placeholder-only atlas, and a failed load warns.
- Corrected 5 more mis-declared atlas grids read off the images (`wide_6x4_02` 3x3, `square_4x4_02/03` 2x4, `square_4x4_04` 4x3, `cinematic_8x4_02` 4x2) in both declaration sites.
- Atlas layout catalog now records each atlas' pixel size, and presets derive interior `imageAspect` from the real cell aspect instead of a hardcoded 1.0 (shop photos are 3:2, they were being stretched).
- Retuned the shop preset now that a photo renders (`uvZoom` 2.4 -> 1.5, `parallaxDepthMeters` 5.0 -> 7.5); the AI 488 detune was chosen against the placeholder artifact, and the grazing-angle capture confirms the cell edge still never clamps.
- New guard test decodes the atlas PNGs and asserts every declared cell boundary lands on a real seam (and that a finer grid is rejected), so a filename can never be the source of truth again.
- New browser regression test reads the interior atlas back off the GPU and correlates it against the decoded image; it fails on the pre-fix code and passes after.
- Added `ai500_storefront_interior_capture` visual capture (street / close-up / grazing) and documented the atlas + swap rules in `specs/window_mesh_specification.md`.
