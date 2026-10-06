# Problem

In the Bradbury block's Blender renders the building's edges are too sharp: every arris of the stone, terracotta,
brick and mouldings is a perfect CG line, which reads as artificial. The carved capitals escape it (their PBR
textures break the edge), the rest of the building does not. The owner wants the edges softened with a touch of
imperfection, without any destructive change to the meshes, and then a new flyover video rendered with it.

Context (the next AI can inspect the repo for details):
- The authoring scripts are in `src/graphics/content3d/buildings/authoring/BradburyBlock/` (its `README.md` documents
  every step). The render scene `bradbury_scene.blend` (with the city context in the background) is built by
  `build_scene.py` and rendered in Cycles; `render_wear.py` renders stills from it, `render_flyover.py` renders the
  portrait flyover video (frames + MP4) from it. Neither saves the scene.
- The whole chain (capital file -> portal pieces -> block -> wear layer -> render scene) is rebuilt by
  `python use_capital_stage.py 2` from that folder; any change to how the scene is built must survive that rebuild.
- Industry standard for this, agreed with the owner: render-time rounded edges in the shader (Cycles' Bevel node fed
  into each material's normal, keeping its existing normal map), optionally with a subtle edge mask driving roughness
  and a slight colour lift at convex edges (edge wear). No mesh bevels, no modifiers that change geometry.
- The owner has rejected procedural mottle/noise "weathering" twice: any edge imperfection must stay clean and subtle
  (no noise spots), and the existing wear layer must keep working as it does.

# Request

Give the building's edges a slightly rounded, worn look at render time, non-destructively, and render the flyover
video with it.

Tasks:
- The building's materials in the render scene (stone, terracotta trim, brick, mouldings, the portal; the carved
  capitals may keep theirs or take it, whichever looks right) show softly rounded edges instead of razor-sharp ones,
  with the existing texture detail kept. The meshes are not changed, and the effect can be switched off or tuned
  from one place (radius per material family, mask strength).
- Optionally, the very edges read a touch worn (slightly rougher and lighter), clean and subtle, no noise.
- The effect is part of how the render scene is built, so it survives `use_capital_stage.py` and `build_scene.py`
  rebuilds, and is documented in the folder's `README.md` (what it is, the radii, how to turn it off, its render-time
  cost).
- Before the video: same-camera before/after stills (Cycles, through `render_wear.py`) of a few close-ups (the portal
  pilaster capital and its pier, a brick column and the band, a window surround) and one far view, so the owner can
  judge the radius. Report the render-time cost (same pose, same samples, before vs after).
- Then render the full flyover video with `render_flyover.py` (all shots, the final MP4), with the edges on.
- Save all stills, comparison sheets, frames and the MP4 under `tests/artifacts/screens/bradbury_fix/edge_rounding/`
  (gitignored); never commit generated images or video.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_576_BUILDINGS_bradbury_render_edge_rounding_and_flyover_video_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change
- Include the before/after render-time numbers (pose, resolution, samples, device) in the completion summary
