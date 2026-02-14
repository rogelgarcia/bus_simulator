# Problem [DONE]

In some situations, building windows are rendered outside the valid building
wall/building area. This happens when a window placement is computed even
though the window does not actually fit within the wall span it is meant to
occupy.

# Request

Fix building window placement so windows are only rendered when they fully fit
within the wall span they are placed on, and never appear outside the building
exterior.

Tasks:
- Ensure every rendered window is fully contained within its target wall span,
  respecting corner padding, offsets, spacing rules, and any column/spacer
  bands that affect available wall length.
- When a window (or its associated spacer/column element) does not fit on the
  wall, do not render it at all (no partial/overhanging windows).
- Keep window distribution consistent on valid walls (style, texture selection,
  spacing, per-floor behavior) and avoid changing appearance where windows
  already fit correctly.
- Ensure correctness for multi-tile faces, loops that start mid-edge, and
  complex footprints (including concave outlines where applicable).
- Add a browser-run regression test that reproduces the failure case and
  asserts that no window meshes are outside the building wall area.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added strict fit checks so windows and spacer columns are only rendered when fully contained within their wall span, plus a browser-run bounds regression test.
