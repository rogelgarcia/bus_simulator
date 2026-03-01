# DONE

# Problem

BF2 face linking currently copies bay population in default order only. There is no per-face control to reverse bay assignment order when propagating to linked slave faces.

# Request

Add per-face reverse-order control to linking UI and use it when populating slave face bays.

Tasks:
- In face-linking UI, add a checkbox under each face button labeled/used for `Reverse`.
- Reverse is configured per face link target.
- When reverse mode is enabled for a slave face, populate bays in reverse sequence:
  - source/master order maps right-to-left on slave (instead of left-to-right).
- Clarify and enforce behavior:
  - reverse mode changes assignment order only,
  - bay geometry/content is not mirrored,
  - only placement order is reversed.
- Keep default behavior unchanged when reverse is not enabled.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_453_BUILDINGS_bf2_face_linking_reverse_order_checkbox_for_slave_bay_population_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_453_BUILDINGS_bf2_face_linking_reverse_order_checkbox_for_slave_bay_population_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Summary
- Added a per-face `Reverse` checkbox under each face in the BF2 face-link popup, wired to a dedicated reverse callback.
- Extended BF2 face-link state/config to persist `reverseByFace` per slave face while preserving default behavior when unset.
- Updated facade bay solve input selection so linked slave faces can consume master bay definitions in reversed assignment order without mirroring geometry/content.
- Added regression coverage for type normalization, UI reverse interaction, view persistence/reset behavior, and generator reverse-order helper behavior.
