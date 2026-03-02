# DONE

- Added dedicated cornice-rounded exploded-face radial separation logic and wired it into both wall decoration debugger and BF2 exploded rendering paths.
- Constrained iterative exploded overlap checks to same-source mesh pairs only, preventing cross-block triangle push interactions.
- Updated cornice-rounded geometry generation to remove wall-facing back-face triangles while keeping exposed silhouette and rounded profile behavior.
- Added/updated core tests to validate rounded wall-face removal and exploded-mode separation behavior for local-only and rounded-radial cases.
