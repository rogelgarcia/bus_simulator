# Canopy layer study

Interactive LOD0 planning for the fifteen reviewed enhanced references. This tool
does not generate LOD geometry or change reference assets. The source collection
is pinned by `sources.json`; each source must pass its existing saved-model audit
and SHA-256 identity checks.

Use the shared bake configuration and a new ignored output directory:

```sh
node tools/bake.mjs --target vegetation/layer-study
node tools/bake.mjs --target vegetation/layer-study --set vegetation/layer-study:phase=page
```

`render` uses isolated sequential Eevee jobs, two CPU threads, 896px frames and
16 samples. Four cardinal orthographic views share one calibrated span per model.
An optional `models=species/mature_01` selection supports a proof run. Run `all`
before delivering the collection. Completed model records can resume only when
source identities and rendering settings match. Source inputs are reauthenticated
after execution. PNG hashes, PNG sizes and leaf sample hashes gate the page.
`--publish` is rejected. No models or images are committed.

`page` checks existing frames and refreshes the editor without rerendering.
Serve the repository normally and open the output `index.html`. No server-side
writes are used; drafts are saved to browser localStorage under the study identity.

The user moves one common XYZ center per model and edits three increasing
ellipsoid radii. Controls show full diameters in metres. Front/back drag X/Z;
right/left drag Y/Z. Overlays are projected bands, not visible leaf segmentation.
Leaf allocations use three-dimensional center containment and expose unassigned
outside leaves. Linden centers are estimated from the saved instance transform;
other species use saved blade centers. These are counts, not triangle estimates.

Copy or download `vegetation-canopy-layers` version 1 JSON. Import requires all
models and matching source hashes/revisions. Leaf/card/triangle strategies stay
null until the next study. See `specs/graphics/vegetation_canopy_layers.md`.
