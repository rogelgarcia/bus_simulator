# Native shadow parity

Run `node tools/bake_lighting/shadows/parity/run.mjs`. This validates the composed
native foliage field against its live reference and records authenticated evidence.
Production packing requires this proof for mipmapped/anisotropic foliage. It does
not replace the separate release certification. See the [shadow parent](../README.md).
