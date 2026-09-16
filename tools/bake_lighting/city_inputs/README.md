# Reusable city inputs (AI 574 Step 3)

Run through the canonical framework:

```sh
node tools/bake.mjs --target lighting/city-inputs
node tools/bake.mjs --target lighting/city-inputs --publish
```

The explicit leaf uses `browserExecutable` from the shared ignored
`tools/baking/blender.local.json`. It needs no Blender process, ray tracing or
rebake of illumination. It remains outside the default full lighting tree.

1. Open a fresh isolated game with an injected recorder and runtime computation.
   Wait for the complete installed baked view and its existing compatibility checks.
2. Capture the live slab footprints/sidewalk boundaries and float32 receiver
   corners plus material/eligibility groups. Recompute every plan independently
   in Node and require exact agreement with the browser calculation.
3. Write a content-addressed candidate, authenticated against the installed
   planner modules and their algorithm dependencies.
4. Open another fresh game with the candidate routed locally. Require complete
   cache hits, identical live source hashes, and identical final city geometry
   attributes, indices, groups, draw ranges and transforms.
5. Only with `--publish`, atomically install the content-addressed payload under
   `src/app/city/precomputed/bakes/`, then switch its index last. Failed runs leave
   the installed index unchanged. Old payloads remain valid rollback inputs.

The gzip-compressed runtime plans and index are repository assets. Compressed
payloads are capped at 4 MiB and bounded decompression at 16 MiB. Capture inputs, reports,
screenshots and framework receipts stay in the ignored framework run directory
under `tests/artifacts/screens/ai556_bake_framework/`. AI 574 timing and validation
evidence stays under `tests/artifacts/screens/ai574_baked_startup/`.

The runtime checks actual planner code and actual call inputs, not city names or
exporter freshness assertions. Coplanar keys bind triangle order, all float32
positions and eligible material groups. Changed source geometry or mapping
eligibility misses the cache. Missing, corrupt or stale acceleration data retains
the original computation, exposes diagnostics and warns on rejected data.
Plans are cloned before consumers use them. A cached plan neither skips texture
readback/source validation nor authorizes lighting installation. Attribute
reconstruction and the final shader/resource/presentation gates remain unchanged.

New imports in an algorithm must join `CITY_INPUT_ALGORITHMS`; the dependency
closure regression test rejects omitted planner dependencies. The installed
catalog must then be rebuilt. No heuristic version tag substitutes for code hashes.
