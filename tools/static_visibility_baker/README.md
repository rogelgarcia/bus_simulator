# Static visibility baker

Builds the deterministic `bigcity2` static potential-visibility set used by gameplay. The bake includes only independently hideable building, traffic-light, traffic-sign, and tree roots. Roads, markings, curbs, sidewalks, slabs, and ground surfaces are deliberately excluded.

Run from the repository root:

```bash
node tools/static_visibility_baker/run.mjs
```

The tool starts the project static server, loads the production city, waits for asynchronous trees, runs the complete 3x3-offset, three-height, 12-direction baseline and added-pitch sweep at 384x216, expands masks across neighboring cells, and validates deterministic route poses at 1280x720. Validation misses are conservatively dilated before the final zero-miss audit.

Outputs:

- `src/app/city/visibility/bakes/bigcity2.v1.json` — tracked runtime payload.
- `tests/artifacts/static_visibility_bake/report.json` — local detailed bake/validation report.

Useful options:

```bash
node tools/static_visibility_baker/run.mjs --validation-views 1000
node tools/static_visibility_baker/run.mjs --url http://127.0.0.1:4173
node tools/static_visibility_baker/run.mjs --output path/to/payload.json --report path/to/report.json
```

After a production bake, run the real gameplay renderer/shadow A/B:

```bash
node tools/static_visibility_baker/validate_runtime.mjs
```

This freezes deterministic gameplay poses, measures warmed PVS-off/on full-pipeline frames, and requires pixel-identical direct color/shadow results across single/cascade shadows, two sun elevations, multiple azimuths, and three city regions. Its detailed output is `tests/artifacts/static_visibility_runtime/report.json`.

The non-default road-density sensitivity follow-up is separate:

```bash
node tools/static_visibility_baker/road_sensitivity.mjs
```

It constructs actual-material merged and 1/2/4/5-cell chunk variants at the current density and with exactly ten planar sub-triangles per source triangle, then measures full-pipeline frustum-only A/Bs. It does not authorize road PVS use; the report explicitly separates measured chunk overhead from the earlier modeled occlusion opportunity.

To attribute full-pipeline draw calls and triangles across a 5×5 city-region grid:

```bash
node tools/static_visibility_baker/profile_regions.mjs
```

The profiler samples the road cell nearest each region center in all four cardinal directions, compares static visibility off/on, and reconciles every attributed draw against the renderer counters. It writes JSON and Markdown reports under `tests/artifacts/static_visibility_regions/`.

For a blank workload assessment with static visibility continuously enabled, without an off/on comparison:

```bash
node tools/static_visibility_baker/profile_regions.mjs --on-only
```

This writes absolute category, render-pass, direction, per-region ownership, synchronized CPU+GPU frame timing, and traffic-control material-group consolidation statistics under `tests/artifacts/visibility_on_regions/`.

Do not hand-edit the payload. Any city-map, building, traffic-control, tree-placement, generator, geometry-revision, or bake-profile change alters the canonical city hash and makes the old payload fail open at runtime.
