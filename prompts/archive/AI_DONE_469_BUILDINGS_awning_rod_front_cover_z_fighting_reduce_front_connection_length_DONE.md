# DONE

- Trimmed awning support rod front endpoint by `0.005m` to avoid z-fighting with the front cover while preserving wall-side anchoring.
- Applied the rod-end trim logic centrally in awning rod spec generation so both side rods receive the same adjustment.
- Added a unit test that verifies both rods keep `rodStartOutsetMeters = 0` and use `rodEndOutsetMeters = projection - 0.005`.
