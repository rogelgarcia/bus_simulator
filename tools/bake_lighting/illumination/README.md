# illumination bake entry

Run `node tools/bake_lighting/illumination/run.mjs` from the repository, or invoke its
absolute path from another working directory. Shared setup, prerequisites, options
and output policies are documented in the [lighting README](../README.md).
Use `--help` or `--dry-run` to inspect the selected job and dependencies.

For finer full-city indirect maps, use the registered root entry with
`--target lighting/illumination --samples 512 --device OPTIX
--set lighting/illumination:texel-size=0.33
--set lighting/shadows:profile=ai527.sun.az045.el55`.
Supported densities are 50 cm (default), 33 cm and 25 cm. The atlas must still
fit complete coverage and existing allocation limits; BigCity2's 25 cm layout
requires fourteen pages and is rejected before baking. Validate the candidate
through the reference-matching actual-game/native checks before installing.
