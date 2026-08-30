# DONE — AI 528: Resolved-City Bake Export and Source Hash

Blender cannot be an authoritative bake compiler unless it receives the exact resolved gameplay city rather than an independently maintained approximation. The existing city-spec exporter does not include evaluated Three.js geometry, instance transforms, generated materials, alpha-cutout silhouettes, receiver/caster semantics, or the stable mapping needed to return baked data to runtime objects.

The export must also prove freshness. A payload generated for different geometry, placements, materials, light profiles, or bake settings must never activate, while unrelated unused catalog changes should not force a rebake.

# Request

Implement a deterministic resolved-city bake-input exporter and source-hash contract for the illumination framework defined by AI 527. This prompt owns extraction, canonical input packaging, stable identity/provenance, and source freshness only; it does not run Blender, bake lighting, define runtime binary transport, or change gameplay lighting.

## Execution gate

- Do not start until `AI_DONE_527_ATMOSPHERE_illumination_composition_architecture_and_baselines_DONE.md` exists.
- Use the coordinate, color, channel, profile, and identity contracts locked by AI 527.
- Reuse AI 520's canonicalization, validation, deterministic browser-baker, and fail-open lessons where suitable, but create a distinct illumination schema and hash domain. Never reuse the color PVS payload as lighting or shadow data.

Tasks:
- Add a dedicated tool folder under `tools/`, with its own README and `PROJECT_TOOLS.md` registration.
- Export the fully resolved gameplay scene after all synchronous and asynchronous city content required by the selected bake profile is ready.
- Prefer inspecting the evaluated runtime Three.js scene through the existing browser/Playwright pattern because Three.js is currently CDN-only. Do not add a duplicate Node-side Three dependency merely for convenience without documenting and approving that architectural change.
- Define and version a deterministic bake-input package. The baseline may use GLB for evaluated geometry plus a sorted-key canonical manifest, but lock the final choice only after round-trip fidelity and stable-byte behavior are tested.
- Include all declared static casters and receivers required by later channels: buildings, roofs, decorations, roads, curbs, sidewalks, terrain/ground, props, traffic controls, trees/foliage, and any opt-outs specified by AI 527.
- Expand or faithfully encode instancing and shared geometry while preserving stable per-instance identity, transforms, caster/receiver flags, material groups, and provenance.
- Assign stable, addressable IDs for city, chunks, objects, mesh instances, caster/receiver mappings, materials, alpha inputs, and lightmap mappings. IDs must survive identical rebuilds and must not depend on traversal timing, object UUIDs, or unordered asynchronous completion.
- Reuse AI 481's canonical-versus-derived and provenance principles without coupling the export to its live mesh-handoff format.
- Export evaluated geometry attributes required for parity, including positions, indices, normals, tangents when needed, UV sets, colors/custom bake attributes, winding, bounds, and transforms.
- Export material semantics relevant to baking rather than attempting to serialize arbitrary runtime shader code. At minimum capture opacity, alpha map identity/bytes or canonical source, alpha-test threshold, side/culling behavior, shadow eligibility, emissive/albedo information required by selected Cycles passes, and explicit unsupported cases.
- Include sun/light profiles and channel-specific bake settings by reference/hash, not as unversioned ambient state.
- Define separate canonical hash domains for:
  - resolved source freshness;
  - geometry buffers and transforms;
  - used material/alpha inputs;
  - each lighting profile and channel configuration;
  - compiler configuration references.
- Use collision-resistant SHA-256 for binary integrity and evaluate SHA-256 for canonical source identity. If a faster non-cryptographic hash remains in any lookup path, keep it secondary and document why it cannot authorize payload activation by itself.
- Ensure the live runtime can independently derive the same source-freshness identity from the resolved city without trusting the export's own assertion. Avoid hashing irrelevant unused catalog entries.
- Reject duplicate IDs, missing provenance, non-finite values, unsupported transforms, missing textures, ambiguous alpha semantics, incompatible attributes, and count/bounds mismatches with structured actionable errors.
- Write generated packages and reports to the repository-approved asset/artifact locations. Never consume `downloads/` directly at runtime and never place debug captures beside source.
- Add deterministic tests for canonical object-key ordering, stable inventories, async tree order, shared/instanced geometry, transform conversion, attribute bytes, alpha inputs, relevant/irrelevant invalidation, corrupt input, and repeated export.
- Add round-trip validation that reconstructs representative exported meshes and compares counts, bounds, transforms, normals, UVs, winding, IDs, and alpha silhouettes with the live source.
- Produce inventory and size reports by category and by channel relevance so later AIs can budget Blender memory and runtime payloads.

