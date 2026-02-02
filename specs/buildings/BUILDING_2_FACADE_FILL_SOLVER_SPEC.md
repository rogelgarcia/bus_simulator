# Building v2 — Facade Fill Solver Specification (Groups + Bays)

Status: **Proposed (draft)**  
Scope: **Deterministic horizontal fitting (repeat + expand) for a single face**, shared across applicable layers.

This document defines the canonical **v0** algorithm for expanding a face’s facade layout (bays + groups) into a resolved bay list that **fills the face length** deterministically.

Related specs:
- Facade layout model (bays, groups, sizing): `specs/buildings/BUILDING_2_FACADE_LAYOUT_SPEC.md`
- Engine overview + determinism requirements: `specs/buildings/BUILDING_2_SPEC_engine.md`

Non-goals:
- UI specifics (those belong in UI specs/prompts).
- Backtracking/optimization solvers; v0 is greedy and explainable.

---

## 1. Goals

The solver MUST:
- Produce the same result for the same inputs (**fully deterministic**).
- Prefer repeating **groups** (pattern repetition) over stretching bays.
- Use per-bay `expandPreference` to guide whether bays are duplicated (local repetition) vs expanded (width growth).
- Expand remaining length across expandable bays using deterministic preference tiers, respecting min/max constraints.
- Use **center-out** tie-breaks for deterministic symmetry.
- Support cross-layer continuity:
  - repeat decisions are shared across applicable layers for a face (stable bay topology),
  - width reflow is per-layer (face lengths can differ per layer).

---

## 2. Definitions

### 2.1 Face usable length

For a face `F` on layer `K`:
- `L(F,K)` = face length (meters)
- `Cstart(F)`, `Cend(F)` = reserved corner widths (meters)
- `Lusable(F,K) = max(0, L(F,K) - Cstart(F) - Cend(F))`

### 2.2 Width terms

For a bay:
- `minWidth` is:
  - fixed width when `mode=fixed`, or
  - `min` when `mode=range/flex`
- `maxWidth` is:
  - fixed width when `mode=fixed`, or
  - `max` when `mode=range/flex` (may be `∞`)

A bay instance is **expandable** if `currentWidth < maxWidth`.

### 2.3 “Fits”

A candidate repetition “fits” a target length if the total **minimum** width of the expanded layout does not exceed the target:
- `totalMinWidth <= Lusable`

v0 uses **minimum-width fit tests** so repetition never relies on later shrink/backtracking.

### 2.4 Center-out ordering

Given an ordered list `items[0..N-1]` left→right:
- If `N` is odd: start at `mid = floor(N/2)`.
- If `N` is even: start at `midLeft = (N/2)-1`, then `midRight = N/2`.
- Continue outward by alternating left and right indices: `mid, mid-1, mid+1, mid-2, mid+2, ...`

This ordering MUST be used whenever the solver needs a deterministic tie-break for distributing actions across a line.

---

## 3. Inputs and outputs

### 3.1 Inputs (per floor layer, per face)

The solver consumes, for a given floor layer face:
- the facade layout definition (bays + groups),
- bay sizing constraints (min/max / fixed),
- group repeat constraints (`minRepeats`, `maxRepeats`),
- bay `expandPreference` flags (local repetition vs expansion intent),
- per-layer face lengths `Lusable(F,K)` for all applicable layers `K` that share this face topology.

### 3.2 Output

For each applicable layer `K`, the solver produces an ordered `ResolvedBay[]`:
- `bayId`
- `uStart`, `uEnd`, `width` (meters)

The **topology** (bay ids and ordering) MUST be the same across applicable layers for the face.

---

## 4. v0 Algorithm (phases)

The solver runs in two stages:
1) **Topology stage** (repeat decisions): decide how many bays exist and in what order (shared across layers).
2) **Width stage** (per layer): assign widths to fill each layer’s `Lusable(F,K)`.

### 4.1 Stage A — Build the base expanded layout (topology)

1) Expand the authored layout at minimum counts:
   - each repeatable group uses `minRepeats`,
   - each local repeat (if present) uses its `minRepeats`,
   - each standalone bay appears once.
2) Compute `baseMinWidth` = total minimum width of the expanded bays.
3) If `baseMinWidth` exceeds the most restrictive usable length (see §4.2), the layout is infeasible and MUST follow the engine’s overflow policy (error or repeat reduction).

### 4.2 Stage B — Determine the “most restrictive” layer length

Repeat decisions MUST be feasible across all applicable layers.

Define:
- `LusableMin(F) = min_K (Lusable(F,K))` across layers that must share topology.

