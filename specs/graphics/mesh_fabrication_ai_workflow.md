# Mesh Fabrication AI Workflow (Section 8)

## Purpose

Define the product workflow, interaction model, architecture boundaries, and safety rules for AI-instruction-driven mesh authoring.

## 1) End-to-End Workflow

1. User enters high-level instructions (one line per instruction) in the AI Modeling panel.
2. User clicks `Preview`.
3. System validates draft guardrails (size/count/session limits) before execution.
4. Draft is normalized into deterministic commands (`mesh-command.v1`).
5. Commands execute against canonical mesh runtime and emit operation log (`mesh-operation-log.v1`).
6. View updates non-destructively with preview result.
7. User chooses:
   - `Accept`: commit preview as an accepted batch (in-session).
   - `Reject`: discard preview and restore accepted state.
8. `Undo`/`Redo` operate at accepted-batch granularity.

## 2) V1 Operation Scope

Scope version: `mesh-ai-operation-scope.v1`

- Active families:
  - Transform: `translate_object`, `set_object_transform`
  - Material/UV (material active, UV hooks): `set_object_material`
  - Boolean (volumetric): `boolean_union`, `boolean_subtract`, `boolean_intersect`
- Hook-only families (recognized scope, not executable in this pass):
  - Creation: `create_primitive`, `duplicate_object`, `delete_object`
  - Extrusion/Bevel: `extrude_face`, `bevel_edge`
  - Topology-only cuts: `imprint_topology`, `slice_topology`
  - UV hooks: `set_uv_projection`, `set_uv_transform`

Acceptance rule for V1:
- Preview can be accepted only when preview-window operations have no `rejected`, `error`, or `needs_clarification` statuses and no hook/unsupported command types in the preview window.

## 3) Interaction Model

Interaction version: `mesh-ai-interaction.v1`

- Entry: multiline instruction draft (`textarea`), one instruction per line.
- Preview: non-destructive render over current live mesh source + accepted batches.
- Decision controls:
  - `Preview` computes command plan and operation outcomes.
  - `Accept` commits current preview as an accepted batch.
  - `Reject` removes current preview.
  - `Undo` removes last accepted batch.
  - `Redo` reapplies last undone batch.
- Feedback:
  - Workflow readout shows state (`Idle`, `Preview ready`, `Applied`, etc.).
  - Output panel shows scope/operation summaries and recent operation lines.
- Tessellation preview controls:
  - Top-bar `Tessellation` group exposes sectioned controls:
    - Section 14 (authoring): `Adjust Tessellation` (`On/Off`) with `U Multiplier` + `V Multiplier` for non-destructive authoring-preview retessellation.
    - Section 15 (display): `Smoothing Mode`, `Subdivision`, `Adaptive Subdivision`, `Error Budget`, `Wire Source`, and `Display LOD` for derived display-mesh rendering only.
  - Section 14 controls apply non-destructive preview overrides to semantic authoring input before runtime compilation/render.
  - Section 15 controls never mutate canonical topology IDs/connectivity and only affect derived display mesh rendering.
  - Source handoff JSON remains unchanged until explicitly authored/exported.

## 4) Architecture Boundaries

Boundary version: `mesh-ai-architecture-boundaries.v1`

- Instruction parsing/planning:
  - `src/graphics/gui/mesh_fabrication/meshCommandPipeline.js`
  - Responsibility: deterministic normalization from text to command schema.
- Mesh operation execution:
  - `src/graphics/gui/mesh_fabrication/meshCommandPipeline.js`
  - Responsibility: execute supported commands and emit operation log/object overrides/object topology outputs.
- Boolean execution backend:
  - `src/graphics/gui/mesh_fabrication/meshBooleanKernelManifold.js`
  - `src/graphics/gui/mesh_fabrication/meshBooleanKernelAdapterManifold.js`
  - `src/graphics/gui/mesh_fabrication/meshBooleanEngine.js`
  - Responsibility: authoritative `manifold-3d` volumetric booleans (`union/subtract/intersect`) with deterministic adapter regrouping, provenance propagation, and canonical topology ID lifecycle reconstruction.
- Semantic topology compilation:
  - `src/graphics/gui/mesh_fabrication/semanticMeshCompiler.js`
  - Responsibility: compile compact semantic authoring (`mesh-semantic-authoring.v1`) into deterministic compiled topology (`mesh-fabrication-compiled.v1`) with stable lineage IDs.
  - Supported executable seed primitives include `box`, `cylinder`, and `tube` (deterministic seeded face/edge/vertex IDs).
  - Section 14 parametric contract: `mesh-parametric-grid.v1` (`u/v` grid axes, deterministic index space, canonical `uv_index_path` ID derivation, retessellation ID lifecycle policy).
  - Family adapter map declared for `cylinder` and `tube` (executable), `revolve` (declared/non-executable), and `sweep` (declared/non-executable).
  - Cylinder adapter mapping: `radialSegments -> uSegments`, `axialSegments -> vSegments`, `seamAngle -> uSeam`, with capped extensions (`capRings`, `syncOppositeCap`, `topCapRings`, `bottomCapRings`).
  - Tube adapter mapping: `radialSegments -> uSegments`, `axialSegments -> vSegments`, `seamAngle -> uSeam`, with deterministic side-specific radius expansion (`outerRadiusTop/Bottom`, `innerRadiusTop/Bottom`) and validation (`innerRadiusSide < outerRadiusSide`).
  - Supports authored face aliases (`faceAliases`) that map stable canonical seed face names to user-facing labels without changing canonical IDs.
