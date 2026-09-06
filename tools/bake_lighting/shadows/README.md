# shadows bake entry

Run `node tools/bake_lighting/shadows/run.mjs` from the repository, or invoke its
absolute path from another working directory. Shared setup, prerequisites, options
and output policies are documented in the [lighting README](../README.md).
Use `--help` or `--dry-run` to inspect the selected job and dependencies.

The order is source export, candidate lattices, native Depth24 foliage capture,
provisional composition, native parity proof, then production packing. Every
phase has a separately callable script in its subfolder. A common `--profile`
selects the same profile throughout these prerequisites. The default processes
all eight certified sun profiles sequentially. A failed proof stops packaging;
the live shadow index and separate release certification remain intact.