All topology decisions in §4.3–§4.4 MUST use `LusableMin(F)` as the fit target.

### 4.3 Stage C — Repeat groups until no longer fit (center-out)

Goal: maximize pattern repetition without exceeding `LusableMin(F)` at minimum widths.

Algorithm:
1) Identify all repeatable groups that are eligible to grow (`repeatCount < maxRepeats`).
2) Iterate in **passes**. In each pass:
   - Visit eligible groups in **center-out order** based on their left→right order in the authored layout.
   - For each group `G`:
     - Tentatively increment `G.repeatCount` by `+1`.
     - Recompute total minimum width (`totalMinWidthCandidate`).
     - If `totalMinWidthCandidate <= LusableMin(F)`, commit the increment; otherwise revert it for this pass.
3) Stop when a full pass makes **no changes** (no group can be incremented without exceeding `LusableMin(F)`).

Determinism notes:
- The group visit order is fully defined (center-out).
- The fit test is based on minimum widths only.
- No backtracking beyond reverting the single attempted increment.

### 4.4 Stage D — Local repetition (per-bay `expandPreference`)

After group repetition is finalized, the solver MAY duplicate bays according to each bay’s `expandPreference`:
- `expandPreference = 'prefer_repeat'`: eligible for local repetition (duplication).
- `expandPreference = 'no_repeat'`: MUST NOT be duplicated.
- `expandPreference = 'prefer_expand'`: MUST NOT be duplicated in v0 (it will be handled by width expansion in Stage E).

Deterministic v0 local repetition rule (balanced passes):
- Evaluate on the **current expanded bay list** after group repetition.
- Let `R` be the set of bays whose `expandPreference = 'prefer_repeat'`.
- Compute `passMinWidth = Σ(minWidth(bay))` across `R`.
- While `totalMinWidth + passMinWidth <= LusableMin(F)`:
  - duplicate each bay in `R` once (insert adjacent to the original, preserving left→right order),
  - update `totalMinWidth` and repeat the pass.

This rule is deterministic because every successful pass repeats the full eligible set `R` together.

### 4.5 Stage E — Per-layer width solve: expand remainder with preference tiers (with clamp + redistribute)

For each applicable layer `K`:

1) Initialize each bay instance width:
   - `w = fixedWidth` for fixed bays
   - `w = minWidth` for ranged/flexible bays
2) Compute `remainder = Lusable(F,K) - Σw`.
3) If `remainder < 0`, the layout cannot fit at minimum widths and MUST follow the engine’s overflow policy.
4) Distribute `remainder` across **expandable** bay instances, respecting `expandPreference` tiers:
   - Define three tiers in priority order:
     1) `Prefer Expand`: instances whose source bay has `expandPreference = 'prefer_expand'`
     2) `No Repeat`: instances whose source bay has `expandPreference = 'no_repeat'`
     3) `Prefer Repeat`: instances whose source bay has `expandPreference = 'prefer_repeat'`
   - For each tier `T` in order:
     - Let `S` be the set of tier instances with headroom (`w < maxWidth`).
     - While `remainder > 0` and `S` is not empty:
       1. Compute `share = remainder / |S|`.
       2. For each bay `b` in `S`, add `Δ = min(share, headroom(b))`.
       3. Subtract applied `Δ` from `remainder`.
       4. Remove any bays that reached `maxWidth` from `S`.
5) If `remainder` is still > 0 after exhausting `S`, the face cannot be fully filled under constraints:
   - This MUST surface as an error for exported/final assets.
   - During authoring, this MAY be surfaced as a warning if the engine allows explicit gap remainder (future), otherwise it is invalid.

Final epsilon/tie-break:
- If floating point rounding leaves a tiny residual remainder that can’t be evenly split, apply the last increments using **center-out order** over the expandable bay list so results are deterministic and symmetric.

---

## 5. “Always fill the face” requirement (filler bay)

Given v0’s repetition + expansion behavior, the recommended way to guarantee full coverage is:
- Ensure each face has at least one bay with `maxWidth = ∞` (a **filler bay**), typically with a small `minWidth`.

Engine validation SHOULD:
- warn if a face has no unbounded/expandable bay capable of absorbing remainder, and
- treat “cannot fill” as invalid when exporting/building final assets.

---

## 6. Open questions / future extensions (non-normative)

These are intentionally out of scope for v0:
- Multi-pass repeat/expand loops (repeat → expand → repeat).
- Bay repetition inside repeated groups (requires symmetry rules across group instances).
- Explicit remainder-as-gap policies for final assets.
