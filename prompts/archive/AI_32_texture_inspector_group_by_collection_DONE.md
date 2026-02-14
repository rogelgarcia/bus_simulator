# Problem [DONE]

The Texture Inspector currently shows a single flat list of textures, which
does not scale as more texture types are added (e.g., windows, traffic signs).
There is no first-level selection by collection/category.

# Request

Group Texture Inspector textures by collection and add a first menu to choose
the collection. Organize the catalog code so window textures are under a
Windows collection and sign textures are under a Traffic Signs collection.

Tasks:
- Define a "collection" concept for the Texture Inspector catalog entries
  (stable collection ids + labels).
- Update the Texture Inspector UI to add a first selector to choose the
  collection, and a second selector to choose a texture within that
  collection.
- Keep navigation (Prev/Next) working within the active collection and ensure
  selection changes update the preview correctly.
- Refactor `src/graphics/assets3d/textures/TextureInspectorCatalog.js` to
  expose collections:
  - Windows textures appear under a `Windows` collection.
  - Sign textures appear under a `Traffic Signs` collection.
  - Keep stable texture ids, and make it easy to add future collections.
- Ensure default selection behavior is sensible (e.g., first collection +
  first texture) and preserve backwards compatibility where possible (existing
  callers using texture id should still work).
- Update Texture Inspector metadata display (id/name) to include collection
  context if useful.
- Add/update browser-run tests validating:
  - Collections are exposed and include expected entries.
  - Selecting a collection filters the texture options correctly.
  - Old APIs (if kept) still return a valid texture for a known texture id.

Constraints:
- Keep rendering/UI code in `src/graphics/`.
- Follow the comment policy in `PROJECT_RULES.md`.
- Keep the app compatible with the current static-web setup (no bundler).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added collection-aware Texture Inspector catalog APIs (Windows + Traffic Signs), updated the inspector UI to pick collection then texture with Prev/Next scoped per-collection, and added browser tests for collections and backwards-compatible texture-id lookups.
