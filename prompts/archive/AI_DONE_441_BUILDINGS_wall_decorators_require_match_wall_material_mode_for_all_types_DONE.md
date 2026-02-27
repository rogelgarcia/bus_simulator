# DONE

## Completed Summary
- Standardized wall-decorator defaults so every decorator type now initializes with `materialSelection = match_wall`.
- Kept `Match wall` resolution centralized and deterministic in shared sanitizer/model + debugger material application path for all decorator types.
- Added catalog/unit coverage to assert every wall decorator type preserves `match_wall` as a first-class default material mode.
- Added core coverage to validate per-type runtime preview behavior for `match_wall` (textured wall source and `None` fallback) without type-specific regressions.
- Updated debugger spec to require `match_wall` consistency across all wall decorator types.

# Problem

Wall decorator material behavior is inconsistent across decorator types. The `Match wall` material mode must be available and reliable for all wall decorators.

# Request

Standardize wall decorator material controls so every wall decorator type supports `Match wall` as a first-class material option.

Tasks:
- Ensure all wall decorator types expose a `Match wall` material option in their material configuration flow.
- Make `Match wall` resolve against the active wall material source for each decorator instance.
- Ensure behavior is consistent in both wall decoration debugger preview and building/runtime application paths.
- Ensure switching between explicit decorator material and `Match wall` updates immediately and deterministically for every decorator type.
- Prevent decorator-type-specific regressions where `Match wall` is missing, ignored, or only partially applied.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_441_BUILDINGS_wall_decorators_require_match_wall_material_mode_for_all_types_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_441_BUILDINGS_wall_decorators_require_match_wall_material_mode_for_all_types_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change
