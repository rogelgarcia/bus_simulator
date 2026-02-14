# DONE

#Problem

The Inspector Room viewport debug aids are not behaving as intended:
- The XYZ axis lines in the viewport are not clearly scaled to real-world units (should represent 1 meter per unit).
- The XYZ “legend” should only indicate axis colors/labels (XYZ with correct colors), not draw additional axis lines.
- The +/- axis labels (±X, ±Y, ±Z) should appear at the ends of the axis lines in the viewport.
- The plane material toggle appears broken (the gray plane mesh is not visible).
- The viewport lacks a neutral gray background, making it harder to judge materials and form (typical 3D software uses a gray background).
- There is no object-size measurement overlay; users need an option to display real-world dimensions aligned to the object’s edges.
- For texture previews, we only need ZX size measurements (not full XYZ).

# Request

Improve the Inspector Room viewport overlays and UI to provide correct real-world-scaled axes, a neutral background, a working plane toggle, and an optional measurement overlay (with special behavior for textures).

Tasks:
- Axis lines (viewport):
  - Ensure the drawn XYZ axis lines represent 1 meter per unit (scale and labeling consistent with the scene’s units).
  - Draw axes as lines only once (no duplicate axes from the legend).
  - Add ±X/±Y/±Z labels at the ends of the axis lines in the viewport.
- Legend panel:
  - Change the XYZ legend so it does not draw axis lines; it only shows “X”, “Y”, “Z” with correct colors as a color reference.
  - Ensure legend stays readable and does not overlap other UI.
- Plane toggle:
  - Fix the plane material/visibility toggle so the gray plane mesh is visible when enabled and hidden when disabled.
  - Ensure the plane renders reliably (depth/opacity, render order) without interfering with object inspection.
- Viewport background:
  - Set a neutral gray background color for the Inspector Room scene (similar to standard 3D DCC tools).
  - Ensure this does not leak into other scenes or global renderer defaults unintentionally.
- Measurement overlay:
  - Add an option in the middle legend panel to toggle object size measurements.
  - When enabled, draw measurement lines (in white) for height, depth, and length with real-world numeric labels:
    - Lines must sit on the edges of the object’s bounds (not through the center).
    - Labels should show units (meters) and be stable/readable.
  - For texture inspection mode, only show ZX measurements (width/depth), not full XYZ.
  - Defaults off; must not clutter the viewport unless enabled.

Verification:
- Inspector Room loads with no console errors.
- Axis lines are 1m-scaled; legend shows only colored XYZ labels.
- ± axis labels appear at line endpoints.
- Plane toggle makes the gray plane appear/disappear correctly.
- Gray background is visible and consistent.
- Measurement overlay toggle works; lines/labels match real-world dimensions and are placed at object edges; texture mode shows only ZX.
- Browser tests still pass (`tests/core.test.js`), and add a minimal pure-logic test for measurement label/value calculation if appropriate.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_129_TOOLS_inspector_room_viewport_axes_plane_background_and_measurements_overlay`
- Provide a summary of the changes made in the AI document (very high level, one liner)

# Summary
Updated the Inspector Room viewport with a neutral gray background, a corrected axes legend + endpoint labels, a visible toggleable plane, and an optional measurement overlay (ZX-only for textures) backed by a small pure-logic test.
