# DONE

#Problem
In BF2, the window mesh layer arrangement (shade, glass, frame, interior) appears correct on face A, but on the opposite/reverse face (e.g., face C) the ordering/spacing is incorrect. This causes visible gaps and makes some panels appear out of order.

# Request
Make BF2 window mesh layers render in a consistent, correct order on all facade orientations (including reverse faces like C), with no gaps or incorrect layer stacking.

Tasks:
- Ensure shade, glass, interior, and frame layers are positioned/offset along the correct per-instance facing direction so their relative order is the same on all faces (A/B/C/D).
- Fix any reverse-face issues that cause gaps, z-fighting, or incorrect stacking when viewing the building from outside.
- Preserve face-relative inset behavior for all window layers so insetting does not separate layers inconsistently.
- Keep transparent material behavior stable (avoid cases where depth sorting makes glass/shade swap order depending on camera angle).
- Add/extend a regression test that places the same window definition on at least faces A and C and verifies layer ordering is correct (e.g., by comparing layer positions along the facade normal and/or verifying no unexpected occlusion gaps).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.

## Summary
- Fixed shade/glass/interior Z-layering to apply per-instance along the window’s local normal (so reverse faces like C no longer stack in world Z).
- Preserved face-relative `frame.inset` behavior while keeping layer ordering consistent across all facade yaws.
- Extended the existing headless BF2 window regression test to assert glass > shade > interior ordering on both faces A and C.
