# Calibrate virtual receivers

`node tools/bake_lighting/diffuse_probes/validate/run.mjs` uses the shared Blender
configuration to verify virtual receiver visibility, diffuse irradiance units and
packed-image persistence in a small constant-light scene. Preparation depends on
this check, so invalid backend behavior cannot publish a city field.
