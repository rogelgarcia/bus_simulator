# Physical lighting calibration (AI 564)

Runs independent analytical fixtures in Cycles and the actual GameEngine renderer, then checks raw radiance before ACESFilmic or AgX. Preserves the original Cornell measurements separately from synthetic references. Does not change city materials, presets, installed bake data or production publication gates.

## Run and reuse

Use the existing ignored `tools/baking/blender.local.json`: pinned Blender 5.2.1, `browserExecutable`, `pythonExecutable` with NumPy/OpenImageIO/PyOpenColorIO, and `renderDevice` (`OPTIX` or `CPU`). No machine paths are embedded in the tracked files. Reference acquisition needs access to Cornell and the archive URLs linked by its page; native captures use the harness's pinned Three.js import map.

```sh
node tools/bake.mjs --target lighting/experiments/physical-calibration
node tools/bake_lighting/experiments/physical_calibration/run.mjs --dry-run
node tools/bake.mjs --target lighting/experiments/physical-calibration/references
node tools/bake.mjs --target lighting/experiments/physical-calibration/prepare
node tools/bake.mjs --target lighting/experiments/physical-calibration/capture
node tools/bake.mjs --target lighting/experiments/physical-calibration/render
node tools/bake.mjs --target lighting/experiments/physical-calibration/analyze
```

Each leaf resolves and authenticates its own dependencies. Completed checkpoints reuse the exact prepared scene/captures. `--rebuild` executes a new run without overwriting prior evidence. New runs receive a hash and timestamp beneath `tests/artifacts/screens/ai564_physical_calibration/runs/`. An optional `--set lighting/experiments/physical-calibration/references:output=tests/artifacts/screens/ai564_physical_calibration/my-run` must name a new directory if rebuilding. Changed inputs or reference hashes require a new run/review; partial output is never a passing checkpoint.

Use `--samples 512 --device OPTIX` for a higher sample run. Defaults: 256 samples, two seeds per analytical fixture, 192×192 linear captures; three 384×384 monochromatic Cornell renders; one display-vector render. Four CPU threads, no adaptive sampling or denoising. Seed, fixtures, tolerances and projection are tracked in `defaults.json`, with `fixtures.schema.json` documenting the input contract.

The default Blender launch is an isolated headed process that exits after each stage. A preflight refuses to open it over another running Blender session. When a separate process is appropriate, explicitly set both `prepare:mode=background` and `render:mode=background` through `--set lighting/experiments/physical-calibration/prepare:mode=background` and the equivalent render option. Cancellation uses the shared framework to terminate only owned processes. The capture stage owns and closes its browser/server; it never attaches to the user's Chrome.

The experiment is outside `all`/production lighting defaults. `--publish` is rejected. Framework status `validated` means the evidence and handoffs are valid, **not** that every physical check passed. Consumers must read the contract's individual results and validity flags before promoting a reference.

## Stages and artifacts

| Stage | Tracked implementation | Output |
| --- | --- | --- |
| References | `References.mjs`, `reference_manifest.json` | Source HTML, original ZIP/MAT datasets, hashes/URLs/access notes, measured geometry/spectra/camera, frozen request |
| Prepare | `blender.py`, `scene.py` | Reusable `calibration.blend` containing all 23 scenes; `scene.json` |
| Capture | `Capture.mjs`, native `scenario_physical_lighting_calibration.js` | 20 native PNG/float32 buffers, renderer/GPU/version/scope and exact installed tone shader |
| Render | `blender.py` | 42 float multilayer EXRs, AgX native PNG, timings, seeds, Blender/GPU identity, OCIO config and LUT hashes |
| Analyze | `analyze.py`, `expectations.py`, `measured_reference.py`, `cornell_data.py` | `report/index.html`, comparison PNGs, raw measurements, shadow profiles, input/display/fault checks, `report/contract.json` |
| Complete | `Stages.mjs` | `execution.json` with acquisition-to-completion duration and report location |

Stage receipts authenticate file contents. External OCIO files participate in render identity and are rechecked by analysis. Screenshots, renders, measured bulk data and reports remain ignored. Curated reference definitions, scripts, test scenarios, defaults and documentation are tracked. The input schema is supplemented by boundary validation of source-specific quantities and unique IDs.

## Physical definitions

All analytical geometry uses metres, XY receiving surfaces with +Z normals and an orthographic camera at (0,0,4). The view spans 2×2 metres by default. Reflectance values are explicitly **linear**, not sRGB colors or exposure settings. Sun/point fixtures use native Lambert and Cycles Diffuse BSDF at zero roughness. The environment fixture uses native Physical material with metalness zero and specular intensity zero so a dielectric specular lobe does not contaminate the diffuse test.

| Fixture | Independent expectation | Renderer mapping |
| --- | --- | --- |
| Neutral/RGB, cosine | `L = rho E cos(theta) / pi` | Directional intensity / Cycles Sun energy both equal specified E; E=pi gives L=rho at normal incidence |
| Point at 2m/4m | `E(x,y) = I h / (x²+y²+h²)^(3/2)` | Three intensity I, decay=2/no cutoff; Cycles isotropic power 4pi I, radius zero |
| CIE 171 axis A | At axis, `E/I = 1/9`; I=1000, distance=3 | Geometric relationship from the accessible 5.2 table; no undocumented spectral watts-to-lux conversion |
| Uniform environment | `Lout = rho Lenv` | Constant World radiance / native PMREM; input 256×128 stays above the PMREM minimum cube size |
| Opaque visibility | Half-plane intersection with a directional ray | Black blocker, fixed light direction, known straight shadow boundary |
| Finite sun, five cases | Cosine-weighted visibility integral over a uniform solid-angle disc | Cycles Sun angle and native opt-in finite-sun adapter share the specified angular diameter; 0.12 radians at 0.3m/1m plus 0.06 at 0.6m, 0.18 at 0.7m and 0.00925 at 1m |

