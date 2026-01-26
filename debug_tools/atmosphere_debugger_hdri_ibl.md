# Atmosphere Debugger: HDR background was black (and IBL did nothing)

## Summary

The standalone Atmosphere Debugger (`/debug_tools/atmosphere_debug.html`) showed a black HDR background, and the “IBL enabled” / “HDR background” toggles appeared to do nothing. The root cause was that our HDR loader used `RGBELoader.parse(...)` incorrectly: in the Three.js version we load (`three@0.160.0`), `parse()` returns **raw pixel data** (width/height/data), not a `THREE.Texture`. That caused PMREM generation to fail, leaving the scene with no environment map and a black background.

This was fixed by converting the parsed data into a `THREE.DataTexture` with the same settings as `RGBELoader.load(...)`, then feeding that texture into `PMREMGenerator.fromEquirectangular(...)`.

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

Headless check:

`tests/headless/e2e/gameplay_ibl_background.pwtest.js`

## Debug checklist (if this ever regresses)

- Open `/debug_tools/atmosphere_debug.html` and check the console for HDR/PMREM errors.
- Confirm the HDR asset is present (not a Git LFS pointer). If it is a pointer, run `git lfs pull`.
- If you change Three.js versions, re-check `RGBELoader.parse()` return type and verify PMREM still accepts the texture you create.
- For headless verification, prefer `WebGLRenderingContext.readPixels` over `drawImage/getImageData` when sampling WebGL output.
