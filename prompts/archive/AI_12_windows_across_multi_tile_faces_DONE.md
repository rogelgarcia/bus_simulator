#Problem [DONE]

For multi-tile buildings, window placement appears to be computed per tile.
This causes gaps at tile seams where windows reset rather than using the full
continuous building face.

# Request

Compute window placement across the full continuous face of multi-tile
buildings so windows are laid out as if the face is a single span.

Tasks:
- When a building spans multiple tiles, treat each exterior face (per building
  side) as one continuous span for window layout.
- Ensure window placement is not reset or recomputed separately per tile.
- Avoid gaps at tile junctions by distributing windows across the entire face
  length.
- Preserve the existing corner-avoidance and equidistant spacing behavior.
- Ensure behavior is unchanged for single-tile buildings.
- Validate the fix visually with at least one multi-tile building example.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Window layout now runs across merged continuous exterior wall spans (collinear edges merged) so multi-tile faces no longer reset window placement at seams.
