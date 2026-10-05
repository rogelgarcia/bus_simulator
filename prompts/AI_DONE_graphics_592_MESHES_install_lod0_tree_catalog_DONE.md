# Problem

The accepted 15-model core-canopy LOD0 set remains in review artifacts and the existing catalog loader expects opaque detailed leaves.

# Request

- Install the accepted LOD0 geometry and PBR in shared assets through an explicit validated bake publication leaf.
- Register all five species and three mature forms in the game catalog without replacing existing placed city trees.
- Support compressed textures, double-sided alpha cards, shared canopy resources and sun transmission; verify actual browser loading and rendering.
- Preserve reference/review files and existing publication gates; document suitability and limits.
- Commit the integration, rebase onto main, and update local main.

## Completion

- Installed 15 accepted GLBs and 60 shared/per-variant KTX2 PBR maps under
  `assets/public/vegetation_lod0/` using the registered authenticated publisher.
- Added five opt-in LOD0 collections, renderer-scoped compressed texture loading,
  double-sided alpha cards and a shadow-aware direct leaf transmission hook.
- Preserved all reference and review files, old catalog IDs and city placements.
- Verified all geometry accessor bytes against the accepted review, actual counts
  (50,000 foliage / 47,548 wood), compressed textures and per-variant bark maps.
- Six browser tests passed, loading all 15 forms and testing backlighting/both
  faces/occlusion. Three asset tests and four catalog tests passed. Captures are
  under `tests/artifacts/screens/ai592_lod0_catalog/`.
- Fixed Inspector-only self-shadow bands with a small light bias; retained normal
  environment lighting in the final captures. See the catalog review spec.

Assets remain in the repository's shared, gitignored asset directory; the
integration, publication recipe, decoder and tests are tracked. This remains an
opt-in LOD0 library without wind, lower LODs or automatic city replacement.
Direct leaf transmission is an approximation; cards retain the accepted
front/back color and grazing-angle limits. All-species block texture residency
is approximately 480 MiB, so city-scale streaming/performance remains separate
work. The complete contract is in `specs/graphics/vegetation_lod0_catalog.md`.
