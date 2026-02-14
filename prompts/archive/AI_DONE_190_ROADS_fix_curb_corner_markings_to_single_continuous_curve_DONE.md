DONE
#Problem

The white curved curb markings (painted on the asphalt near curbs) break into multiple sliced segments at corners, instead of reading as a single coherent curved line. This is most visible on tight sidewalk corners where the arc should be smooth and continuous. See `downloads/sidewalkproblem.png` for reference.

# Request

Change the curb-corner marking rendering strategy so the white curb curve is generated as a single continuous curved line that follows the curb, rather than multiple sections that can break/slice.

Tasks:
- Identify where the curb-corner white curved markings are generated (geometry/decals/marking builder) and why they split into segments (piece boundaries, per-edge emission, join logic, UV seams, etc.).
- Replace the corner-curve generation with a continuous-curve approach:
  - Build one polyline/spline per curb corner that follows the curb edge through the corner (including fillet/arc segments).
  - Resample the curve at stable arc-length spacing so tessellation is smooth and deterministic.
  - Emit the marking as a single strip/mesh (or a single decal) with proper joins/caps so it does not appear sliced.
- Ensure the approach is robust:
  - Works for different corner radii and curb widths.
  - Avoids z-fighting (consistent marking Y offset).
  - Avoids gaps at joins between straight curb sections and the corner arc.
  - Preserves consistent thickness across the curve.
- Keep performance reasonable (avoid excessive segment counts; cap subdivisions based on curvature/length).
- Verify in at least a few intersections/corners where the issue is visible and confirm the marking is a single smooth curve.

Nice to have:
- Add a debug visualization toggle (dev-only) to show the generated curb-corner curve polyline and sampling points to quickly diagnose issues.
- Add a small regression screenshot capture (manual or automated) in a deterministic debug scene to ensure corners remain continuous after future road/sidewalk changes.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_190_ROADS_fix_curb_corner_markings_to_single_continuous_curve_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Updated marking mesh generation to build continuous thick polylines (miter-joined strip) from connected line segments so curb-edge curves render as one smooth line.
- Updated baked markings texture drawing to connect adjacent segments into continuous canvas paths (closing loops) to avoid “sliced” corner artifacts.
