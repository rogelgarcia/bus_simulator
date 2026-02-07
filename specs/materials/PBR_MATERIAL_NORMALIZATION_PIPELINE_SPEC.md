# PBR Material Normalization Pipeline (Three.js)

Status: **Proposed (draft)**  
Scope: Game-wide material coherence for Three.js PBR rendering (buildings/roads/props/vehicles).  
Non-goals: Photoreal raytracing, per-asset art direction “by exception”, or rewriting the renderer.

This spec defines a phased plan to achieve stable, predictable lighting by **normalizing materials** and enforcing a shared “physical/perceptual language” across all assets.

---

## 1. Problem

When materials are inconsistent, lighting becomes impossible to tune at scale:
- Surfaces react differently to the same lights/IBL.
- Colors look over-saturated (“cartoonish”) or too dark.
- Roughness/specular response varies unpredictably.
- Normal maps vary in strength/scale, creating noisy shading and shadow artifacts.
- Developers compensate with per-object tweaks, which does not scale and breaks coherence.

Core insight:
- **Lighting problems are usually material problems.**

---

## 2. Goal

Make lighting **predictable and coherent** by treating materials as calibrated building blocks:
- Objects reference **material IDs** (catalog entries), not ad-hoc texture URLs or per-object PBR multipliers.
- Materials belong to **classes** (concrete/asphalt/painted metal/etc.) with defined acceptable ranges.
- Materials are calibrated **side-by-side** in a shared calibration scene.
- Shared **detail layers** provide richness without breaking coherence.
- Automated linting flags outliers; manual review corrects the catalog or the source textures.

Outcome:
- Global lighting changes (sun/IBL/exposure) behave predictably.
- Scenes look more realistic and cohesive without raytracing.

---

## 3. Definitions

### 3.1 “Catalog material”

A catalog material is a reusable PBR definition identified by `materialId`, containing:
- base textures (albedo/baseColor, normal, roughness, metalness, AO as applicable)
- controlled scalar parameters (e.g., roughness multiplier) defined by the catalog (not per-object)
- class metadata (`classId`) and validation ranges

### 3.2 “Per-object tweak”

Any change applied at object/mesh instance level that materially changes PBR response, e.g.:
- roughness multiplier per mesh
- normal strength per mesh
- re-coloring albedo beyond a small, class-approved tint window

Rule (target end-state):
- per-object tweaks are **not allowed** for base PBR response (exceptions must be explicit and rare).

### 3.3 Material class

A material class defines expected ranges and conventions:
- albedo luminance/saturation expectations
- roughness mean range and allowed variance
- normal intensity range and expected detail scale
- metalness policy (binary where appropriate)

Examples: `concrete`, `painted_metal`, `bare_metal`, `asphalt`, `plastic`, `glass`, `brick`, `wood`.

---

## 4. Phases

Each phase includes:
- Purpose
- Outcome
- Manual actions (you do)
- Tools / automation (we implement or run)
- Success criteria

### Phase 1 — Catalog-first registry + classes (single source of truth)

Purpose:
- Establish a **catalog-first** PBR material registry as the canonical source for surface materials.
- Organize materials into **classes** (asphalt/concrete/brick/grass/etc.) so UI pickers are easy to browse.
- Remove basecolor-only “plain texture” wall collections from user-facing tools.

Outcome:
- Every texture set under `assets/public/pbr/` is represented by a per-folder catalog config entry.
- Runtime catalogs and selection UIs are driven by those configs (not hardcoded lists).
- Building wall selection defaults to **PBR `materialId`s** (legacy building style IDs are migrated/aliased deterministically).

Specifications:
- `specs/materials/PBR_MATERIAL_CATALOG_SPEC.md` defines the Phase 1 schema, class list, and picker grouping rules.

Manual actions:
- Review the `classId` assignment for each PBR set and adjust as needed.
- Verify in-game that building walls and terrain pickers expose only PBR materials and are class-grouped.

Tools / automation:
- Per-folder config modules under `assets/public/pbr/<slug>/pbr.material.config.js`.
- A catalog collector under `assets/public/pbr/_catalog_index.js`.
- Runtime helpers and UI grouping driven by catalog entries.
- A deterministic migration mapping from legacy building style IDs → PBR `materialId`s.

Success criteria:
- No user-facing wall material picker/inspector exposes legacy basecolor-only wall textures.
- Materials are browsable by class in pickers/tools (sections).
- Legacy building style IDs still render correctly via the PBR catalog (no legacy wall texture URLs by default).

---

### Phase 2 — Calibration scene baseline (lighting + color management)

Purpose:
- Establish a stable reference lighting setup so calibration is meaningful.

Outcome:
- A reproducible calibration scene exists in-game (or as a tool view).

Manual actions:
- Choose the baseline environment(s):
  - one “neutral studio” IBL
  - optional one “overcast outdoor” IBL
- Choose tone mapping/exposure defaults used for calibration (and keep them fixed during calibration).
- Confirm texture color space rules:
  - baseColor/albedo is sRGB
  - normal/roughness/metalness/AO are linear

Tools / automation:
- Implement a **Material Calibration Tool** view:
  - fixed geometry set (material ball, flat panel, beveled box)
  - side-by-side comparisons across selected materials
  - quick switching between baseline IBL presets
  - locked camera positions (optional) for repeatable screenshots

