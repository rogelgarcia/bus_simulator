# DONE

# Problem

The mesh fabrication system needs reliable boolean operations for AI-driven editing. We have three candidate paths (`manifold-3d`, `three-bvh-csg`, and a local custom implementation), and the decision must prioritize topology stability and deterministic ID behavior for text-referenced mesh operations.

## Discussion Summary (Context to preserve)

- The workflow is AI-driven (`create mesh` / `edit mesh`) and may replay/reopen objects with stacked operations repeatedly.
- Raw boolean speed is less important than stable, correct topology over many edit cycles.
- Stable topology IDs are critical because operations and references are text-based; broken topology/IDs becomes expensive to recover.
- We discussed concrete provenance needs: for cases like `outer - inner` (two cylinders), we need a deterministic strategy to map new output faces back to source-face naming when possible.
- Pivot/origin usability matters for placement/export workflows (for example, easy ground placement when pivot/base alignment is controlled), but must remain secondary to topology correctness for boolean-kernel selection.

# Request

Evaluate and recommend boolean-kernel adoption for mesh fabrication AI editing, with `manifold-3d` as the current recommended direction and `three-bvh-csg` as the runner-up comparator, plus explicit assessment of a local custom implementation.

## Decision Matrix

Scoring scale: `1 (weak)` to `5 (strong)` for this project's requirements.

| Criterion | manifold-3d | three-bvh-csg | local custom (current repo) |
| --- | --- | --- | --- |
| Topology robustness / manifold guarantees | `5` | `2` | `2` |
| Determinism across stacked operations | `4` | `2` | `3` |
| Stable canonical ID compatibility | `4` | `2` | `4` |
| Source-face provenance / traceability potential | `5` | `2` | `3` |
| Integration complexity in current Three.js pipeline | `3` | `5` | `5` |
| Runtime / perf (secondary) | `4` | `4` | `3` |
| Overall fit for AI editing correctness | `5` | `3` | `3` |

### Why `three-bvh-csg` is runner-up

- It is very easy to integrate in a Three.js runtime and has strong practical performance.
- It is explicitly marked experimental/in-progress and warns that results may fail complete two-manifold correctness in corner cases.
- For this AI workflow, correctness and ID stability over repeated edits rank above raw speed, so it remains second place.

## Option Assessment

### 1) `manifold-3d` (Recommended)

Pros:
- Explicitly designed around manifold mesh robustness and robust booleans.
- Built-in relationship tracking primitives (`OriginalID`, `faceID`, triangle runs) align well with provenance requirements.
- Strong fit for deterministic, replay-heavy AI edit pipelines.

Cons:
- Integration cost is higher than pure Three.js CSG because this is a WASM-backed kernel.
- Requires explicit memory lifecycle discipline in JS (`delete()` calls).
- Output is triangle-level by default, so polygon face regrouping remains our responsibility.

### 2) `three-bvh-csg` (Second Runner)

Pros:
- Native Three.js ecosystem fit with straightforward evaluator workflow.
- Fast for interactive CSG and low integration friction.
- Useful as a preview/debug path or non-critical fallback.

Cons:
- Project documentation flags experimental status and known robustness corner cases.
- Not ideal as authoritative kernel for deterministic text-addressed topology IDs.
- Provenance mapping is not first-class in its API contract.

### 3) Local custom engine (Current repo)

Pros:
- Already integrated with current ID/naming lifecycle and operation-log flow.
- Deterministic naming and validation rules are implemented in-repo.
- Full control of behavior and roadmap.

Cons:
- Kernel is epsilon/BSP-based and carries higher long-tail geometric edge-case risk.
- Maintainer burden grows quickly as boolean complexity increases.
- Current compiled face model is single-ring and does not yet represent inner loops explicitly.

## Stable-ID Workflow Feasibility (Boolean Outputs)

### Source-face attribution model

- Use kernel-level provenance fields as primary hints (`OriginalID`, `faceID`, run ranges) when available.
- Reconstruct output canonical faces deterministically by grouping triangles using:
  - same output object,
  - same provenance tuple (`source object`, `source face`),
  - consistent coplanarity + shared-edge connectivity.
- Preserve pre-boolean IDs only when ring signature matches exactly.

### Triangle-level output handling

- Accept that boolean output may not be one-to-one with authored polygon faces.
- Deterministically regroup triangles into logical faces in a post-pass.
- If regrouping yields multiple disjoint regions from one source face, assign deterministic fragment suffixes (`.f000`, `.f001`, ...).

