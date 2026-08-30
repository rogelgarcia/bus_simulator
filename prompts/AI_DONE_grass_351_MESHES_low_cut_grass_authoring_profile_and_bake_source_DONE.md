DONE

# Problem

The project has a detailed procedural blade and a three-triangle runtime blade, but their scale, material grouping, and parameters are not organized into a stable low-cut grass asset contract. Runtime grass should not depend directly on the expensive authoring mesh.

# Request

Create the canonical low-cut grass authoring profile and deterministic bake source used by every later Grass Lab phase.

This is step 2 of the offline-first grass sequence. Gameplay must remain unchanged in this prompt.

Tasks:
- Establish a maintained-turf physical target centered on approximately `25-30 mm` blade height, with bounded variation appropriate for a short grass carpet.
- Preserve the high-resolution procedural blade as an authoring and baking source only.
- Derive or adapt lightweight runtime blade data from the existing low-resolution blade while avoiding multiple material groups or multiple draws for base/tip coloration.
- Define one versioned runtime profile with clear designer-facing controls for blade height, width, bend, inclination, color variation, dryness/humidity response, and deterministic seed behavior.
- Separate carpet-patch controls from localized tuft/accent controls so the main field is not forced into a tuft-based layout.
- Ensure profile export/import is stable, validated, and produces identical source geometry for identical profile and seed values.
- Provide an authoring/bake-source fixture in the canonical Grass Lab that later prompts can use to produce surface textures and cluster atlases.
- Keep authoring complexity out of the runtime representation and document the supported derivation path.

Acceptance outcomes:
- A saved low-cut profile recreates the same authored blades after reload.
- Runtime blade geometry is demonstrably lightweight and uses one material path.
- Carpet and accent/tuft settings are distinct parts of the profile.
- The high-resolution source is not rendered as repeated gameplay-style grass in the lab runtime view.

## Sequence dependency

- Requires completed `AI_DONE_grass_350_TOOLS_canonical_offline_grass_lab_and_baseline_DONE.md`.
- Supplies the profile and bake source required by `AI_grass_352`, `AI_grass_353`, and `AI_grass_356`.

## Dynamic AI coordination

- If this work completes or supersedes an item in an existing dynamic/checklist AI, leave that AI file in place and mark the affected item complete.
- Before completing this prompt, update any affected dynamic AI file; add a pending follow-up if this work discovers an unresolved shared asset or material-pipeline obligation.

## On completion
- Mark the AI document as DONE in the first line.
- Rename it in `prompts/` to `prompts/AI_DONE_grass_351_MESHES_low_cut_grass_authoring_profile_and_bake_source_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Move it to `prompts/archive/` only when explicitly requested.
- Add a high-level one-line summary per completed change.

## Completed changes

- Added a validated, deterministic low-cut profile v1 with a canonical 25–30 mm maintained-turf target and stable JSON round trips.
- Added deterministic high-resolution bake-source descriptors and a lightweight one-triangle, vertex-colored, single-material runtime derivation.
- Added a Grass Lab Authoring tab with physical blade, shape, appearance, carpet-patch, and separate localized-accent controls.
- Added an isolated side-by-side high-resolution/runtime fixture with source hashes, signatures, polygon counts, material slots, groups, and draw diagnostics.
- Mapped the profile into the canonical GrassEngine field without field-wide tuft layout and without changing gameplay integration.
- Documented the authoring-to-runtime derivation, updated sequence dependencies, and reconciled dynamic AI 349 without adding a local texture pipeline.
- Added focused unit coverage and browser validation for schema rejection, deterministic save/reload/import, runtime complexity, and Lab rendering.

## Post-completion sequence reconciliation

- This completed V1 authoring source remains available to the corrective sequence. AI 358 owns corrected appearance bakes, AI 360 owns the cohesive near mesh, and AI 363 is the final gameplay adapter.
