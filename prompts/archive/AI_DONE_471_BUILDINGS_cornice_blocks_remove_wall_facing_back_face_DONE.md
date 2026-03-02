# DONE

- Removed wall-facing back-face triangles from cornice block geometry generation so hidden flush-to-wall faces are no longer rendered.
- Kept cornice block visible faces, silhouette, and front-bottom angle behavior unchanged.
- Applied the same back-face removal logic in shared and debugger-local cornice block geometry builders for consistent behavior in debugger/BF2 geometry paths.
- Added core test assertions validating that both flat and angled cornice block meshes have zero wall-facing back triangles.
