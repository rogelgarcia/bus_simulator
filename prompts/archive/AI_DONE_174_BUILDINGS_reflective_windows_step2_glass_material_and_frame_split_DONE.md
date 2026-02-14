# DONE

#Problem

Reflective building windows require a glass-appropriate material and a clean separation between what is “frame” vs what is “glass”. If we apply a glass material to the current single window plane/texture, the frame can incorrectly look like glass. We also need to ensure reflections are driven by the existing scene environment/IBL (not real-time cube cameras) for performance.

# Request

Phase 2: Implement reflective building windows using a performant environment-map approach and a “multiple materials / layered geometry” strategy so frames remain non-glass while glass reflects convincingly. All new options introduced in this phase must be **enabled by default**.

Tasks:
- Implement reflective building windows when the “Reflective building windows” setting is enabled (from Phase 1).
- Prefer a “multiple materials” approach:
  - Keep the existing window “frame” appearance using the existing textured material (or equivalent).
  - Add a separate glass layer/material for reflections rather than making the frame behave like glass.
  - If the window geometry is currently a single plane, use layered planes (frame plane + glass plane with a tiny offset) or an equivalent technique that preserves visuals without z-fighting.
- Use `THREE.MeshPhysicalMaterial` (glass) for the reflective layer with tuned defaults (starting point, adjust as needed):
  - `color: 0x222222`
  - `metalness: 0.1`
  - `roughness: 0.05`
  - `transmission: 0.5`
  - `ior: 1.5`
  - `envMapIntensity: 1.5`
- Ensure reflections use the existing environment map pipeline (scene environment / IBL). Do not add real-time cube camera updates.
- Ensure performance and memory are acceptable:
  - Reuse shared materials/geometries where possible (avoid cloning per-window meshes unnecessarily).
  - Avoid leaking materials/textures on rebuilds/restarts/toggles.
- Ensure compatibility across building generation paths (city gameplay buildings and building fabrication previews).
- Add Options UI controls for key glass tunables (at minimum on/off already exists; optionally expose strength/roughness/transmission/ior/envMapIntensity) and make any new toggles **enabled by default**.

Nice to have:
- Support a per-material environment intensity override so glass reflections stay punchy even if global IBL intensity is low (without globally changing other materials).
- Ensure night/day readability: glass should not turn fully black from all angles; tune base color/transmission accordingly.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_174_BUILDINGS_reflective_windows_step2_glass_material_and_frame_split_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added a cached per-window glass mask texture generator (`getWindowGlassMaskTexture`) to separate frame vs glass regions.
- Implemented reflective window glass via `THREE.MeshPhysicalMaterial` on a layered plane with a tiny offset, driven by `scene.environment` (no cube cameras) and a per-material `envMapIntensity` override.
- Extended building window visuals settings with glass tunables (envMapIntensity/roughness/transmission/ior/metalness) and exposed them in Options → Gameplay (defaults enabled).
