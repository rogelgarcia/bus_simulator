# Ray-traced mature vegetation review

`vegetation/showcase` is an explicit artifact-only bake leaf. It uses the shared
headless Blender runner and configuration, authenticates model/source inputs,
rejects publication and never changes gameplay trees or the original library.

The editable packed Blender scene must contain 15 mature models: three each of
London plane, silver linden, northern red oak, American elm and arrowwood
viburnum. Species occupy non-overlapping plots. Original detailed trunks and
closed 3D leaves remain; geometry-node instancing may share the exact repeated
leaf templates, retaining their seeded positions, normals, UVs, color and scale.
Each reconstruction must match installed foliage counts, triangle counts and
bounds within 0.02 mm. No alpha plates or decimation are part of this scene.

Use the existing CC0 Brown Mud maps at 1.3 m and the Kloofendal clear pure-sky
HDRI. The visible HDRI and environment must agree with an aligned solar light;
extract the photographed solar core before adding the directional source.
Cycles must compute direct shadows and indirect light. Save the lighting,
renderer/device, dimensions, sample limit and actual per-view times.

Deliver a full-layout overview and two poses per species, review the resulting
images, and retain the editable scene and all evidence in
`tests/artifacts/screens/ai584_vegetation_cycles/`. Final images default to
2560×1440 and 128 adaptive samples with denoising. These are offline artwork
reviews, not gameplay performance or bake-parity certifications.

The first species view includes all three variants. The three-quarter view
isolates mature_01 and fits its entire source bounds within a six-percent camera
margin. Timeline camera markers must not override the requested render camera;
distinct poses must produce distinct PNGs. Provide a local HTML gallery.

## Warm bark and close-ups (AI585)

Version 2 of the scene applies darker, warmer brown bark material tints to all
15 models. Preserve original bark texture/vertex-color variation, roughness,
normal maps and woody geometry. Keep the sun, environment, exposure and foliage
fixed so the appearance change comes from the bark itself. Record the revision
and linear RGB tint for each model; this review job does not publish altered
source-library assets.

Retain the eleven original compositions and add two close-ups per species:
an authored trunk/branch junction (lower stems for viburnum) and basal root/soil
contact. The 21-view set must include ten explicitly labeled close-ups, using
the same lighting and 72 mm detail cameras. Review all images and retain the
packed scene, PNGs and gallery under `tests/artifacts/screens/ai585_warm_bark/`.
Existing version 1 scenes remain valid for rendering their eleven saved views.