The finite-source integral uses a separate NumPy quadrature (64 radial ×256 azimuthal samples), with a 128-radial convergence diagnostic. The unmodified native PCF filter failed the far-gap fixture. Finite-source fixtures now explicitly select the shared [FiniteSunShadow runtime adapter](../../../../specs/graphics/finite_sun_shadow.md) with a native readable depth map, 32 blocker-search samples and 64 visibility samples. The game capture records this filter identity, angle and sample counts. This is an opt-in PCSS approximation; default gameplay and baked shadow filtering are not changed. Zero-angle calibration retains the native PCF control. No independent Radiance run was needed to resolve the supported analytical equations; production interreflection and material parity remain outside this test.

Ordinary radiance checks use the central `abs(x),abs(y)<0.08m` mask. Shadow checks use `x>0.02m, abs(y)<0.3m` to exclude the visible blocker. Error is compared with `absolute + relative*reference_RMS + 4*noise_RMS`; noise comes from the difference between two independent seeds divided by two (uncertainty estimate for their mean). Noise above 1% of `max(reference_RMS,0.01)` fails rather than relaxing the check indefinitely. These engineering tolerances were set before scoring: 0.0005 absolute, 1.5% relative; shadow absolute allowance 3.5% of reflectance for boundary pixel coverage. They are not a measurement uncertainty claim or a formal statistical confidence interval. Raw RMSE, energy ratio, masks, quadrature error and noise remain available for tighter later tests.

## Color and measured references

Scene linear is Rec.709/sRGB primaries with D65. Known 8-bit texture values receive the sRGB piecewise decode; linear material and HDR values receive none. Raw GPU float and Cycles EXR vectors include values up to 16. Known RGBE bytes test native HDRLoader and OpenImageIO to one quantization bin. Creative grading and auto-exposure are off. Exposure multiplier 1 equals +0 EV for presentation, with the installed Three ACESFilmic operator's own normalization preserved. A shader hash and revision pin that implementation; native output is compared to its separate CPU operator on nine vectors. AgX uses Blender's own OCIO config, no look, sRGB display, and compares Blender PNGs to OCIO's CPU transform. Display tolerance 0.0045 covers 8-bit quantization. This does not assert that Three ACESFilmic is the official full ACES color-management pipeline or that AgX is the same transform.

The [original Cornell dataset](https://bowers.cornell.edu/computer-graphics/data) is acquired with its actual non-ideal geometry, source opening, measured reflectances, camera and relative source spectrum. The manifest pins parsed numerical data and the five original linked ZIP/MAT files. HTML is hashed per acquisition because site wrappers can change. Three wavelength simulations (450/550/650nm) preserve the published relative emission scale without fitting exposure; they are synthetic monochromatic transport references, **not** color photos or absolute solar-power calibration.

The seven measured camera EXRs and camera/filter/lens/source response arrays are available. However, their pairing with the published diffuse scene is unverified: inspection shows an apparently reflective tall block and different photo framing. Spectral response also extends beyond the supplied 400–700nm surface reflectances. Until material/camera identity and spectral coverage are established, the report records measured comparison as **unavailable**, not pass/fail or missing downloads. All measured previews share a fixed gain 16 solely for inspection. No speculative registration, per-image normalization or measurement uncertainty is used to invent a physical score.

The [CIE 171:2006 publication](https://www.cie.co.at/publications/test-cases-assess-accuracy-lighting-computer-programs) supplies the formal framework. This implementation adapts only **5.2 on-axis point A**, from [the public AGi32 implementation report](https://www.agi32.com/Downloads/TechnicalDocs/Report%20on%20AGI%2032%20validation%20of%20CIE%20171_Compiled_070620.pdf), Table 7, page 18. Off-axis photometries and all other cases are omitted. No authoritative complete errata set was established, and there is no full CIE conformance/certification claim or paid-access prerequisite.

## Scope and handoff

The native scenario invokes the actual GameEngine WebGLRenderer/material/light/shadow/PMREM code. It deliberately isolates the compositor, AO, city bakes and grading. Cycles EXRs retain Combined, Diffuse Direct/Indirect/Color, Glossy Direct/Indirect and Emission channels. Native fixtures isolate light contributions by construction; they do not expose a deferred AOV pipeline or prove production GI. A diffuse constant-environment pass does not establish specular/rough-material export parity.

AI 565 can consume the verified scale and display checks to define coherent daylight. AI 566 must validate actual material/texture inputs and export parity. AI 567 must honor measurement eligibility and contract failure flags. AI 562 receives the verified opt-in finite-source filter plus the outstanding production shadow integration, GI, local visibility and material-parity work. No city setting is automatically “calibrated” by this suite.

## Verification

Use the selected-test runner with `tests/node/unit/physical_calibration.test.js` and `tests/node/unit/bake_framework.test.js`. The former includes input boundaries, authenticated evidence tampering, headed/headless environment cleanup, seven Python tests for independent equations, shadow-gap behavior, MAT decoding and negative controls. The executed report additionally verifies real GPU/Cycles data, HDR and display paths. Gamma, doubled light and half-scale injected errors must all be detected or analysis aborts.

`tests/headless/e2e/finite_sun_shadow.pwtest.js` verifies native filter lifecycle, angle/gap behavior, frustum/zoom/resolution edits, lit shader variants and GPU cost. Its independent timing/profile output is under `tests/artifacts/screens/ai564_physical_calibration/finite_sun_fix/`. Capture fails on browser shader/console errors as well as page exceptions. Runtime shader/module files participate in the bake-stage input hashes, so changing the filter cannot reuse an old passing capture.