- Validation and guardrails:
  - `src/graphics/gui/mesh_fabrication/meshAiWorkflow.js`
  - Responsibility: draft constraints, scope classification, preview acceptance constraints.
- Scene integration:
  - `src/graphics/gui/mesh_fabrication/MeshFabricationView.js`
  - `src/graphics/gui/mesh_fabrication/liveMeshHandoff.js`
  - `src/graphics/gui/mesh_fabrication/displayMeshDerivation.js`
  - Responsibility: preview/apply/reject/undo/redo orchestration, canonical/runtime parsing, and section-15 derived display mesh generation (smoothing/subdivision/LOD/wire-source) while preserving canonical topology authority.

## 5) Quality and Safety Constraints

Constraint version: `mesh-ai-quality-constraints.v1`

- `maxDraftChars = 2400`
- `maxDraftInstructions = 24`
- `maxAcceptedBatches = 64`
- `maxTotalSessionInstructions = 240`
- `acceptRequiresNoRejectedOrErrorOrClarification = true`
- Deterministic ordering:
  - instruction order is preserved
  - operation IDs and command IDs are stable by sequence
- Topology integrity and render performance continue to be enforced by canonical/compiled topology parsing + batched edge-wire overlay constraints.
- Boolean guardrails:
  - boolean operations require matching target/tool transforms in this pass.
  - `subtract_clamped` requires tool bounds fully contained inside target bounds.
  - topology-only cut operations remain non-executable hooks in this pass (`imprint_topology`, `slice_topology`).
  - runtime boolean kernel is selected by `ai.booleanKernel` and currently only accepts `manifold-3d` (default).
  - runtime fallback policy is strict `none`; boolean kernel failures are explicit operation errors (no local-kernel fallback).
- Mesh-generation pivot convention: default local pivot is bottom-centered at `0,0,0` (for example default `box` seed places bottom on `Y=0`).
- Derived-topology policy locks:
  - `topologyChangePolicy = preserve_unaffected_create_new_never_recycle`
  - `extrusionCapIdentity = always_new_derived_cap_id`
  - `ambiguousLoopFallback = ring_ordinal`
- Section-15 display contract lock:
  - smoothing/subdivision/adaptive/LOD/wire-source controls are display-only and must not mutate canonical topology IDs or canonical topology connectivity.

## 6) Boolean Runtime Contract (Section 13)

- Execution families:
  - active volumetric booleans: `boolean_union`, `boolean_subtract`, `boolean_intersect`
  - hook-only topology cuts: `imprint_topology`, `slice_topology`
- Runtime kernel policy:
  - authoritative kernel: `manifold-3d`.
  - local custom boolean logic remains in-repo but is disconnected from runtime execution/fallback paths.
  - `ai.booleanKernel` contract:
    - allowed values: `manifold-3d`
    - default: `manifold-3d`
    - any other value is rejected before command execution.
- Adapter processing model:
  - canonical topology is converted to manifold `Mesh` buffers (`vertProperties`, `triVerts`, `faceID`, `runIndex`, `runOriginalID`).
  - manifold output triangles are converted back through deterministic regrouping: provenance bucket -> coplanar bucket -> connectivity components.
  - regrouping attempts single-ring polygon reconstruction per component; ambiguous/multi-loop components deterministically split into single-ring faces.
  - second deterministic pass merges eligible fallback triangle pairs into convex quads when provenance/plane/shared-edge checks pass.
  - compiled-v1 face output remains single-ring only; opening regions are represented by deterministic face splits until hole-loop face records are introduced.
- Subtract execution modes:
  - `subtract_through`: unrestricted volumetric subtract (can produce full cut-through results).
  - `subtract_clamped`: requires tool bounds strictly contained inside target bounds.
- Deterministic ID + naming/provenance policy:
  - preserve unchanged target face IDs when reconstructed ring signature is unchanged.
  - created/split target faces use `...face.bool.<opId>.target.<seed>[.fNNN]`.
  - cutter-derived faces use `...face.bool.<opId>.<toolFaceTag>[.fNNN]` (for example `part.tire.outer.face.bool.sub001.inner.s005`).
  - fragment suffixes (`.f000`, `.f001`, ...) are assigned from deterministic sorted polygon order.
  - adapter carries deterministic source-face provenance (`sourceRole`, `sourceObjectId`, `sourceFaceId`) into operation metadata.
- Post-boolean topology guardrails:
  - reject duplicate/empty IDs, unknown references, degenerate faces/triangles, and non-manifold edge fan-out (`>2` face uses per edge).
  - enforce winding consistency on edges shared by exactly two faces.
  - operation failures are surfaced as `error` entries in `mesh-operation-log.v1` with explicit markers (`boolean_kernel_error`, `no_fallback`).
  - successful manifold executions emit kernel markers (`boolean_kernel_applied`) and provenance/regrouping metadata.
- Rollout / rollback thresholds:
  - preview acceptance threshold: any boolean operation `error` blocks `Accept`.
  - runtime rollback threshold: any manifold adapter failure aborts that operation immediately (no kernel fallback path).
