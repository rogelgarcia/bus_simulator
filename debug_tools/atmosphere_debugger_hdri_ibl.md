# Atmosphere Debugger: HDR background was black (and IBL did nothing)

## Summary

The standalone Atmosphere Debugger (`/debug_tools/atmosphere_debug.html`) showed a black HDR background, and the “IBL enabled” / “HDR background” toggles appeared to do nothing. The root cause was that our HDR loader used `RGBELoader.parse(...)` incorrectly: in the Three.js version we load (`three@0.160.0`), `parse()` returns **raw pixel data** (width/height/data), not a `THREE.Texture`. That caused PMREM generation to fail, leaving the scene with no environment map and a black background.

This was fixed by converting the parsed data into a `THREE.DataTexture` with the same settings as `RGBELoader.load(...)`, then feeding that texture into `PMREMGenerator.fromEquirectangular(...)`.

Later, gameplay-specific issues surfaced:
- Gameplay needed Atmosphere-style semantics: “IBL enabled” affects objects only, while “HDR background” affects only the background.
- Gameplay’s IBL probe sphere was reported as “black” even when the sky/background changed.

## What we expected vs what we saw

**Expected:**
- With “HDR background” enabled, the sky should show the HDRI (a visible dome/skybox).
- With “IBL enabled” enabled, reflective/metallic materials should reflect the environment and the scene should be lit by the HDRI.

**Observed:**
- Background stayed black even when “HDR background” was on.
- Metallic sphere reflections didn’t change when “IBL enabled” toggled.

## Root cause

### 1) `RGBELoader.parse()` does not return a `Texture` here

In `three@0.160.0`, `RGBELoader.parse(arrayBuffer)` returns an object like:

```js
{ width, height, data, header, gamma, exposure, type }
```

It is **not** a `THREE.Texture` (no `.isTexture`, no `.image`), so code that does:

```js
const hdr = loader.parse(buffer);
pmrem.fromEquirectangular(hdr);
```

will fail because PMREM expects a real `Texture` (`hdr.image.width` / `hdr.image.height`).

The failure mode looked like:

```
TypeError: Cannot read properties of undefined (reading 'width')
at PMREMGenerator._fromTexture(...)
```

Once HDR loading failed, the Atmosphere Debugger continued rendering the test scene, but `scene.background` and `scene.environment` were never set to valid textures — so the background stayed black and IBL had no effect.

### 2) Headless pixel sampling had a trap

The first headless test attempt used:

1) `ctx.drawImage(webglCanvas, ...)`
2) `ctx.getImageData(...)`

In headless Chromium this returned **all black**, even though the scene was visibly rendering (Playwright screenshots showed the floor).

For reliable headless verification we switched to **WebGL `readPixels`** instead, which reads directly from the WebGL backbuffer.

## Fix

### Convert parsed HDR data into a `THREE.DataTexture`

We added a small helper that builds a `DataTexture` from the `parse()` result:

- `flipY = true`
- `generateMipmaps = false`
- `minFilter = LinearFilter`, `magFilter = LinearFilter`
- `colorSpace = LinearSRGBColorSpace` (or legacy encoding)
- `mapping = EquirectangularReflectionMapping`
- `needsUpdate = true`

This matches the important defaults produced by `RGBELoader.load(...)`.

Applied in:
- `src/graphics/gui/atmosphere_debugger/AtmosphereDebuggerHdri.js`
- `src/graphics/engine3d/lighting/IBL.js` (shared IBL path also used `parse()`)

### Ensure PMREM env maps use CubeUV reflection mapping

To avoid “env map is set but reflections look black/incorrect” edge cases, we now explicitly set:

- `envMap.mapping = THREE.CubeUVReflectionMapping`

Applied in:
- `src/graphics/engine3d/lighting/IBL.js`
- `src/graphics/gui/atmosphere_debugger/AtmosphereDebuggerHdri.js`

## Headless regression test

We added a Playwright e2e test:

`tests/headless/e2e/atmosphere_debugger_hdri_ibl.pwtest.js`

It verifies two things using WebGL `readPixels`:

1) **HDR background toggle works**
   - Sample a few sky pixels with “HDR background” on → they must be non-black.
   - Toggle it off → sky pixels must be near-black.

