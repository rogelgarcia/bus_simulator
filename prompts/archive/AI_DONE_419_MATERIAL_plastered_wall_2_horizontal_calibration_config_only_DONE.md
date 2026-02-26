# DONE

## Completed Changes
- Added calibration-only catalog entry `pbr.plastered_wall_02_horizontal` with label `Plastered wall 2 horizontal`.
- Implemented the new entry as a logical variant that reuses `plastered_wall_02` maps via relative `mapFiles` paths.
- Added `calibration.uvRotationDegrees` metadata and set it to `90` for the horizontal variant.
- Applied UV rotation in Material Calibration scene from catalog calibration metadata (configuration-driven, no hardcoded variant behavior).
- Kept the original `pbr.plastered_wall_02` material unchanged.
- Updated materials specs to document calibration metadata and calibration-only catalog variant rules.
- Added node unit coverage for the new calibration variant visibility, metadata, and map reuse behavior.
