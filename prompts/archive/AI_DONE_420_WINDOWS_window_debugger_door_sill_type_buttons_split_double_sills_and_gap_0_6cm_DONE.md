# DONE

## Completed Changes
- Replaced sill type select control with button choices in Window Debugger and labeled the sill group row as `Set Type`.
- Adjusted `bottom_cover` sill placement so it anchors at opening bottom and rises into the opening area.
- Added double-door sill splitting so sill decorations render as two leaf-aligned pieces in door `double` style.
- Wired split sill spacing to the same center-gap rule used by door geometry.
- Updated the canonical double-door center gap to `0.6cm` (`0.006m`) in window mesh geometry.
- Ensured switching door style `single <-> double` updates sill instance count/placement deterministically.
- Preserved non-door sill behavior (split logic only applies in door-like open-bottom double style).
- Updated `specs/windows/WINDOWS_FEATURE_PARAMETERS_SPEC.md` for door gap, bottom-cover placement behavior, and split sill behavior.
- Added regression coverage in `tests/core.test.js` for the `0.6cm` gap constant and double-door sill split/rejoin behavior.
