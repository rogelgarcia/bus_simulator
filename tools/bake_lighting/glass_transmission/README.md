# Static glass transmission

Run `node tools/bake.mjs --target lighting/illumination/glass-transmission`.
The existing framework configuration, lock, source hashes and result receipts are
used. This explicit CPU analytic leaf does not need Blender and cannot publish
production city assets. Optional `input` is a complete profile JSON; `output`
must stay under `tests/artifacts/screens/`.

The exporter accepts only parallel zero-thickness rectangular sheets, one fixed
directional sun and a horizontal static receiver. It rejects other transport
models. Exact ray/rectangle intersections evaluate tinted transmission and Schlick
Fresnel, with 2x2 spatial integration per texel. Stored linear RGB is a light-only
direct transmittance, independent of receiver albedo, tone mapping and exposure.
It multiplies the existing sun term once, rather than adding a second light.
Parallel thin panes cannot focus light: caustics are explicitly unsupported.

The entire geometry/material/sun profile is authenticated at runtime. Changes
disable the bake and restore ordinary opaque pane shadows. Moving shadows retain
their live visibility term. This bounded fixture does not certify the existing
Cycles city exporter, whose general glass transport remains unsupported.
