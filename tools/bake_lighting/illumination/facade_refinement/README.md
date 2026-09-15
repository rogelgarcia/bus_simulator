# Selective facade illumination density

`lighting/illumination/facade-plan` reuses an authenticated source and unwrap,
then runs the production atlas builder without rendering or installing assets.
Provide `input` (completed bake directory), `layout` (original receiver-layout.json)
and a new `output` under tests/artifacts/screens using the shared bake CLI.
Its plan records complete coverage, exact page allocation and the 1 GiB budget.
A rejected plan remains evidence; no surface is dropped to meet the budget.

The production preparation accepts `--set lighting/illumination:facade-detail=8cm`.
The default is `off`. Versioned policy `opaque-building-walls-8cm-v1` applies
8.25cm texels in both axes to tagged opaque, rough, nonmetallic building wall materials whose
geometric faces are near vertical. Glass/interior shader tags are excluded.
All other surfaces retain their base density. Selection is independent of cameras,
colors and building IDs. Existing minimum samples, padding, full-scene transport,
seams, mipmaps, encoding, complete coverage and publication gates remain in force.
