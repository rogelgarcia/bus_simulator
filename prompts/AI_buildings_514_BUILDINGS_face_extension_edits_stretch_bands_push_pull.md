# Problem

Once footprints are N-faced polygons (AI 512), editing them by dragging raw
vertices scrambles face identities and easily shears walls. The agreed edit
model (user sketches + discussion, 2026-08-26) is a pair of angle-preserving,
identity-stable plan edits with a geometric validity rule:

1. **Stretch band (tangent growth)** — enlarge a wall along its own line.
2. **Push/pull (normal move)** — slide a wall along its outward normal.

Both keep every corner angle unchanged, so corner resolution, bevels and
quoins are untouched, and face ids survive.

# Agreed design

**Validity rule (the perpendicular ray):** to stretch wall W, cast a ray from
one of W's end edges, perpendicular to W, across the plan. The cut is valid
iff EVERY wall it crosses is perpendicular to the cut (the simple case: it
exits through one opposite wall parallel to W — but the relaxed multi-wall
rule is the agreed one, so an H/U plan stretches across all its crossed
walls at once). The cut segment must lie fully inside the footprint;
grazing a vertex resolves by epsilon-nudging; angle tolerance ~0.5°.

**Stretch semantics:** everything on the far side of the cut is rigid and
translates along W's direction by Δ (Δ may be negative = shrink). Every
crossed wall gains/loses Δ of length. The cut position does NOT decide where
new bays appear: each stretched face re-solves its authored layout at the
new length — flex bays absorb, `repeat` groups add/remove copies under their
min/max, arcade groups re-derive springing (the AI 493 rules, unchanged).
Bay ids stay stable, so fire escapes, decoration sets and material overrides
keep their targets. Δ clamps to the range where every affected face still
solves (fixed/min bay sums; warn at the clamp).

**Push/pull semantics:** wall W's line offsets along its normal; W's
endpoints re-intersect with the neighbor walls' lines (the existing mitre
math). Valid unless a neighbor is parallel to W or the move collapses a
neighbor below its solver minimum. W's own length changes with the
re-intersection; W's facade re-solves like any length change.

**Internal facades / detached push (connector walls):** a face that cannot
simply re-intersect with its neighbors (a sub-segment push, or a re-entrant
"internal" face whose neighbors do not extend) is moved by spawning
**connector walls**: two new faces perpendicular to W bridging the moved
wall to the old boundary. This is the one edit that changes the run count:
the connectors get generated face ids and inherit the parent face's material
and a plain default layout; remap keeps all other ids.

**Prop reseeding accepted:** rooftop prop placements and other meter-seeded
content may move/re-seed on any of these edits.

# Request

- Implement the validity test as a pure, unit-testable plan function
  (footprint + face id + end → list of valid cuts with their crossed walls).
- Implement stretch-band and push/pull as footprint transforms that emit a
  new footprint with stable run ids (+ connector-wall spawning for the
  detached case), then let the normal rebuild re-solve facades.
- BuildingFabrication2 plan editor affordances: hovering a face shows its
  valid stretch handles (the ray cuts) and a push/pull gizmo; dragging
  applies live with re-solve; numeric entry for Δ; invalid directions shown
  disabled (the red-X case from the sketches).

## Delivery requirements
- Engine 2 only. Depends on AI 512 (N-face model) — implement after it.
- Node-level unit tests for the validity rule (parallel-opposite hit,
  multi-wall H case, red-X shear rejection, vertex grazing, concave re-entry
  rejection) and for both transforms (angles preserved, ids stable,
  connector spawning).
- Core guard: a stretch on a showcase L re-solves with an added repeat copy;
  a push/pull keeps every corner angle.
- Screenshots: before/after of a stretched face showing the facade gaining a
  repeat group copy, and a pushed face with connector walls.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
