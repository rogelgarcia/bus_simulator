# Enhanced reference video

`vegetation/reference-video` authenticates a saved enhanced reference summary and
all three selected mature London planes. It retains the original solid-leaf
instances, wood meshes and packed PBR materials. It never publishes game assets.

Use `node tools/bake.mjs --target vegetation/reference-video` with scoped options:

- `--set vegetation/reference-video:source=<review>/summary.json`
- `--set vegetation/reference-video:output=tests/artifacts/screens/<new-video-directory>`
- `--set vegetation/reference-video:phase=prepare|proof|render|assemble`

The shared Blender configuration supplies the headless executable. `prepare`
saves editable shot scenes without rendering; `proof` renders start/end camera
checks; `render` produces resumable authenticated H.264 clips; `assemble` orders
three complete rotations followed by each specimen's trunk, contextual branchlet,
and isolated branchlet close-ups. Both branchlet views use the same saved geometry
and camera motion. Defaults: 1920×1080, 24 fps, eight-second full orbits,
four-second close-ups, Eevee with 16 samples, two CPU workers, 60 seconds total.

Each output directory has an immutable source/settings identity. Changed source
or recipes require a new directory. Clip and final validation checks SHA256,
source identity, resolution and frame count. Outputs include editable scenes,
proof stills, per-shot receipts, `showcase.mp4`, `video.json` and `index.html`.
Review GPU availability before `proof` or `render`; preparation and assembly do
not run the 3D renderer. Existing scenes and shared assets remain read-only.
