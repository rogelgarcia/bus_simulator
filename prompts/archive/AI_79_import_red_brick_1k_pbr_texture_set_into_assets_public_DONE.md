# Problem [DONE]

There is a new “red brick 1K” texture set available in `downloads/` as a ZIP with multiple PBR maps (also in exploded folder). The project currently uses a single flat brick texture (`brick_wall.png`) for building walls, and there is no standardized, versioned place in `assets/public/` for a full PBR material set (basecolor/normal/roughness/etc.) for brick walls.

# Request

Import the red brick 1K PBR texture set from `downloads/` into `assets/public/` with a clean folder hierarchy and consistent filenames so it can be referenced by game code and tools.

Tasks:
- Locate `downloads/red_brick_1k.zip` and extract its contents offline into the repo (or use already exploded format).
- Create a clear asset hierarchy under `assets/public/` for wall materials (reuse existing conventions where applicable, but add subfolders as needed).
- Place the red brick textures into a dedicated folder (versioned/named clearly, e.g., “red_brick_1k”) so the set is self-contained.
- Normalize filenames to a consistent scheme so game code can reference the maps predictably (base color, normal, roughness, AO/packed map, displacement if kept).
- Keep only the maps that are actually needed for runtime rendering and debugging (avoid committing extra formats that won’t be used). Check the best for the bucket balance. This doesnt need to be realistic, just good enough. And favor smaller file sizes where possible.
- Ensure the imported textures are treated as public/shareable assets and remain compatible with the repo’s Git LFS tracking for `assets/public/**`.
- Add a short note (file-level or README-style within the brick assets folder, if appropriate for this repo) describing what the red brick set contains and any key assumptions (1K, normal map convention, etc.).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to AI_79_import_red_brick_1k_pbr_texture_set_into_assets_public_DONE
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Imported the red brick 1K PBR set into `assets/public/textures/buildings/walls/pbr/red_brick_1k/` with normalized filenames (basecolor/normal_gl/arm) plus a short README.
