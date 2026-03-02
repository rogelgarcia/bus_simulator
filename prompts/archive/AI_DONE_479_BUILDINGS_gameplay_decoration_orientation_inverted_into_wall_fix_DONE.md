# DONE

- Synced gameplay wall-decoration transform basis/edge anchoring with BF2-style right-face corner metadata handling.
- Switched gameplay flat-cap-family decorators to BF2-style face pipeline with per-edge front extension/cap ownership, removing incorrect right-face continuation placement.
- Added mirrored-basis winding correction and front-surface outward enforcement so skirt/awning/angled front faces render outward in gameplay.
- Added a gameplay regression test validating outward normals/offset behavior for `simple_skirt`, `awning`, and `angled_support_profile`.
