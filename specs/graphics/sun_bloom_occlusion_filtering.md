# Sun-bloom occlusion filtering

The production sun-bloom helper pass uses conservative screen-space filtering.
The behavior is content-agnostic and is driven by render layers, scene
visibility, material behavior, and projected mesh bounds.

## Frame outcomes

- `irrelevant`: no active sun-bloom emitter bounds intersect the guarded
  viewport. The helper composer is skipped and the composite samples a black
  texture for that frame so previous bloom cannot remain visible.
- `clear`: bloom content intersects the viewport, but no non-bloom mesh can
  overlap it in screen space and depth. Only the sun-bloom layer is rendered.
- `candidate_occlusion`: potential occluders exist. Candidate meshes use the
  existing black or alpha-cutout occlusion materials; other ordinary scene
  renderables are hidden only for the helper pass and restored immediately.

The screen region is the union of active bloom-emitter bounds plus a guard for
bloom spread, viewport-edge transitions, and subpixel camera jitter. Candidate
objects must overlap that region and be no farther than every relevant emitter.

## Conservative bounds contract

Normal and instanced meshes use their local geometry/object bounding boxes
transformed by the current world and camera matrices. Skinning, morph targets,
missing bounds, explicitly unsafe bounds, and unknown shader-driven vertex
movement remain conservatively eligible.

Shader-based bloom emitters may set
`object.userData.sunBloomProjectionBoundsSafe = true` only when their vertex
shader does not move vertices outside the mesh geometry bounds. The built-in
sun disc and ray billboard rigs satisfy that contract. Unknown shader emitters
fall back to full-viewport relevance.

## Compatibility and diagnostics

Filtering does not change authored bloom strength, radius, threshold, disc,
rays, shadows, static visibility, scene color visibility, or alpha-cutout
thresholds. Camera layers, object materials, and temporary visibility changes
are restored after every helper render, including exceptional exits.

`PostProcessingPipeline.getDebugInfo().sunBloomOcclusion` reports the outcome,
emitter and candidate counts, conservative inclusions, candidate-test time,
approximate retained-reference storage, and helper-pass calls/triangles. The
debug-only `sunBloomFilter=0` query parameter preserves the legacy full-scene
path for controlled A/B profiling; normal gameplay defaults to filtering.
