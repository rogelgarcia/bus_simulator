# Three-zone mature LOD0

Run through `node tools/bake.mjs --target vegetation/hybrid-lod0`, using the
shared ignored Blender configuration. Phases in order: `atlas`, `build`,
`compress`, `render`, `variants`, `gallery`. `render` compares mature form 01;
`variants` adds full-tree views of forms 02 and 03. `models` accepts `all` or comma-separated
`species/mature_0N`. Carry the same `output` through all phases. Never point it
at a reference directory. `atlas-source` may reuse an authenticated flat atlas
from a separate staged candidate during `build`; copied maps are hashed and
existing different copies are rejected. `card-scale` adjusts only interior cards
for coverage calibration. This leaf rejects publication and leaves game assets
and all reference files untouched.

The latest natural reference index supplies variable shoot groups and leaf
transforms. The accepted core LOD0 supplies immutable wood and baked PBR maps.
Interior branchlets are authored flat before unlit color/normal/roughness
capture. Silhouette groups use detailed curved opaque blades; the transition
layer uses simpler curved opaque blades. Cards are single-surface, two-sided,
fixed in space, and share eight layouts per species. Full exports use the
existing authenticated UASTC encoder and alpha-coverage mip workflow.

GPU profiling is deferred by user request. Texture baking and comparison renders
use CPU Cycles, with four worker threads, to avoid the occupied GPU.

Output includes all three mature variants per species, separate wood/card/
detailed-leaf/simple-leaf triangle counts, native Blender sources, material
atlases, and matched full-tree and leaf-detail comparisons. Geometry and alpha
occupancy are workload measures, not a claim of measured gameplay FPS.
