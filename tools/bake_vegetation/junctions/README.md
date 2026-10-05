# Anatomical branch unions

Use `node tools/bake.mjs --target vegetation/junctions` with scoped options:
`scene=<photographic review directory>`, `phase=build|cameras|render|all`, optional
`models=london_plane/mature_01`, `views=london_plane_junction_front`,
`width=2560`, `samples=128`. Defaults process all 15 models and render all views.
Each species gains front, oblique and clay attachment views. Oblique and clay
studies explicitly hide foliage to expose the attachment; obstructed front views
also hide foliage and are labelled accordingly. The camera-only phase preserves
all mesh coordinates/transforms by hash and aims at visibly diverging forks.
The existing shared Blender configuration and validation/publication gates apply.
This target rejects publication and leaves gameplay assets and the source scene intact.

Branch collar shells use the actual parent/child intersection and an asymmetric
lower swelling, narrower upper bark ridge, independently seeded irregularity and
a long descending parent shoulder. They fuse before photographic displacement.
Collar construction is opt-in; the shared orientation check also receives the
precision correction described below.
Foliage geometry and transforms are hashed before and after; refined wood must
remain manifold and all evidence must be unique Cycles PNGs at the requested size.
The displacement guard compares both triangle orientations in float64 after
quantizing coordinates to Blender's stored float32 positions. A narrow stationary
ground-cap regression runs before rebuilding; it previously failed solely because
the before/after cross products used different precision. The rejection threshold
and local damping remain unchanged.

Outputs: `tests/artifacts/screens/ai587_branch_unions/run-*/` (gitignored).
Research and anatomical limitations: `specs/trees/branch_union_anatomy.md`.
