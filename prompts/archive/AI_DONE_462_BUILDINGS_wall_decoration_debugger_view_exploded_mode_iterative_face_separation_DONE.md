# DONE

# Problem

Wall Decoration Debugger needs an inspection mode to separate nearby faces so overlapping/near-coplanar geometry can be diagnosed clearly.

# Request

Add an `Exploded` view mode to Wall Decoration Debugger that iteratively separates nearby faces, colors them distinctly, and hides the wall while active.

Tasks:
- In wall decoration debugger View options, add a toggle: `Exploded`.
- When `Exploded` is enabled:
  - Hide the wall mesh.
  - Assign a different debug color to each face.
  - Detect faces that are closer than `0.5cm` (`0.005m`) to other faces.
  - Iteratively move close faces away from each other until no face pair remains within the threshold.
- Explosion movement direction:
  - Use deterministic, sensible separation directions (for example face normal and/or pairwise separation vector logic) so movement is stable and interpretable.
- Safety/stability:
  - Prevent infinite loops with clear termination guards (max iterations and/or epsilon convergence checks).
  - Ensure the algorithm always terminates even in dense/degenerate geometry cases.
- When `Exploded` is disabled:
  - Restore normal rendering, original face materials/colors, and wall visibility.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_462_BUILDINGS_wall_decoration_debugger_view_exploded_mode_iterative_face_separation_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_462_BUILDINGS_wall_decoration_debugger_view_exploded_mode_iterative_face_separation_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Summary
- Added an `Exploded` toggle to Wall Decoration Debugger view controls and wired it to runtime behavior.
- Implemented exploded mode lifecycle: hide wall while active, hide normal decorator meshes, and restore normal visibility/material flow when disabled.
- Added per-face exploded debug rendering with deterministic distinct colors for each face.
- Implemented iterative close-face separation using a 0.005m threshold with deterministic movement directions and pairwise displacement logic.
- Added clear termination guards for separation (`max iterations` + movement epsilon) to guarantee stability and prevent infinite loops.
- Kept explosion and wireframe modes interoperable by synchronizing wireframe state across exploded face meshes as well.
