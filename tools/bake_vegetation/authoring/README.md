# Shared authoring sources

`build.py` consumes one species recipe through the shared bake framework;
`geometry.py` authors the metric branch skeleton and accepted foliage.
`woody_detail.py` reconstructs the wood as fused volumes with roots, continuous
collars and physical bark relief. `bark_fields.py` supplies deterministic species
fields shared by displacement and material masks; `textures.py` authors maps.
Use the [domain commands](../README.md), never a separate machine-specific
Blender invocation. The species recipes and these deterministic sources are the
canonical reproducible originals. Every v3 form also publishes an editable,
packed Blender scene under the species' `authoring/` directory. The same source
can later drive retopology and baking without discarding this detailed pass.

Do not alter the foliage random sequence or existing leaf-map authoring while
changing wood. Bark micrograin normals supplement physical relief; they do not
repeat the entire displaced surface slope. The prototype oak, plane, shrub and elm leaves
use the same framework for inspection before publishing the fifteen-form family.

The junction correction blends sampled colors/heights on the fused surface,
not UV angles between branch axes. Macro color is a linear point-color attribute;
Blender multiplies it by the neutral micrograin map. Publication promotes the
authored bark layer to glTF `COLOR_0` and validates that it is populated. Foliage
color channels remain unchanged. Basal trunk rings form asymmetric root flares.

`shrub_wood.py` varies basal stem diameter and cross-section, adds shallow lower
curves below the retained foliage, and extends each stem below the ground cut.
Its root crowns are continuous lobes, not separate capped root cylinders.
`photographic_bark.py` authenticates CC0 inputs, separates blurred photographic
macro color from residual luminance, and samples color and height on the fused
surface. It writes photographic fine-detail, OpenGL normal and roughness maps.
Source receipts accompany the published family. Trees keep their existing
procedural bark and geometry settings.

American elm v1 introduces arching vase scaffolds, original interlacing ridged
bark and small double-serrated leaf shells with asymmetric bases. New-species
branches in the shared author preserve existing species' random sequences.