2) **IBL toggle affects lighting**
   - Set `Sun intensity = 0` and `Hemi intensity = 0` to isolate IBL contribution.
   - Sample a floor pixel with IBL off → near-black.
   - Toggle IBL on → floor pixel luma increases.

Run it with:

```bash
npm run test:headless -- tests/headless/e2e/atmosphere_debugger_hdri_ibl.pwtest.js
```

## Gameplay note: IBL background needs the raw HDR texture (not PMREM)

The shared IBL system generates a **PMREM** environment map (prefiltered cubemap) for lighting/reflections, but the **background** should use the original **equirectangular HDR texture**. If gameplay only has the PMREM texture available, `scene.background` may remain `null` (or look wrong) and it can look like the sky/IBL toggles do nothing.

To make gameplay behave like the Atmosphere Debugger:
- Keep (or re-load) the raw HDR texture alongside the PMREM env map.
- When `setBackground` is enabled, set `scene.background` to that HDR texture.

Gameplay also needed to decouple background from IBL:
- “IBL enabled” toggles `scene.environment` (object lighting/reflections).
- “HDR background” toggles `scene.background` (sky only).

Previously, disabling IBL cleared the background because `applyIBLToScene(..., enabled: false)` clears `scene.background`. Gameplay now re-applies the HDR background (when enabled) even if IBL is off, matching Atmosphere Debugger behavior.

Headless check:

`tests/headless/e2e/gameplay_ibl_background.pwtest.js`

## Gameplay bug: IBL envMap was a function (not a Texture)

One of the trickiest gameplay regressions was: the **sky/background could change**, but the **probe sphere stayed black** (no HDR reflections), and the Options panel showed `Env mapping: -`.

The root cause was a subtle async mistake in the shared IBL loader (`loadIBLTexture(...)`):

- We assigned `entry.promise = (async () => { ... })` but **forgot to invoke it** (`()`)
- Because `loadIBLTexture` is itself `async`, the returned promise resolved to an **`AsyncFunction` object**
- That function object got stored as the “envMap” and applied to `scene.environment`, so:
  - `scene.background` worked (it uses the raw HDR texture path)
  - but IBL/reflections did nothing (envMap was not a `THREE.Texture`)

Fix: invoke the async IIFE so `entry.promise` is a real Promise:

```js
entry.promise = (async () => { ... })();
```

To make this easier to spot next time, the gameplay Options → Lighting → IBL Status section now also displays:
- `Env isTexture` / `Env type`
- `Probe env isTexture` / `Probe env type`

## Gameplay note: probe sphere expectations

Gameplay includes an IBL probe sphere (`ibl_probe_sphere`) as a quick “is the environment map working?” indicator.

- It reflects the **HDRI environment** (`scene.environment`), not the in-game buildings/roads (no raytraced reflections).
- It is attached to the bus anchor so it stays near the player camera.
- If it looks black, open Options → Lighting → IBL Status and check:
  - `Env map` is `Loaded`
  - `Scene.environment` is `Set`
  - `Probe envMap` is `Set (matches scene)`
  - `Probe envMapIntensity` matches the configured intensity
  - `Probe screen` is not marked `(off)`
  - `Probe visible` is `Yes` (ray-to-center check; if `No`, you’re sampling/looking through other geometry)

Headless check:

`tests/headless/e2e/gameplay_ibl_probe_reflection.pwtest.js`

## Debug checklist (if this ever regresses)

- Open `/debug_tools/atmosphere_debug.html` and check the console for HDR/PMREM errors.
- Confirm the HDR asset is present (not a Git LFS pointer). If it is a pointer, run `git lfs pull`.
- If you change Three.js versions, re-check `RGBELoader.parse()` return type and verify PMREM still accepts the texture you create.
- For headless verification, prefer `WebGLRenderingContext.readPixels` over `drawImage/getImageData` when sampling WebGL output.
- Some city/building materials intentionally disable auto IBL intensity (`iblNoAutoEnvMapIntensity` / `envMapIntensity = 0`). When isolating IBL (sun/hemi = 0), use the probe sphere (or another known PBR test mesh) instead of sampling building walls.