Success criteria:
- The same material looks the same across runs and across machines (within tolerance).

---

### Phase 3 — Define material classes and validation ranges

Purpose:
- Encode “acceptable physical/perceptual ranges” so materials become predictable.

Outcome:
- Each catalog material has a `classId`, and each class defines target ranges.

Manual actions:
- Define initial classes used by the current asset set.
- For each class, define (first pass) ranges for:
  - albedo luminance (min/max)
  - saturation bound(s) (max saturation or “allowed saturation range”)
  - roughness mean range
  - normal strength range
  - metalness policy (e.g., 0 or 1, or limited continuous range)

Tools / automation:
- Extend the catalog schema to include:
  - `classId`
  - `validation` section with per-class thresholds (or class references)

Success criteria:
- Any material can be evaluated as “in-family” vs “outlier” without subjective guessing.

---

### Phase 4 — Shared detail layers (consistency without sameness)

Purpose:
- Keep coherence while adding richness and avoiding noisy per-asset normal differences.

Outcome:
- Shared detail layers exist and are used consistently per class.

Manual actions:
- Pick/create a small set of shared detail textures:
  - detail normal(s)
  - optional detail roughness modulation
- Decide per class:
  - detail intensity (how much)
  - tiling scale ranges

Tools / automation:
- Update the standard PBR material pipeline/shaders to support:
  - `detailNormal` (shared)
  - optional detail roughness
  - per-material or per-class intensity/scale (catalog-controlled)

Success criteria:
- Materials remain coherent even if base textures vary; no asset looks “too noisy” or “too flat” by accident.

---

### Phase 5 — Linter: objective analysis and outlier detection

Purpose:
- Automatically detect problematic textures/materials before they pollute the scene.

Outcome:
- A repeatable report that flags outliers for review.

Manual actions:
- Decide which checks are blocking vs warning.
- Decide how to handle “special” materials (e.g., stylized signs).

Tools / automation:
- Implement a `tools/material_lint/` CLI that can analyze source textures and catalog entries, including:
  - baseColor luminance histogram + average luminance
  - baseColor saturation metrics (and/or chroma)
  - roughness histogram (mean + variance)
  - normal intensity proxy (average slope magnitude) and/or normal length deviation
  - metalness distribution (binary check and “gray metalness” detection)
- Output:
  - a JSON report for CI/automation
  - a human-readable summary with file paths and recommended action categories

Success criteria:
- New materials can be checked quickly and consistently; obvious outliers are caught early.

---

### Phase 6 — Optional fixers (safe, opt-in)

Purpose:
- Reduce manual repetitive work while keeping artistic control.

Outcome:
- Optional fixers exist for safe, mechanical corrections.

Manual actions:
- Decide which fixers are allowed and under which conditions.

Tools / automation (optional):
- Implement opt-in “fixers” that can:
  - clamp albedo luminance into a target range (with a review step)
  - convert/normalize normal map conventions (GL vs DX) if needed
  - enforce sRGB/linear flags at load time consistently

Success criteria:
- Fixers speed up bulk correction without hiding problems.

---

### Phase 7 — Enforcement in runtime (prevent regressions)

Purpose:
- Stop backsliding into per-object tweaks.

Outcome:
- The engine enforces catalog usage and rejects/flags unauthorized overrides.

Manual actions:
- Define allowed exception categories (e.g., decals, emissive signage, special FX).

Tools / automation:
- Add runtime assertions/validation in development mode:
  - warn when a mesh material is not sourced from the catalog
  - warn when a mesh applies disallowed per-object PBR overrides
  - optionally auto-replace with a fallback debug material for visibility

Success criteria:
- New content can’t silently introduce non-normalized materials.

---

### Phase 8 — Migration and batch calibration (make it real)

Purpose:
- Convert existing content to the normalized system.

Outcome:
- Buildings/roads/props use catalog materials consistently.

Manual actions:
- Iterate in the calibration scene:
  - compare materials side-by-side within the same class
  - adjust catalog entries (not per-object)
  - re-export textures when needed

Tools / automation:
- Provide migration helpers:
  - mapping “old material” -> “catalog materialId”
  - bulk replace scripts where safe
- Provide batch screenshot capture (optional) for before/after review (calibration scene only).

Success criteria:
- A representative city block looks coherent with minimal special-case tweaks.

---

## 5. Deliverables checklist

By the time the pipeline is “in place”, the project should have:
- A canonical PBR material catalog with class metadata
- A calibration scene/tool for side-by-side validation
- Shared detail layer support
- A material linter and (optional) fixers
- Runtime enforcement (dev-mode) to prevent regressions
- A documented manual calibration workflow

---

## 6. Manual workflow (recommended)

When introducing a new material:
1) Assign a `classId`
2) Add textures + parameters to the catalog (no per-object tweaks)
3) Run the linter and fix outliers (or mark as exception)
4) Validate in the calibration scene (side-by-side within class)
5) Use in content by referencing `materialId` only

---

## 7. Open questions (explicitly deferred)

- How much stylization is acceptable (e.g., signage, UI-like surfaces) and how it is isolated from the normalized PBR pipeline.
- How weather/time-of-day impacts material response (wetness, puddles, etc.) and whether it is a class-level effect.
- How LOD affects detail layers (detail normal scaling vs disabling at distance).
