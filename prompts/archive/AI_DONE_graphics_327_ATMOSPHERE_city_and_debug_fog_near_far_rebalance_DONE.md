# DONE

#Problem

City gameplay and debug/fabrication views are using inconsistent fog distance ranges, which causes mismatched depth/haze perception between contexts.

# Request

Rebalance fog distances so city gameplay and debug-oriented scenes use the requested standardized near/far ranges.

Tasks:
- Set city fog distances to near `120` and far `1200`.
- Set debug screen fog distances to near `200` and far `2000` for debug views that actively use fog.
- Set building fabrication fog distances to near `200` and far `2000`.
- Ensure these fog distance targets apply consistently on scene enter/re-enter so values do not drift after mode switches.
- Keep fog color/atmosphere integration intact while applying the new distance ranges (no unintended color regressions).
- Add deterministic validation coverage for the expected fog near/far values in city and debug/fabrication contexts.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line.
- Rename the file in `prompts/` to `prompts/AI_DONE_graphics_327_ATMOSPHERE_city_and_debug_fog_near_far_rebalance_DONE.md`.
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change).

## Summary (DONE)
- Updated city fog defaults to near `120` and far `1200` so gameplay uses the new standardized atmosphere depth range.
- Updated debug contexts that actively use fog (`MapDebuggerState` via city config and `RapierDebuggerScene`) to near `200` and far `2000`.
- Updated building fabrication fog to near `200` and far `2000` while preserving atmosphere-driven fog color.
- Added deterministic tests that validate fog near/far values and re-enter/rebuild stability for city, map debugger, rapier debugger, and building fabrication scenes.
