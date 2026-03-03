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

## 4) Architecture Boundaries

Boundary version: `mesh-ai-architecture-boundaries.v1`

- Instruction parsing/planning:
  - `src/graphics/gui/mesh_fabrication/meshCommandPipeline.js`
  - Responsibility: deterministic normalization from text to command schema.
- Mesh operation execution:
  - `src/graphics/gui/mesh_fabrication/meshCommandPipeline.js`
  - Responsibility: execute supported commands and emit operation log/object overrides/object topology outputs.
- Boolean execution backend:
  - `src/graphics/gui/mesh_fabrication/meshBooleanEngine.js`
  - Responsibility: deterministic volumetric boolean execution (`union/subtract/intersect`) with deterministic topology reconstruction and cutter-face lineage naming on generated faces.
- Semantic topology compilation:
  - `src/graphics/gui/mesh_fabrication/semanticMeshCompiler.js`
  - Responsibility: compile compact semantic authoring (`mesh-semantic-authoring.v1`) into deterministic compiled topology (`mesh-fabrication-compiled.v1`) with stable lineage IDs.
  - Supported seed primitives include `box` and `cylinder` (deterministic seeded face/edge/vertex IDs).
  - Supports authored face aliases (`faceAliases`) that map stable canonical seed face names to user-facing labels without changing canonical IDs.
- Validation and guardrails:
  - `src/graphics/gui/mesh_fabrication/meshAiWorkflow.js`
  - Responsibility: draft constraints, scope classification, preview acceptance constraints.
- Scene integration:
  - `src/graphics/gui/mesh_fabrication/MeshFabricationView.js`
  - Responsibility: preview/apply/reject/undo/redo orchestration and render updates.

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
- Mesh-generation pivot convention: default local pivot is bottom-centered at `0,0,0` (for example default `box` seed places bottom on `Y=0`).
- Derived-topology policy locks:
  - `topologyChangePolicy = preserve_unaffected_create_new_never_recycle`
  - `extrusionCapIdentity = always_new_derived_cap_id`
  - `ambiguousLoopFallback = ring_ordinal`

## 6) Boolean Runtime Contract (Section 13)

- Execution families:
  - active volumetric booleans: `boolean_union`, `boolean_subtract`, `boolean_intersect`
  - hook-only topology cuts: `imprint_topology`, `slice_topology`
- Geometry processing model:
  - booleans run through geometry-agnostic polygon clipping/reconstruction (not primitive-specific).
  - face splitting/partitioning is derived from clipped polygon regions and deterministic polygon ordering.
  - compiled-v1 face output remains single-ring only; no polygon inner-loop records are emitted.
- Subtract execution modes:
  - `subtract_through`: unrestricted volumetric subtract (can produce full cut-through results).
  - `subtract_clamped`: requires tool bounds strictly contained inside target bounds.
- Deterministic ID + naming policy:
  - preserve unchanged target face IDs when reconstructed ring signature is unchanged.
  - created/split target faces use `...face.bool.<opId>.target.<seed>[.fNNN]`.
  - cutter-derived faces use `...face.bool.<opId>.<toolFaceTag>[.fNNN]` (for example `part.tire.outer.face.bool.sub001.inner.s005`).
  - fragment suffixes (`.f000`, `.f001`, ...) are assigned from deterministic sorted polygon order.
- Post-boolean topology guardrails:
  - reject duplicate/empty IDs, unknown references, degenerate faces/triangles, and non-manifold edge fan-out (`>2` face uses per edge).
  - enforce winding consistency on edges shared by exactly two faces.
  - operation failures are surfaced as `error` entries in `mesh-operation-log.v1`.
