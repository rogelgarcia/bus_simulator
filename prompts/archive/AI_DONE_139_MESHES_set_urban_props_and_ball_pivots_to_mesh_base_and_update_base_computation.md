#Problem [DONE]

Urban props (signs, traffic controls, and other street furniture) and the “ball” mesh currently have pivot points that are not at the base of the mesh. This complicates placement, snapping to ground, and any logic that tries to compute “base height” or apply offsets to rest assets on the ground. There are also places in the game/tooling that apply compensating adjustments to compute the base, which become incorrect once pivots are fixed.

# Request

Adjust all urban props and the ball so their pivot points are located at the base of the mesh, and update all related code that previously computed/offset the base so behavior remains correct and simpler.

Tasks:
- Identify all meshes that should be treated as “urban props” (the unified urban collection for Mesh Inspector, plus any additional street furniture assets used in city generation).
- Identify the “ball” mesh asset and all its usage sites.
- For each target mesh:
  - Update geometry/object transforms so the pivot/origin sits at the mesh’s base (lowest point intended to touch the ground).
  - Preserve world-space appearance after placement (i.e., props should not visually jump when spawned/loaded, aside from now being correctly grounded without extra offsets).
- Update all placement/grounding/base-height logic:
  - Find all places where the game/tooling adjusts Y offsets or computes “base”/“ground contact” for these meshes.
  - Remove or adapt compensating offsets that existed only because pivots were not at the base.
  - Ensure any generic “compute base” utilities still work correctly for meshes that may not have base pivots (if such meshes exist), while urban props + ball should no longer require special-casing.
- Verify behavior across:
  - City placement / spawning of urban props and traffic controls.
  - Mesh Inspector preview positioning.
  - Any physics collider alignment or interaction logic that depends on mesh origin.
- Add a small verification aid (manual checklist or lightweight test/helper) to detect assets whose pivot is not at base, to prevent regressions.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_139_MESHES_set_urban_props_and_ball_pivots_to_mesh_base_and_update_base_computation`
- Provide a summary of the changes made in the AI document (very high level, one liner)

## Summary
Moved urban prop and ball procedural mesh pivots to their base and removed the old `+1.2*scale` placement offset, with a lightweight test ensuring these meshes’ bounds start at `y=0`.
