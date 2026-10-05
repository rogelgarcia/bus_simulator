# American elm: tall trunk and full elevated canopy

AI583 adds *Ulmus americana* to the isolated original vegetation library as
`american-elm-v1`. Three mature structural forms share one implementation and
appear in `mesh_collection.american_elm` as `mature_01` through `mature_03`.

## Morphology

The recipe emphasizes a high clear trunk and substantial elevated crown volume.
Scaffolds rise steeply before arching outward. Mature forms vary stem diameter,
height, crown spread, main forks and secondary branching, with independent seeds.
The forms are broad-vase, wide-umbrella and tall-asymmetric crowns.

Wood uses the existing fused-volume authoring, smooth continuous junctions,
asymmetric basal flares and geometric bark relief. New gray-brown interlacing
ridged bark is procedural; no species-specific scan is claimed. Small elm leaves
have an offset ovate base, tapered apex, primary/secondary marginal teeth,
curved closed upper/lower surfaces and short modeled petioles. Leaf width is
6.2–8.3 cm before template asymmetry; blade length varies around 1.85× width.
Upper/lower tissue colors and roughness differ. No alpha plates are generated.

References guide morphology only; no photographs or third-party meshes are
asset inputs:

- [NC State: American elm](https://plants.ces.ncsu.edu/plants/ulmus-americana/)
- [Morton Arboretum: elm collection](https://mortonarb.org/explore/activities/explore-grounds/elm-collection/)
- [Burke Herbarium: Ulmus americana](https://burkeherbarium.org/imagecollection/taxon.php?Taxon=Ulmus+americana)

## Authoring and isolation

Use `node tools/bake.mjs --target vegetation/prototype-elm` for a staged first
form and `node tools/bake.mjs --target vegetation/american-elm --publish` for the
three-form family. Both use the shared ignored Blender configuration and an
isolated headless process. The explicit original-wood contract is restricted to
American elm revision 1 when no accepted wood record exists. Existing species
retain mandatory accepted geometry/map fingerprints. All normal validation,
input authentication and rollback publication gates apply to the new family.

Outputs follow `assets/public/vegetation/american_elm/`: three GLBs, packed
editable authoring Blender scenes, eight-form leaf study GLB/Blender files,
2048px bark and 1024px opaque leaf tissue maps, manifest and provenance.
Two material draws per tree remain the contract. The failure ceiling is 46M
triangles for this dense small-leaved authoring source, not a performance target.
Optimization, alpha plates and gameplay migration remain separate work.

## Verification

Independent exported-leaf checks verify closed outward-wound volumes. Browser
checks cover all three imports, Inspector selection, shared materials/textures,
unit normals, continuous wood topology and fingerprint parity. Elm additionally
requires foliage above 7m, crown width/depth above 11m, crown height above 7m and
front-view crown occupancy of at least 64% within its convex hull. The wide form
measured 64.8%, narrowly below the initial 65% trial threshold. Visual review
retained its broader silhouette; the final 64% regression floor records that
decision without claiming a 65% minimum or changing existing species' floors. An independent
wood probe requires the first wood outside a 1.25m stem radius to occur above
6m, excluding the basal 1.5m. This measures trunk clearance conservatively;
it is not an exact botanical first-branch attachment height.

UHD 3840×2160 renders use the native showcase with HDRI background/environment:
three complete trees, a lineup, upper/lower canopy views and three specimen
views. Evidence belongs under `tests/artifacts/screens/ai583_american_elm/`.
Use `VEGETATION_ARTIFACT_TOPIC=ai583_american_elm` and species filters in the
shared capture/acceptance tests. Existing species manifests and payload hashes
are checked against the preceding-species snapshot.

## Published results — 2026-10-03

Published through the registered full-family job in
`tests/artifacts/screens/ai556_bake_framework/run-1791058292604-40612-ab66e3bc/summary.json`.
All three exported wood meshes are single closed connected components. Height,
canopy bounds and clearance below come from the imported geometry; crown
coverage uses the established 256px orthographic foliage-only probe.

| Form | Tree height (m) | Foliage begins (m) | Crown width × height × depth (m) | Crown coverage | Leaves | Triangles | GLB MiB |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| Mature 01 | 19.71 | 10.20 | 13.69 × 9.51 × 15.08 | 68.45% | 119,952 | 38,818,206 | 1,292.68 |
| Mature 02 | 18.01 | 9.05 | 15.48 × 8.95 × 15.51 | 64.78% | 127,008 | 41,023,406 | 1,366.09 |
| Mature 03 | 19.82 | 10.51 | 13.96 × 9.31 × 15.11 | 67.12% | 123,480 | 39,416,750 | 1,312.71 |

The first wood beyond the 1.25m trunk-clearance probe occurs at 10.09, 9.21 and
10.49m respectively. The initial sparse first-form prototype had 50,544 leaves
and 53.22% coverage; the final first form has 119,952 leaves and 68.45% coverage.
Leaf size was retained while branching and leaf-cluster counts increased.

These large source models prioritize individual modeled foliage. Their GLBs
total approximately 3.88 GiB. They are not performance-ready city instances;
no production frame-rate claim is made. Authoring releases unused Blender mesh
data between variants to avoid accumulating the preceding source geometries.

Final checks passed: five exported-leaf topology cases, three catalog cases,
two runtime/gameplay isolation cases, one actual Inspector case and one 4K
capture case. The four preceding manifests and all twelve GLB hashes match the
pre-addition snapshot. Hardware captures used Chrome/D3D11 on an RTX 3060, with
the established HDRI both visible and supplying environment lighting.

Evidence in `tests/artifacts/screens/ai583_american_elm/` includes:

- `inventory.json`, `preservation.json`, `validation/american-elm.json`.
- `final/capture_report.json` and nine 3840×2160 showcase images.
- `final/inspector/american_elm_mature_01.png` and its measurement JSON.
- Separate initial and denser prototype images/measurements, retained as iteration evidence.
