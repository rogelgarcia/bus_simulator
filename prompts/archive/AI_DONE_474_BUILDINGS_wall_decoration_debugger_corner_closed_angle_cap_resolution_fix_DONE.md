# DONE

- Updated third-wall corner expansion to resolve source specs from closed-angle wall-end context before cloning, instead of using static assumptions.
- Added front-face corner adaptation for closed angles by extending start-side main width, adding start bridge on top/bottom caps, and removing front side-cap closures at the joined corner.
- Refined third-wall corner side-cap filtering to drop only corner-start side caps while keeping far-edge side caps for proper closure and no gaps.
- Aligned third-wall wall footprint depth to wall width for non-fixed closed-angle coverage and stabilized face-mode U remapping to wall span.
- Added/updated core regression tests for third-wall face cloning, closed-angle cap bridge resolution, and per-edge side-cap behavior to protect open-angle behavior from regressions.
