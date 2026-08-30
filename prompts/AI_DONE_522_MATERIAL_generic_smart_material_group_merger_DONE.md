# DONE

# Problem

Traffic-control procedural meshes used one draw call per preserved material group. Stop signs and traffic lights therefore spent many color and auxiliary-pass calls on small meshes even though their geometry was already combined. The optimization had to be generic and based on material compatibility, not on traffic-control kinds or prop names.

# Request

Implement and validate a generic smart material-group merger that reduces compatible grouped meshes to one draw call without changing their rendered appearance or dynamic material behavior.

Tasks:
- Consolidate compatible grouped standard/physical materials without prop-specific rules.
- Preserve per-group color, optional color-map participation, roughness, metalness, emissive state, clearcoat, and clearcoat roughness.
- Keep runtime material changes working, including traffic-light signal emissive changes.
- Reject incompatible render state, unsupported texture features, custom shader hooks, and unsafe geometry instead of changing their output.
- Apply the generic pass to production traffic-control assets after placement-driven geometry has been finalized.
- Verify geometry, shader compilation, visuals, shadow behavior, draw calls, triangles, memory cost, and frame timing.

# Completed changes

- Added a reusable compatibility analyzer and material-group merger under `src/graphics/engine3d/procedural_meshes/` with no traffic-control names, kinds, or region IDs.
- Added dedicated shader assets that carry inferred material properties as vertex attributes while retaining Three.js physical lighting and the original shared color map.
- Preserved indexed geometry whenever vertices do not cross material-group boundaries; all 37 production traffic-control meshes stayed indexed.
- Added generic runtime synchronization from source materials so traffic-light signal changes continue to update emissive color and intensity.
- Integrated the pass after placement parameters are applied to every solid traffic-control asset; authoring/semantic-material callers can opt out.
- Added a focused headless test covering an unrelated generic box, stop sign, traffic light, dynamic green-light state, shader compilation, geometry parity, exact pixel parity, and draw-call counts.
- Extended the visibility-on regional profiler with frame timing and material-consolidation storage statistics.

# Validation results

- Focused color pass: **11 → 2 draw calls**, with **1,556 → 1,556 triangles**.
- Focused visual comparison: **0 changed pixels** and **0 maximum channel difference** between grouped and consolidated renders.
- Production city: **37 / 37** candidate meshes consolidated; **178 → 37** material slots.
- Average across 100 production poses with static visibility enabled:
  - All rendering: **2,333.92 → 2,169.34 calls/frame** (**164.58 saved, 7.05%**).
  - All rendering: **3,541,735.21 → 3,529,439.89 triangles/frame** (**12,295.32 saved, 0.35%**) by eliminating redundant auxiliary copies while preserving shadow-map submissions.
  - Traffic signs: **145.00 → 47.65 calls/frame** (**97.35 saved**).
  - Traffic lights: **85.09 → 17.86 calls/frame** (**67.23 saved**).
- Three full timing runs per state, including `gl.finish()`:
  - Baseline mean: **14.18 ms/frame** (12.59–15.46 ms).
  - Consolidated mean: **14.12 ms/frame** (12.43–15.67 ms).
  - Difference: **−0.06 ms / −0.4%**, which is neutral within run-to-run noise and shows no measurable regression.
- Static geometry-buffer cost: **+2,268,576 bytes (2,215.4 KiB)**; of that, **1,701,432 bytes** are the new material-property attributes. No mesh required non-indexed expansion.
- Focused smart-merger test passed; production gameplay static-visibility tests passed in single-shadow and cascaded-shadow modes; all 200 frames in every regional profile reconciled renderer totals to attributed totals.
- The full Node suite completed **415 passing / 5 unrelated existing failures / 2 skipped**. The failures concern an existing 1.34 GiB asset archive and pre-existing facade, debugger, texture-profile, and wall-decorator expectations; none touch this change.

## On completion

- Mark the AI document as DONE in the first line.
- Keep the completed prompt in `prompts/` as `prompts/AI_DONE_522_MATERIAL_generic_smart_material_group_merger_DONE.md`.
- Do not move it to `prompts/archive/` unless explicitly requested.
- Completed: generic compatibility-based consolidation, dynamic material synchronization, production integration, visual verification, performance profiling, and storage accounting.
