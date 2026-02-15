# Problem (DONE)
Window fabrication data created in the BF2 window fabrication popup is not being used by BF2 window instances. BF2 falls back to legacy BF1 window assets and defaults, even when a user creates/edits a window in BF2.

# Request
Ensure BF2 uses only windows authored in the BF2 window fabrication flow for newly inserted windows, including all appearance and geometry data, so BF2 defaults and legacy BF1 window fallbacks are no longer applied.

Tasks:
- Sync all user-chosen window fabrication popup outputs (thumbnail, mesh, and all supported options) into the BF2 window representation used by placement/editing.
- Ensure newly inserted BF2 windows and the BF2 edit popup source display and retain exactly the created window data, including materials/options metadata, instead of substituting BF1 defaults.
- Remove BF2 fallback behavior that auto-selects legacy BF1 window variants when fabrication data is available.
- Make BF2 treat BF1 windows as unavailable for BF2 window insertion when a BF2-fabricated window exists and should be authoritative.
- Validate that the BF2 create/edit window flow consistently uses a single source of truth for window data end-to-end (popup config -> internal model -> thumbnail + mesh render).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
