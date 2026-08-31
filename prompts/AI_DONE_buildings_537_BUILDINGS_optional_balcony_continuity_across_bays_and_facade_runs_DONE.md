DONE

# Problem

Building Fabrication 2 currently generates each balcony as planar, per-bay geometry. Its side controls can hide an end railing, but they do not create a true shared balcony slab, fascia, guard, or top rail between neighboring bays or across adjacent facade runs. This leaves gaps, overlaps, duplicate end elements, and makes corner-wrapping balconies such as Terra & Mar impossible to author reliably.

# Request

Add optional, backward-compatible balcony continuity across compatible bays on the same facade and across adjacent existing planar facade runs, including convex straight and chamfered corners. The feature must be explicit and default off, preserve every existing unlinked balcony, and be authorable and inspectable in the Building Fabrication 2 editor.

Tasks:
- Define a first-class continuity model with stable balcony endpoints and link identity so compatible balcony spans can be joined on the same run or across adjacent runs without relying on array position or display labels.
- Keep continuity opt-in and default off. Existing configs, presets, exports, and unlinked balcony geometry must retain their current behavior and appearance.
- Validate links before generation and provide clear, actionable diagnostics for missing endpoints, non-adjacent runs, incompatible elevations, floor ranges, slab dimensions, placement, or topology. Existing curved runs are outside this stage and must be rejected with a clear validation message. Invalid links must fail safely without corrupting unrelated facade geometry.
- Resolve facade direction and face-link reversal correctly so a logical left/right balcony endpoint remains attached to the intended physical building corner after run reversal, linked-facade reuse, mirroring, serialization, and reload.
- Generate a single visually continuous and watertight slab/fascia transition at supported convex planar corners, with no triangular gap, self-intersection, coplanar overlap, z-fighting, or doubled underside. Support ordinary 90-degree corners and existing chamfered corner runs.
- Continue the guard treatment through each valid join: glass/infill and top rails must meet cleanly, while duplicate side panels, end posts, caps, and internal corner posts are suppressed. Preserve required outer-end guards and provide deterministic handling where a corner needs a structural post.
- Preserve independent facade bay composition. Linking balconies must not merge windows, doors, walls, or structural-pier bays, and must allow a narrower front face with planar or chamfered neighboring balcony ends.
- Keep this stage focused on balcony continuity. Do not add spline/custom-face-path authoring and do not perform a broad Building Fabrication builder refactor; those belong in later, separately scoped work.
- Add Building Fabrication 2 editor controls to select compatible balcony endpoints, create/remove a link, show linked counterparts and status, distinguish same-run from cross-run continuity, and surface validation errors in context. The preview must update immediately and make link direction/reversal understandable.
- Persist the feature through config normalization, cloning, import/export, catalog loading, editor round trips, and any supported face-linking workflow. Update the canonical balcony/building schema and relevant specifications with compatibility rules and explicit supported/unsupported topology.
- Use Terra & Mar as a deterministic acceptance case: its actual front run A has three balcony bays separated by two internal piers away from the corners; its outer A balconies join the adjacent runs B and H. Verify both the current chamfered footprint and a narrower-A planar/chamfered variant without moving the internal piers back to the corners.
- Add focused unit and core tests for endpoint identity, same-run joins, cross-run joins, reversal, invalid links, round trips, geometry continuity, railing de-duplication, backward compatibility, 90-degree corners, chamfers, and explicit rejection of unsupported curved runs.
- Add visual acceptance coverage from useful front, three-quarter, corner close-up, and low-angle viewpoints. Store screenshots, comparison images, manifests, traces, and logs only under `tests/artifacts/screens/buildings/ai537-balcony-continuity/`; do not stage or commit generated artifacts.

## On completion
- Mark the AI document as DONE in the first line.
- Rename it in `prompts/` to `prompts/AI_DONE_buildings_537_BUILDINGS_optional_balcony_continuity_across_bays_and_facade_runs_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Move it to `prompts/archive/` only when explicitly requested.
- Add a high-level one-line summary per completed change.

## Completion summary

- Added stable, opt-in balcony-continuity links with canonical normalization, cloning, validation, persistence, and atomic silhouette remapping.
- Generated unified same-run and supported convex planar/chamfered corner slabs, fascia, guards, rails, supports, and deterministic corner posts while preserving safe legacy fallbacks.
- Added Building Fabrication 2 endpoint controls, compatibility diagnostics, linked-counterpart state, reversal-aware labels, create/remove actions, and immediate preview updates.
- Added a continuity-only editor panel for physical face-linked slaves so inherited/reversed endpoints remain inspectable and removable without duplicating master facade controls.
- Updated Terra & Mar so both front corners and the compatible E-D rear corner join without moving its three-bay composition or internal piers.
- Documented supported topology, compatibility rules, editor behavior, schema, and multi-face remapping in the Building Fabrication 2 specifications.
- Added focused model, remap, persistence, editor, generator, fallback, Terra & Mar, and visual-evidence coverage.
