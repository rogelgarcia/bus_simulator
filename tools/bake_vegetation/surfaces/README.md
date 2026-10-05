# Photographic vegetation surfaces

`node tools/bake.mjs --target vegetation/surfaces --set vegetation/surfaces:phase=build` reconstructs
all 15 mature specimens into a separate editable review scene. Use the shared
`tools/baking/blender.local.json`; no standalone Blender installation or command
is introduced. Render a saved scene with `--set vegetation/surfaces:phase=render
--set vegetation/surfaces:scene=<path>`.
Options (each scoped to `vegetation/surfaces:`): `width=2560`, `samples=128`,
`device=OPTIX`, and comma-separated `views`.
`phase=leaves` with `scene=<candidate directory>` rebuilds only the closed leaf
prototypes and studies in a new scene, keeping the existing wood and map pack.
This uses the same authenticated, isolated headless framework and remains stage-only.

The target is explicit and stage-only. It rejects `--publish`, preserves the
existing accepted-wood contracts, and never changes the current gameplay assets.
The user-authorized surface revision has its own topology, scan-hash, retained
canopy anchor and render checks. All output goes under the ignored
`tests/artifacts/screens/ai586_photo_pbr/` directory.

`sources.json` authenticates CC0 original maps copied from downloads to
`assets/public/vegetation_sources/ai586/` (plus the existing bark_brown_02 set).
Four new Poly Haven bark scans and five ambientCG leaf scans replace generated
noise. Wood is reconstructed before photographic displacement, removing the old
procedural relief and repeated circular scars. Triplanar height shading keeps
fused collars continuous. Normal maps remain in the reusable PBR packs; the wood
shader differentiates the registered height map for its triplanar normal.
Derived bark packs are 2048 by 4096 pixels: four offset scan crops share the
same transitions in every PBR channel, extending the physical vertical repeat
to four native tile lengths. Leaf maps are padded outside the photographed mask
before geometric reshaping, avoiding dark rims without alpha blending.

Leaf shells trace photographic silhouettes and retain co-registered tissue UVs.
The red-oak lobes, linden/arrowwood teeth and elm base are adapted to botanical
photos. Independent seeded controls vary curl and shape; no alpha plates are
used. Upper/lower response, especially the silver linden underside, is an
artistic species adaptation, not measured photometry. Exact species scans were
not available for every surface; `recipes.json` explicitly records each proxy.

Sources: Powered by Poly Haven (CC0); ambientCG / Lennart Demes (CC0).
Botanical study photos and individual license captions are retained in
`downloads/vegetation/ai586/references/index.json`; they are references, not
runtime textures. The cgbookcase full-resolution download was inaccessible and
was not used. See `specs/trees/photographic_vegetation_surfaces.md`.
