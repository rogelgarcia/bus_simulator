# DONE

- Added a new BF2 View toggle `Exploded decorations` with full UI/View state wiring and non-persistent reset on BF2 enter.
- Extracted wall-decoration exploded-face generation/separation into shared helper `WallDecoratorExplodedView.js`.
- Refactored Wall Decoration Mesh Debugger exploded mode to reuse the shared exploded helper logic.
- Implemented BF2 exploded-decoration rendering mode that hides building/window meshes, shows exploded decoration faces, and restores normal visibility when disabled.
- Updated Building v2 UI/engine specs to document BF2 exploded decorations behavior.
