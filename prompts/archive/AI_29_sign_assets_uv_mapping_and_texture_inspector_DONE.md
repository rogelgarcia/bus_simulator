# Problem [DONE]

There are sign texture atlases under `assets/signs/`, but they are not
available as individually selectable "sign textures" with correct UV mapping,
and the Texture Inspector cannot preview each sign as a separate option.

# Request

Turn the sign atlases into a set of individually addressable sign assets (one
module per sign with correct UVs), and integrate them into the Texture
Inspector so each sign can be previewed and validated.

Source atlases:
- `assets/signs/sign_basic.jpg`
- `assets/signs/sign_lane.jpg`
- `assets/signs/sign_white_messages.jpg`

Tasks:
- For each atlas, inspect the image offline and identify every distinct sign
  in it (give each sign a stable id + human-readable label).
- For each identified sign, create a separate JS module that provides:
  - A stable sign id/label and the source atlas file it comes from.
  - The sign rectangle in pixels (x, y, w, h) and the derived UV mapping.
  - A way to obtain a Three.js `Texture` (or texture-like descriptor) that
    renders only that sign region using correct `offset`/`repeat` (and any
    required wrapping/flipY conventions).
- Avoid duplicating texture loads: reuse the underlying atlas texture across
  all signs that come from the same atlas.
- Integrate all sign entries into the Texture Inspector:
  - Add inspector catalog entries so each sign is selectable.
  - Ensure selecting a sign shows the correctly cropped sign region.
  - Optionally show sign metadata (atlas name + rect/uv values) in the UI.
- Add/update browser-run tests to validate:
  - All sign modules are importable in the browser.
  - Texture inspector catalog exposes the sign entries.
  - The derived UV values are sane (repeat within (0..1], offset within [0..1])
    and stable for at least a few representative signs.

Constraints:
- Keep rendering/UI code in `src/graphics/` and avoid placing this in
  `src/app/`.
- Keep the app compatible with the current static-web setup (no bundler).
- Follow the comment policy in `PROJECT_RULES.md`.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added per-sign sign-atlas assets with pixel rects + derived UVs, integrated them into the Texture Inspector catalog with metadata display, and added browser tests validating module imports and UV sanity/stability.
