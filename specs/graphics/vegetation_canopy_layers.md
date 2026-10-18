# Enhanced reference canopy layer study

The LOD0 planning page covers all five reviewed species and three mature forms
per species. It uses the exact saved enhanced reference models, not previous
runtime LOD0 geometry. Four orthographic sides must share calibrated framing and
respond together to configuration changes. Rendering uses Eevee.

Each model owns a common center and three concentric axis-aligned ellipsoids.
These rounded canopy volumes are complete ellipsoids, including their underside,
not clipped hemispheres. Each boundary has independent X/Y/Z radii. Inner < middle
< outer on every axis, separated by at least 1 cm; the editor must preserve this nesting invariant. UI sizes
are full width/depth/height in metres. The white center handle can be dragged in
every view, and numeric XYZ edits are available. Controls are model-specific.

Presets are derived from the saved leaf centers: 0.5%/99.5% coordinate bounds,
expanded to contain about 99% of radial samples, with initial boundary scales
0.46, 0.73 and 1.0. These are editable planning suggestions, not accepted LOD rules.

For point p, center c and boundary radii r, containment means
`sum(((p[i] - c[i]) / r[i]) ** 2) <= 1`. Assignment is the first containing layer:
inner volume; middle minus inner; outer minus middle. Outside points are explicitly
unassigned. All coordinates are model-local metres with Z up and root at origin.
Leaf-center allocation is an estimate; it does not split leaf geometry or branchlets.
The four views display semi-transparent projected shell bands and outlines. This
projection is a placement guide, not a pixel-accurate membership mask.

JSON exchange format:

```json
{
  "format": "vegetation-canopy-layers",
  "version": 1,
  "units": "metres",
  "coordinateSystem": "model-local-z-up",
  "shape": "concentric-axis-aligned-ellipsoids",
  "assignment": "first-containing-layer-by-blade-center; outside is unassigned",
  "models": [{
    "id": "species/mature_01",
    "source": {"summary": "relative/path/summary.json", "file": "relative/path/enhanced.blend", "sha256": "source identity", "revision": "saved revision"},
    "reviewed": false,
    "center": [0, 0, 8],
    "layers": [
      {"id": "inner", "radii": [2, 2, 2], "strategy": null},
      {"id": "middle", "radii": [4, 4, 4], "strategy": null},
      {"id": "outer", "radii": [6, 6, 6], "strategy": null}
    ]
  }]
}
```

Exports include every model. Import validates finite coordinates, positive nested
radii, model uniqueness and exact source hashes/revisions before changing drafts.
Drafts persist locally by study identity. Reset affects only the active model;
undo restores recent edits. No gameplay assets or accepted references are mutated.
Card/leaf strategies and triangle budgets are intentionally unset for a later pass.

Offline preparation is registered as `vegetation/layer-study` in the shared bake
hierarchy. It preserves source inputs, validates existing geometry provenance,
hashes renders and samples, and writes only to separate ignored study staging.
