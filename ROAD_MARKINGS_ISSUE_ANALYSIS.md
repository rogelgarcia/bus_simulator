# Road Markings Disappearance — Investigation & Root Cause (2026-01-27)

This doc captures the investigation into a regression where **road markings existed in the scene graph** but were **not visible** in gameplay and in deterministic harness city scenarios.

See also: `ROAD_MARKINGS_EXPERIMENT_LOG.md` for the chronological log of experiments/attempts.

---

## Problem Statement

**User-visible symptom**
- In gameplay: road markings are missing / not visible.
- In city view: markings sometimes appear only when asphalt is disabled (suggesting occlusion), but the issue persisted even when isolating markings-only.
- In the road/city debugger view: markings were still visible.

**Key constraint**
- Gameplay asphalt uses custom PBR maps (normal/roughness), not the original “default” asphalt.

---

## Deterministic Reproduction (Headless)

### Command
- `npm run -s test:headless -- road_markings_visible.pwtest.js`

### What the test asserts
`tests/headless/e2e/road_markings_visible.pwtest.js` loads two scenarios and measures whether turning markings off changes pixels:
- `city_straight_road` (default city roads)
- `road_markings_textured_asphalt` (custom asphalt maps approximating gameplay; see `tests/headless/harness/scenarios/scenario_road_markings_textured_asphalt.js`)

The test:
1. Renders a stable baseline (waits until frame-to-frame pixel jitter settles).
2. Toggles both:
   - the `Markings` group visibility, and
   - the baked overlay materials (if present; via harness hook)
3. Computes a simple per-pixel RGB diff inside a “road area” ROI.
4. Requires `changedPixels > 500`.

### Pre-fix observed failure
- `city_straight_road` produced `changedPixels = 0` when markings were toggled off.
  - This means the markings toggle had *no effect on the rendered pixels*.

---

## Investigation Timeline (What We Tried / What It Proved)

### 1) Confirmed geometry exists (scene graph sanity)
We verified the expected marking objects existed and were marked visible:
- `Markings` (Group)
- `MarkingsWhite` (Mesh)
- `MarkingsYellow` (Mesh)
- `LaneArrows` (Mesh)

This ruled out “markings weren’t generated” and shifted focus to rendering.

### 2) Tested the obvious hypothesis: occlusion / depth / z-fighting
Given “markings appear when asphalt is hidden”, the initial hypothesis was:
- asphalt depth state / polygonOffset / low-angle depth precision is hiding markings

We attempted isolations that should have made markings unmistakably visible:
- hide asphalt and edge-wear meshes entirely,
- force markings to bright colors,
- disable depth testing on marking materials,
- raise render order.

**Result**
- In the failing scenario (`city_straight_road`), these did *not* cause pixel changes.

**Conclusion**
- The failure was likely *not* “markings render but are behind asphalt”.
- It looked like “markings don’t successfully render” (pipeline/program issue).

### 3) Captured browser console output during headless run
We listened to browser console errors/warnings during the failing headless test run and found:
- `THREE.WebGLProgram` shader compilation errors, followed by:
- WebGL errors like `useProgram: program not valid`

This directly explained the “scene objects exist but don’t change pixels” symptom.

---

## Root Cause (Load-Bearing Technical Details)

Multiple shader injections were breaking compilation on the target GLSL compiler, producing invalid programs.

### A) `AsphaltEdgeWearVisuals` referenced `vUv` without ensuring it exists

**File**
- `src/graphics/visuals/city/AsphaltEdgeWearVisuals.js`

**Observed error (representative)**
- `ERROR: ... 'vUv' : undeclared identifier`

**Why**
- Three.js only includes `varying vec2 vUv;` when the material enables UV usage (`USE_UV`).
- The edge-wear shader injection referenced `vUv` unconditionally.
- Default edge-wear materials (and some asphalt configs) may not bind any UV-dependent maps, so `USE_UV` is not defined → `vUv` is missing → compile fails.

**Fix**
- Force UV varyings for the injected program:
  - `mat.defines.USE_UV = 1` (added in `ensureAsphaltEdgeWearConfigOnMaterial(...)`)

### B) `AsphaltMarkingsNoiseVisuals` used a reserved/illegal GLSL identifier (`active`)

**File**
- `src/graphics/visuals/city/AsphaltMarkingsNoiseVisuals.js`

**Observed error (representative)**
- `ERROR: ... 'active' : Illegal use of reserved word`

**Why**
- The injected fragment shader used a local variable named `active`.
- On the target compiler (ANGLE/Chromium), this identifier is treated as reserved/illegal in that context.

**Fix**
- Rename the injected local variable:
  - `active` → `enabledFlag`

### C) Why this made markings “disappear”
Once any relevant program fails compilation:
- Three.js can still traverse/render, but WebGL rejects invalid programs.
- The scene may show only partial results, and expected draws (including markings) may not affect pixels.
- This can look like “depth issue” or “occlusion” even when it’s purely a shader compile failure.

### D) `onBeforeCompile` stacking caused duplicate declarations (`vAsphaltMarkingsWorldPos` redefinition)

**Files**
- `src/graphics/visuals/city/AsphaltMarkingsNoiseVisuals.js`
- `src/graphics/visuals/city/AsphaltEdgeWearVisuals.js` (same pattern)

**Observed error (representative)**
- `ERROR: ... 'vAsphaltMarkingsWorldPos' : redefinition`

**Why**
- The visuals were being re-applied repeatedly (e.g., while dragging options sliders) before the first successful compile finished.
- Each apply call wrapped `material.onBeforeCompile` again, so a single compilation would execute the injector multiple times.
- Each injector used `shader.*Shader.replace('#include <common>', '#include <common>\\n...')`, which is not inherently idempotent.
- The result was multiple identical `varying` declarations in the generated shader source.

**Fix**
- Make these shader injectors safe under rapid re-application:
  - Install `onBeforeCompile` only once per material (store an injected flag in `material.userData`).
  - Guard string injection so it only inserts blocks if they aren’t already present.

---

## Verification (Post-fix)

**Headless**
- `npm run -s test:headless -- road_markings_visible.pwtest.js` passes.
- `npm run -s test:headless -- gameplay_asphalt_markings_noise_no_shader_errors.pwtest.js` passes (options changes don’t produce shader compile errors).

**Gameplay**
- Road markings become visible again under the same asphalt/noise/edge-wear configuration.

---

## Why Road Debugger Still Looked OK

The road/debugger rendering path does not necessarily use the same injected shaders/material setup as gameplay/city. It uses its own mesh/material pipeline (often `MeshBasicMaterial`-style debug rendering), so shader injection failures in the asphalt visuals layer won’t reproduce there.

---

## Guardrails (Preventing Similar Regressions)

1. Don’t assume Three.js varyings exist:
   - If you reference `vUv`, either ensure `USE_UV` or inject your own varying/attribute path.
2. Avoid “common” GLSL identifiers:
   - Use prefixed names like `asphaltMarkingsEnabledFlag` to avoid collisions/reserved words.
3. For rendering regressions, treat shader errors as first-class:
   - Always capture browser console errors in headless tests; shader compile failures often masquerade as z-fighting/ordering issues.
4. Keep a deterministic pixel-diff toggle test for critical visuals:
   - `tests/headless/e2e/road_markings_visible.pwtest.js` is the regression guard for this issue.
