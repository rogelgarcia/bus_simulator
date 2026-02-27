# DONE

# Problem

Tint controls are fragmented and inconsistent: BF2 and wall decoration currently use separate slider-based HSV/tint flows with no shared reusable picker component, and lightening behavior needs an explicit brightness control in the same model.

# Request

Create a shared tint picker component that encapsulates all tint parameters and can be reused anywhere, then wire it into BF2 and wall decoration only.

Tasks:
- Build a reusable shared picker UI/component (in shared GUI area) that includes all parameters in one workflow:
  - Hue selector (hue ring/wheel with SV triangle style interaction).
  - Saturation/value selection.
  - Brightness control (separate from HSV value, to support lightening).
  - Intensity control.
  - Thumbnail/preview swatch reflecting current output.
- Define a shared, reusable state contract for the picker values and conversions so all adopters use the same behavior (including normalized ranges, clamping rules, and conversion helpers).
- Keep compatibility with existing tint-hex usage, but persist the additional parameters needed so values round-trip correctly after reload and UI sync (do not infer intensity from near-white fallback only).
- Integrate the shared picker into:
  - Building Fabrication 2 wall material tint controls.
  - Wall Decoration Mesh Debugger material tint controls.
- Update BF2 and wall decoration state/schema normalization paths so brightness and intensity are serialized/deserialized safely with defaults and backward compatibility for existing saved configs.
- Ensure BF2 and wall decoration render paths apply the new picker outputs consistently (including brightening behavior where brightness is intended), and maintain existing roughness/normal workflows.
- Remove duplicate local tint math/helpers in BF2/wall decoration that are superseded by the shared picker logic.
- Add focused tests (unit and/or integration where applicable) for:
  - Picker conversion and round-trip correctness.
  - Backward compatibility with old saved tint-only configs.
  - BF2 + wall decoration UI/state sync correctness after load/edit/reopen.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_431_UI_shared_hsvb_tint_picker_and_bf2_wall_decoration_wiring_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_431_UI_shared_hsvb_tint_picker_and_bf2_wall_decoration_wiring_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Summary
- Added a shared reusable HSVB tint model (`WallBaseTintModel`) with clamping, conversion helpers, and backward-compatible wallBase field persistence.
- Added a shared GUI tint picker (`SharedHsvbTintPicker`) with hue wheel, SV triangle, brightness/intensity controls, and live swatch/hex preview.
- Replaced BF2 wall tint slider logic with the shared picker and removed duplicated local tint conversion math/helpers.
- Replaced wall decoration tint slider logic with the shared picker and removed duplicated local tint conversion math/helpers.
- Extended BF2 and wall-decoration wallBase normalization/state paths to serialize/deserialize `tintHueDeg`, `tintSaturation`, `tintValue`, `tintIntensity`, and `tintBrightness`.
- Updated BF2 and wall-decoration render paths to resolve tint color from the shared tint state (including brightness behavior) while preserving roughness/normal workflows.
- Added/updated tests for tint conversion round-trip, legacy tint-only compatibility, and BF2/wall-decoration UI expectations.