### Deterministic canonical labeling rules

- Unchanged target face: preserve existing canonical ID.
- Split target face: `...face.bool.<opId>.target.<seed>[.fNNN]`.
- Cutter-derived face: `...face.bool.<opId>.<toolFaceTag>[.fNNN]`.
- If provenance is unavailable/ambiguous, use deterministic geometry hash ordering and assign stable fallback IDs.

## Recommendation

Adopt `manifold-3d` as the authoritative boolean kernel for AI mesh editing.

Rationale:
- It is the best match for the top priority: robust topology and repeatable behavior over many edit cycles.
- It has stronger native provenance semantics than alternatives, which reduces risk in canonical-ID workflows.
- The current local custom engine is useful as an interim fallback but should not remain the long-term primary kernel.

## Adoption Plan

### Phase 0: Minimal spike (no pipeline replacement yet)

- Add an adapter module that runs one boolean op (`subtract_through`) on two compiled objects.
- Convert input canonical object topology to manifold input buffers with provenance tags.
- Convert output triangles back into canonical runtime object with deterministic regrouping.
- Run side-by-side with local custom engine for the same fixtures and record diff artifacts.

### Phase 1: Contract/spec updates

- Update mesh handoff + AI workflow specs with a `booleanKernel` section:
  - `kernel: manifold-3d | local-custom` (runtime-selected),
  - provenance requirements (`originalId`, `faceId`, run mapping),
  - deterministic regrouping and fallback ID policy.
- Explicitly document triangle output normalization and single-ring limitation behavior.

### Phase 2: Test plan (topology + ID stability focus)

- Repeated stacked-operation determinism tests (`N` same sequences -> identical topology snapshots).
- Provenance tests (`outer - inner` cylinder, intersect/union cases) verifying canonical IDs and fragment ordering.
- Regression corpus for edge cases: coplanar touches, near-tangent cuts, small-feature cutters.
- Golden operation logs: ensure deterministic `operationLog` status/messages and ID outputs.

### Phase 3: Rollout and rollback strategy

- Feature-flag kernel selection (`manifold-3d` default in fabrication screen only).
- Dual-run shadow mode in dev: run both kernels and compare topology hash + canonical ID map.
- Automatic fallback to local custom on adapter hard-failure with explicit operation-log marker.
- Keep local custom path available until corpus pass-rate reaches agreed threshold.

## Risk Analysis

- Primary migration risks:
  - adapter complexity (triangle regrouping + canonical face reconstruction),
  - WASM lifecycle management in long editing sessions,
  - differences in face partitioning vs existing custom outputs.
- Mitigation:
  - strict deterministic post-pass,
  - explicit memory cleanup checks,
  - shadow comparisons before full cutover.

## References

- Manifold overview and guarantees: https://manifoldcad.org/docs/html/
- Manifold JS/WASM usage and memory management: https://manifoldcad.org/docs/jsapi/documents/Using_Manifold.html
- Manifold provenance fields (`runOriginalID`, `faceID`, run mapping): https://manifoldcad.org/docs/html/structmanifold_1_1_mesh_g_l_p.html
- Manifold class relationship tracking (`OriginalIDs`, `faceIDs`, transforms): https://manifoldcad.org/docs/jsuser/classes/Manifold.html
- three-bvh-csg docs/readme (experimental status, gotchas, roadmap): https://github.com/gkjohnson/three-bvh-csg
- three-bvh-csg docs site gotchas: https://gkjohnson.github.io/three-bvh-csg/
- Local engine implementation reference: `src/graphics/gui/mesh_fabrication/meshBooleanEngine.js`
- Local boolean contract/spec reference: `specs/graphics/mesh_fabrication_ai_workflow.md`

## On completion

- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_482_MESHES_boolean_kernel_adoption_manifold_vs_three_bvh_csg_vs_local_custom_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_482_MESHES_boolean_kernel_adoption_manifold_vs_three_bvh_csg_vs_local_custom_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Summary

- Built a decision matrix comparing `manifold-3d`, `three-bvh-csg`, and local custom against topology, determinism, IDs, provenance, integration, and perf.
- Recommended `manifold-3d` as the primary boolean kernel and justified `three-bvh-csg` as runner-up with risk-based rationale.
- Defined deterministic triangle-to-face regrouping and canonical-ID rules for stable text-addressable topology.
- Provided phased adoption, test, and rollback plans tailored to the current mesh fabrication pipeline.
