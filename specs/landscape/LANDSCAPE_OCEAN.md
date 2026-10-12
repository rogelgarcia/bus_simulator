# Landscape ocean (AI 597)

Status: D1 (spectral ocean surface) delivered 2026-10-12 on `codex/landscape`; D2–D7 pending (shore waves, foam,
swash, water light, inland water, acceptance). This page is the canonical contract of the animated sea of the landscape
viewer: what it is, how it is encoded and driven, how it integrates with the AI577 water optics and the AI 596 terrain,
and what it costs. Every number is copied from a receipt under `tests/artifacts/screens/landscape/ai597/` (paths given).

## 1. Contract

| Item | Value |
| --- | --- |
| Recipe | `landscape-ocean-v1` (`LANDSCAPE_OCEAN.id`, `src/graphics/engine3d/landscape/ocean/LandscapeOceanModel.js`) |
| Surface | `landscape-ocean-surface-v1` (`ocean_surface.vert.glsl` / `ocean_surface.frag.glsl`) drawn instead of the AI577 flat plane while `landscapeOcean=animated` (the default); `flat` keeps the AI577 reference plane (`landscape-water-surface-v1`) as the inspection surface |
| Authority | None. Sea level stays `coordinates.seaLevel` (Y = 0) for every query, pick, report and terrain shading; the ocean only replaces the drawn surface. The water reference keeps the optical water body (`lighting.water.opticalLevel`); the ocean's rings are never in the pick set (`pickPoint` sees only the authoritative tiles) |
| Residency | kind `landscape-ocean`: the view holds the whole share `LANDSCAPE_OCEAN.budgets` = 32 MiB CPU / 64 MiB GPU as one standing reservation in the shared ledger for its lifetime (`ensureOceanShare` → `createLandscapeOceanLedger` → `createLandscapeReservedShare`) whenever the budget is at least the shipped uncached profile (a smaller budget, such as the historical 128 / 64 and constrained 48 / 24 MiB evidence profiles, keeps every byte for the streams and reports the ocean `unavailable`), and the ocean's own entries (fields, spectra, geometry; 24.5 MiB GPU at medium) are accounted inside it, so a rebuild after a sea-state, quality or flat switch can never be denied by the streams, which expand into any free room within a frame (the D1 suite caught exactly that denial, first per resource and then for a share released on the flat switch). The shipped profiles grew by exactly the share, as they did for the surround: `LANDSCAPE_STREAMING_BUDGETS` 640 / 352 → 672 / 416 MiB, `LANDSCAPE_SURFACE_CACHE_BUDGETS` 640 / 544 → 672 / 608 MiB (748 and 1110 MiB at 2560 × 1440 and 3840 × 2160), `streamReserveGpuBytes` 352 → 416 MiB; the appearance ceilings follow (336 / 208 MiB) |
| Clock | `createLandscapeOceanClock`: `free` advances by the frame interval clamped to 0.1 s (never backwards); `fixed` moves only through `setTime` / `step`. `landscapeOceanTime=<s>` boots fixed at that time; `setOcean({clock:{mode,time,step}})` drives it; captures and clips are reproducible frame for frame. Every browser suite opens the viewer through `tests/shared/landscape_viewer_url.js`, which fixes the clock at `LANDSCAPE_TEST_OCEAN_TIME` seconds (default 30; `free` leaves it running), so pixel comparisons across visits, cache modes and reloads see the same sea |
| Viewer options | `landscapeOcean=animated\|flat`, `landscapeSeaState=calm\|moderate\|rough`, `landscapeOceanQuality=low\|medium\|high`, `landscapeOceanTime=<seconds>`; hooks `setOcean({surface, seaState, quality, clock})`, `oceanReadback(cascade)`, `setOceanDebug(view)`, `readFrame(region)`; `snapshot().ocean` (`mode` animated or flat, `status`, `seaState` and `quality` records, `clock`, `fields`, `simulation`, `surface`, `share`, `drawnLastFrame`) |
| Lighting switch | `uLandscapeOcean.x` (the 13th lighting uniform vector, `landscapeOceanUniformValue`) is 1 while the animated surface draws: the terrain's submerged fragments skip their flat-surface sun glint (`landscapeWaterGlint`), the ocean's facets carry it. y, z, w are reserved for the D4 swash and D5 caustic terms |

## 2. Model (D1)

The open sea is a sum of band-limited periodic cascades evolved on the GPU from a directional spectrum
(`LandscapeOceanSpectrum.js`, mirrored texel by texel by the GLSL in `chunks/landscape/ocean_spectrum.glsl`):