Acceptance requirements:
- Two clean exports of identical resolved inputs produce identical canonical manifests, inventories, source hashes, and stable geometry/package bytes wherever the selected container permits it.
- Every bake-relevant mutation changes the appropriate source/channel hash; irrelevant unused content does not.
- Blender can be given one self-describing package without opening or hand-editing a `.blend` file.
- The exporter makes no gameplay-rendering change and the game continues to run when the tool is never invoked.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it to `prompts/AI_DONE_528_TOOLS_resolved_city_bake_export_and_source_hash_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Add a concise completion summary linking the format specification, tool/README, tests, representative export, inventory, source-hash sensitivity table, and round-trip report.
- Report export time, package size, peak memory if measurable, object/mesh/instance/triangle/material/texture counts, and exact test conditions. Mark unavailable metrics as `not measured` with a reason.

## Completion summary

Implemented the deterministic `.bsib` resolved-city package, evaluated Three.js scene/material/texture extraction, stable identity and provenance, participant/receiver/caster mappings, per-domain and per-channel SHA-256 freshness, exact alpha-coverage channels, semantic package validation, direct resolved-source byte comparison, and two-clean-build determinism gate. The tool does not run Blender or change gameplay lighting.

- Contract: [resolved-city bake-input specification](../specs/graphics/illumination_bake_input.md)
- Tool: [illumination bake-input exporter README](../tools/illumination_bake_exporter/README.md)
- Tests: [canonical/package](../tests/node/unit/illumination_bake_source.test.js), [geometry](../tests/node/unit/illumination_bake_source_geometry.test.js), [freshness](../tests/node/unit/illumination_bake_freshness.test.js), [semantic round trip](../tests/node/unit/illumination_bake_source_validation.test.js), [material/alpha](../tests/node/unit/illumination_bake_material_texture.test.js), [custom shadow materials](../tests/node/unit/illumination_bake_custom_shadow_materials.test.js), and [browser geometry regression](../tests/headless/e2e/window_mesh_arched_door_composition.pwtest.js)
- Representative package: [representative_bigcity2.bsib](../tests/artifacts/illumination_528/packages/bigcity2/default/representative_bigcity2.bsib)
- Reports: [inventory](../tests/artifacts/illumination_528/reports/bigcity2/default/inventory.json), [category/channel sizes](../tests/artifacts/illumination_528/reports/bigcity2/default/size_by_category_and_channel.json), [source-hash sensitivity](../tests/artifacts/illumination_528/reports/bigcity2/default/source_hash_sensitivity.json), [round trip](../tests/artifacts/illumination_528/reports/bigcity2/default/round_trip.json), [validation](../tests/artifacts/illumination_528/reports/bigcity2/default/validation.json), [export metrics](../tests/artifacts/illumination_528/reports/bigcity2/default/export_metrics.json), and [determinism](../tests/artifacts/illumination_528/reports/bigcity2/default/determinism.json)

Representative result: BigCity2/default, 357,903,762 bytes, package digest `9957c6fdf3b30648d8a0bed56dc8a45ad62adb723e189a4959edb068904444ea`. The two clean export passes took 66,256.8 ms and 72,966.4 ms and produced identical manifests, inventories, source identities, and complete package bytes. Peak memory was `not measured` because Chromium does not expose a reliable per-export peak; the post-export heap sample was 2,305,291,495 bytes.

Inventory: 237 roots; 2,663 mesh objects, including 381 instanced objects; 25,369 mesh instances; 1,843 geometries; 2,275,142 expanded triangles; 414 materials; 78 texture sources and 793 bindings; 2 exact coverage buffers (4,259,840 bytes); 25,558 participant, 6,730 receiver, and 6,043 caster mappings.

Exact run conditions: Chrome 151.0.7922.176, headless 1280×720, gameplay pose `civic_center_curve_front`, one active configuration reference, zero exports from the already-running city, and two independently constructed fully prewarmed production cities. Direct parsed-package/source manifest and logical-buffer comparison passed; an independent on-disk semantic read also passed.

Verification: 36/36 focused AI 528 Node tests passed; 5/5 focused browser tests passed; all 34 changed/new JavaScript modules passed `node --check`; `git diff --check` passed. The full Node suite ran 568 tests: 558 passed, 3 skipped, and 7 unrelated existing workspace tests failed (asset policy, facade fallback, Grass V2 metadata/asset, markings debugger shortcut, texture-correction profile, and wall-decorator profile). No AI 528 test failed.
