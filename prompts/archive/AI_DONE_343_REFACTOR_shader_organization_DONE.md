# DONE: AI-343_REFACTOR_shader_organization

# Problem

Shader code is currently mixed between inline source strings and runtime patching patterns. The project needs a standardized shader architecture that externalizes shader sources, defines loader contracts, and supports staged migration.

# Request

Implement a phased shader organization architecture for the project using external shader files and loader-driven composition.

## Requirements Checklist

### Phase 1 - Project Rules Update
- [x] Phase 1 complete.
- [x] 1. Implement in `PROJECT_RULES.md`: every shader must be in its own file, with no inline shader source strings in `.js`/`.mjs` files.
- [x] 1.1 Clarify and verify effective status: project rules update is pending until `PROJECT_RULES.md` contains the shader-file-only policy.

### Phase 2 - Shader Infra
- [x] Phase 2 complete.
- [x] 2. Define shader asset layout and file formats: use `src/graphics/shaders/{materials|postprocessing|chunks|lib}/...` with `*.vert.glsl` and `*.frag.glsl` (and `*.glsl` for shared chunks); create a shader spec file under `specs/shaders/` documenting this layout and reference that spec from `PROJECT_RULES.md`.
- [x] 2.1 For each shader, add a dedicated loader `.js` module that accepts parameters/config and returns the final shader payload for material/pass setup.
- [x] 2.2 Prefer feature enable/disable via directives (`#define`/compile-time flags) instead of ad-hoc shader source chunk string manipulation.
- [x] 2.3 Define a strict shader loader contract returning `{ vertexSource, fragmentSource, defines, uniforms, variantKey }`.
- [x] 2.4 Add a shader/material variant cache keyed by `variantKey` to avoid unnecessary recompiles.
- [x] 2.5 Create a shared shader chunk library with controlled include/composition points.
- [x] 2.6 Add uniform schema validation with defaults and type/range checks at the loader boundary.
- [x] 2.7 Add shader compile/debug reporting that includes shader file path and `variantKey`.
- [x] 2.8 Add CI enforcement that rejects inline shader source strings in `.js`/`.mjs` (local `tools/shader_policy/run.mjs`).
- [x] 2.9 Ensure the shader layout spec is maintained as the canonical source for shader folder/file conventions and linked from project rules.

### Phase 3 - Migrate Code
- [x] Phase 3 complete.
- [x] 3. Discover and inventory all shader code locations in the codebase.
    - Discovered inline shader assignments: `src/graphics/visuals/sun/SunBloomRig.js`, `src/graphics/gui/sun_bloom_debugger/SunBloomDebuggerView.js`.
- [x] 3.1 Define phased migration order and acceptance criteria for the discovered shader inventory.
- [x] 3.2 After Phase 3 discovery, create Phase 4 checklist entries (one per discovered shader target) and execute migration.

### Phase 4 - Per-Shader Migration Worklist (Placeholder)
- [x] Phase 4 complete.
- [x] 4.1 Migrate `src/graphics/visuals/sun/SunBloomRig.js` to loader-based emitter material construction.
- [x] 4.2 Migrate `src/graphics/gui/sun_bloom_debugger/SunBloomDebuggerView.js` to loader-based final composite/emitter/rays shader materials.
- [x] 4.3 Add dedicated sun bloom debugger shader assets:
    - `src/graphics/shaders/postprocessing/sun_bloom_debugger_emitter.vert.glsl`.
    - `src/graphics/shaders/postprocessing/sun_bloom_debugger_emitter.frag.glsl`.
    - `src/graphics/shaders/postprocessing/sun_bloom_debugger_rays.vert.glsl`.
    - `src/graphics/shaders/postprocessing/sun_bloom_debugger_rays.frag.glsl`.
    - `src/graphics/shaders/postprocessing/sun_bloom_debugger_final_composite.vert.glsl`.
    - `src/graphics/shaders/postprocessing/sun_bloom_debugger_final_composite.frag.glsl`.
- [x] 4.4 Fix `src/graphics/shaders/postprocessing/sun_bloom_debugger_final_composite.frag.glsl` to remove shader helper recursion.
- [x] 4.5 Add local shader policy enforcement tool and include it in `PROJECT_TOOLS.md`.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change