- **Dispersion** finite-depth, `ω² = g k tanh(k h)` at the sea state's representative depth (30 m, the shelf floor).
- **Wind sea** JONSWAP (Hasselmann et al. 1973): `α = 0.076 (U² / F g)^0.22`, `ω_p = 22 (g² / U F)^(1/3)`, γ 3.3, from the 10 m
  wind speed and the fetch; **swell** a narrow JONSWAP (γ 7) whose α is calibrated numerically so its deep-water Hs equals the
  preset (`landscapeOceanFrequencyVariance`).
- **TMA** finite-depth factor (Bouws et al. 1985) on both.
- **Spreading** Mitsuyasu `cos^2s(Δ/2) = ((1 + cos Δ) / 2)^s`, `s = s_p (ω/ω_p)^5` below and `(ω/ω_p)^-2.5` above the peak,
  `s_p = 11.5 (ω_p U / g)^-2.5` (clamped 1–60), Longuet-Higgins normalization through a Lanczos ln Γ. (The periodic form
  matters: a clamped cosine discontinues the spectrum along the upwind axis, caught by the Hermitian-pair unit test.)
- **Wave-vector density** `E(k) = S(ω) D(θ) (dω/dk) / k`; initial amplitudes `|h0(k)|² = E(k) dk² / 2` so the discrete
  variance of the real surface equals m0 (`Hs = 4 √m0` by construction; the GPU read-back of the moderate preset gives
  0.554 / 1.124 / 0.198 m per cascade against the model's 0.556 / 1.147 / 0.196 m, `d1/suite/ocean-suite.json`).
- **Phases** from an integer hash of the texel and the preset seed (deterministic on every device), Box–Muller Gaussian.
- **Cascades** (`landscapeOceanCascades`): cascade c keeps the wavelengths from 8 of its own texels up to 8 texels of the
  next coarser cascade, the coarsest keeps every longer wave (no wavelength twice, none dropped). Medium: patches 1600 /
  200 / 25 m at 256 texels (6.25 / 0.781 / 0.098 m texels; bands ≥ 50 m, 6.25–50 m, 0.78–6.25 m); high adds a 3.125 m
  ripple patch; low runs two cascades at 128 texels.
- **Evolution** `h(k,t) = h0 e^{iωt} + conj h0(−k) e^{−iωt}`, packed as `A = h + i Dx`, `B = Dz` (`Dx = −i kx/k h`,
  `Dz = −i kz/k h`, choppiness per cascade from the preset) so one complex FFT yields the height and both horizontal
  displacements; a radix-2 decimation-in-time inverse FFT over a butterfly table (`landscapeOceanButterfly`, checked
  against a direct DFT), the centred-spectrum sign `(−1)^(x+y)` in the last stage.
- **Derivatives** by central differences on the wrapped displacement texture: slopes of the horizontally displaced surface
  (`dh/dx / (1 + dDx/dx)`), the Jacobian `(1 + dDx/dx)(1 + dDz/dz) − dDx/dz dDz/dx` (folding below 1: the D3 whitecap
  source) and the squared slope magnitude whose mip average carries the filtered slope variance.

Sea-state presets (`LANDSCAPE_OCEAN_SEA_STATES`; headings are landscape headings the waves travel toward, the coast faces
west so the sea travels east): calm (U 3 m/s, fetch 15 km, swell 0.25 m / 8 s), moderate (U 7 m/s, 60 km, swell
0.6 m / 8.5 s), rough (U 12 m/s, 150 km, swell 1.5 m / 11 s); continuous Hs 0.34 / 1.29 / 3.17 m at medium quality
(`landscapeOceanSignificantWaveHeight`).

## 3. Runtime (D1)

| Part | Where | What |
| --- | --- | --- |
| Owner | `ocean/LandscapeOcean.js` `createLandscapeOcean` | resolves to a handle whatever happened (`active`, `unavailable` without float render targets, `failed` with a reason; inert handles hold nothing); loads the extent field, initializes the spectrum, links the surface program in parallel (`KHR_parallel_shader_compile`) while the flat reference keeps drawing, then hides the reference plane; `setSurround` binds the far field; `update({dt, camera})` once per frame before the render (clock, simulation batch under its own timer query, ring placement) |
| Fields | `ocean/LandscapeOceanField.js` | depth below sea level rasterized at texel centres from the saved chunks through the bounded loaders: the extent from the level-2 chunks (1024² at 3.906 m on coastal v3, 16 chunks, 240 ms) and the surround from its level-1 chunks (512² at 62.5 m, 4 chunks, 347 ms) as RGBA16F textures (8 + 1 MiB GPU, float32 rasters on the CPU); inside the landscape bounds the extent field answers, beyond them the surround's while a surround is active, elsewhere there is no sea (the AI 596 water extent contract) |
| Simulation | `ocean/LandscapeOceanSimulation.js` | one RGBA32F atlas (cascades × N by N) for h0 and two FFT ping-pong atlases, per-cascade RGBA16F wrapped displacement and derivative textures with mips, a butterfly DataTexture; per frame the time pass, `log2 N` horizontal and `log2 N − 1` vertical butterfly stages over the atlas, the last stage per cascade, the derivative pass per cascade: `2 log2 N + 2 cascades` single-output draws (22 at medium) of at most 3 N² fragments; `EXT_disjoint_timer_query_webgl2` around the batch; `readback(cascade)` for verification |
| Surface | `ocean/LandscapeOceanSurface.js` | a camera-snapped clipmap: one shared grid geometry (integer indices, quads split along one diagonal) drawn per ring; ring r has `ringCells` cells of `baseCell × 2^r`, its origin snapped to twice its cell (stable parity, no swimming), a hole where ring r − 1 lies (vertices strictly inside collapse to the hole edge), and a CDLOD morph over the outer 70–95 % of its half extent: odd vertices take the mean of their even neighbours sampled at the coarser mip, even vertices the coarser mip, so adjacent rings meet exactly. Rings double until the far plane (25 km): 11 rings of 128 cells at medium (360,448 triangles, 11 draws, 0.4 MB) |
| Shading | `ocean_surface.frag.glsl`, chunk `ocean_sampling.glsl` | normal from the filtered cascade slopes; GGX split-sum reflectance of the facet with the LEAN roughness (base Cox–Munk mean square slope of the unresolved part plus the slope variance the mips removed); reflected sky from the prefiltered map at a mip level that spreads the lookup by twice the removed slope deviation (the pixel sees the mean sky of its facets); a reflection that dips below the horizon resolves to the sea's upwelling colour; the sun glitter is Cox–Munk (Beckmann facet distribution, Schlick Fresnel, Smith masking) so it vanishes away from the mirror direction; composed in display space as the reference does (tone-mapped sky × reflectance + tone-mapped glint, premultiplied alpha = reflectance) over the terrain, which keeps the water column |
| Amplitude control | `ocean_sampling.glsl` | the spectral displacement fades with the local depth (`LANDSCAPE_OCEAN.depthFade`: 0 at 0.3 m, full at 4 m), so the beach and the far coast never see the open sea's amplitude (D2 replaces this band with the shoaling model); the swell cascade carries a world-space value-noise envelope (±35 % at 1.5 km) so its patch never repeats exactly |

## 4. Evidence (D1)

- Captures (fixed time 30 s, `tools/landscape_review/capture.mjs --ocean animated|flat --ocean-time 30`):
  `tests/artifacts/screens/landscape/ai597/d1/animated/` and `d1/flat/` (NW-09, NW-10, NW-11, NW-12), composites under
  `d1/composites/`.
- Suite `tests/headless/e2e/landscape_ocean.pwtest.js` (receipt `d1/suite/ocean-suite.json`): status, fields, draws, residency
  share, per-cascade Hs read-back, identical pixels at a fixed time / different after a step / identical when restored, picking
  through the sea, hide/show, flat switch and back, sea-state switch, disposal to zero.
- Motion: `tools/landscape_review/clip.mjs` clips under `d1/clips/` with per-frame stability statistics.
- Periodicity: `tools/landscape_review/periodicity.py` receipts under `d1/`.
- Unit tests: `tests/node/unit/landscape_ocean_model.test.js` (presets, bands, rings, clock, share, spectrum, FFT table,
  Hermitian pairs, field raster).

## 5. Known limitations after D1

- No shoaling, refraction or breaking: the amplitude simply fades below 4 m of depth (D2).
- No foam, swash or wet-sand lag (D3, D4); the AI577 static wet band is unchanged.
- The sky reflection is the prefiltered calibrated sky only (no terrain reflection, D5); the water colour and refraction
  of the seabed are the terrain's AI577 column (D5 refines them).
- The far-field sea over the surround damps near the far coast from a 62.5 m depth raster: the far shoreline is coarse.
- The bathymetry fields are rasterized per load, not per edit: an accepted terrain edit leaves the depth fade (and the D2 shore fields)
  stale until the next load, while picking, queries and the terrain itself are current (`snapshot().ocean.settled` waits only for the
  far-field binding).
- Performance is measured in D7 with the same-condition tables; D1 reports the simulation batch's own GPU time and the
  surface program's compile time in `snapshot().ocean`.
