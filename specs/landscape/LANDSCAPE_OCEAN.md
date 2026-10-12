# Landscape ocean (AI 597)

Status: D1 (spectral ocean surface) and D2 (depth-aware shore waves) delivered 2026-10-12 on `codex/landscape`; D3–D7
pending (foam, swash, water light, inland water, acceptance). This page is the canonical contract of the animated sea of the landscape
viewer: what it is, how it is encoded and driven, how it integrates with the AI577 water optics and the AI 596 terrain,
and what it costs. Every number is copied from a receipt under `tests/artifacts/screens/landscape/ai597/` (paths given).

## 1. Contract

| Item | Value |
| --- | --- |
| Recipe | `landscape-ocean-v1` (`LANDSCAPE_OCEAN.id`, `src/graphics/engine3d/landscape/ocean/LandscapeOceanModel.js`) |
| Surface | `landscape-ocean-surface-v1` (`ocean_surface.vert.glsl` / `ocean_surface.frag.glsl`) drawn instead of the AI577 flat plane while `landscapeOcean=animated` (the default); `flat` keeps the AI577 reference plane (`landscape-water-surface-v1`) as the inspection surface |
| Authority | None. Sea level stays `coordinates.seaLevel` (Y = 0) for every query, pick, report and terrain shading; the ocean only replaces the drawn surface. The water reference keeps the optical water body (`lighting.water.opticalLevel`); the ocean's rings are never in the pick set (`pickPoint` sees only the authoritative tiles) |
| Residency | kind `landscape-ocean`: the view holds the whole share `LANDSCAPE_OCEAN.budgets` = 48 MiB CPU / 64 MiB GPU (32 / 64 in D1; D2 added the shore channels) as one standing reservation in the shared ledger for its lifetime (`ensureOceanShare` → `createLandscapeOceanLedger` → `createLandscapeReservedShare`) whenever the budget is at least the shipped uncached profile (a smaller budget, such as the historical 128 / 64 and constrained 48 / 24 MiB evidence profiles, keeps every byte for the streams and reports the ocean `unavailable`), and the ocean's own entries (fields, spectra, geometry; 24.5 MiB GPU at medium) are accounted inside it, so a rebuild after a sea-state, quality or flat switch can never be denied by the streams, which expand into any free room within a frame (the D1 suite caught exactly that denial, first per resource and then for a share released on the flat switch). The shipped profiles grew by exactly the share, as they did for the surround: `LANDSCAPE_STREAMING_BUDGETS` 640 / 352 → 672 / 416 MiB, `LANDSCAPE_SURFACE_CACHE_BUDGETS` 640 / 544 → 672 / 608 MiB (748 and 1110 MiB at 2560 × 1440 and 3840 × 2160), `streamReserveGpuBytes` 352 → 416 MiB, and D2 raised the CPU profiles 672 → 688 MiB with the 48 MiB CPU share; the appearance ceilings follow (336 / 208 MiB) |
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

## 2b. Shore model (D2)

Inside the landscape extent the swell of the sea state becomes one coherent shore train marched over the bathymetry on
the CPU (`ocean/LandscapeOceanShore.js`, pure: bit-identical in Node and in the browser, so
`tools/landscape_review/shore_statistics.mjs` tabulates the same numbers offline) and drawn by the surface programs on
top of the spectral cascades (`chunks/landscape/ocean_shore.glsl`):

- **Inputs** the extent depth raster (the level-2 chunks, 1024² at 3.906 m on coastal v3), the preset's swell period and
  heading, the sea state's continuous Hs as the deep height (0.34 / 1.29 / 3.17 m calm / moderate / rough), the breaking
  index γ 0.78 (McCowan), the source depth 0.5 × the deep-water wavelength (56 m at 8.5 s; v3's floor is 30 m, so the
  deepest 1 % of the water, 9 658 texels at 30 m, seeds the march) and the coast's rock mask (`landscapeOceanShoreInputs`).
- **Shore distance** an exact signed Euclidean distance transform (Felzenszwalb–Huttenlocher, 51 ms at 1024²), positive in
  water.
- **Phase speed** `ω² = g k tanh(k h)` inverted per texel (Guo 2002 start, guarded Newton to 1e-14), `c = ω/k`, `cg` from
  the dispersion; a 0.05 m depth floor; land is a wall.
- **Travel time** fast marching (binary heap ordered by (T, index), four-neighbour upwind quadratic update) from the
  plane-wave sources `T = (x·d) / c_deep`; the crests turn toward the shore normal by construction (Snell's law is the
  eikonal equation).
- **Height** the energy flux `E = H² cg` is transported along the characteristic (each earlier neighbour weighted by its
  time lag, the first-order upwind transport; a plain minimum ran grid-aligned shadow corridors) and capped at
  `(γ h)² cg(h)` on sand: the capped texels are the breaking mask (the surf zone), the cap is carried downstream so bars
  and reefs shadow the water behind them, and the wave reforms where the floor drops. Rock (platform, bluff toe) is
  never capped and never breaks (it surges).
- **Land fill** the travel time of every land or unreached texel copies the nearest marched value breadth first
  (`landscapeOceanShoreFill`), so the GPU's bilinear lookup never bleeds a sentinel into the water; the height stays 0
  over land.
- **Statistics** (`snapshot().ocean.shore.statistics`, the D2 gate): the crest angle (the line angle between `∇T` and
  `∇ shore distance`) over the breaking texels of the beach zones (surf and swash; reef edges and bars break obliquely to
  the main shoreline), the breaking-depth quantiles, and the breaking texels per coastal zone
  (`landscapeOceanCoastZoneBreaking`).
- **Coast classes** (`ocean/LandscapeOceanCoast.js`): rock = `platform` ∪ `bluff-toe`, exposure = the geology sidecar's
  `waveExposure` on the `bar`, `surf` and `swash` zones (nearest sample at the texel centre, filled to every texel from
  the nearest defined shore), from the level-2 pages of `geology/manifest.json` beside the landscape manifest; a missing
  or unbound sidecar yields the neutral coast (no rock, full exposure) and is recorded, never a failed ocean.
- **GPU encoding** the extent field becomes RGBA16F (depth, shore distance, wave height, exposure) plus RG32F (travel
  time, rock − 8 over land) with linear filtering (`OES_texture_float_linear`; nearest otherwise,
  `fields.extent.linearFiltering`); the float depth raster and the zone labels stay on the CPU for the sea-state
  recompute (21 bytes per texel, `LANDSCAPE_OCEAN.fields`), the surround keeps its RGBA16F depth.
- **Drawing** phase `ω (t − T)`; amplitude `H / 2` × a group envelope (1 ± 0.35 over 7 swell periods, riding with the
  phase) × a longshore value-noise variation (±0.25 at 90 m) × the exposure damping (toward 0.4 for a fully sheltered
  shore, full within 60 m of the waterline, none beyond 220 m) × the weight `1 − smoothstep(7.2 m, 18 m, depth)`, the
  complement of the swell cascade's fade, so the open sea hands over once; the profile `cos s + ½ sharpen cos 2s` with
  `s = φ + 0.7 bore cos φ` (the front face compresses into a bore where `H / (γ h)` passes 0.8 on sand) and the Stokes
  sharpening `0.6 H / (γ h)`; a Gerstner orbital displacement `0.8 a sin φ` along `∇T` that fades out in the last metre
  of depth (the run-up is D4's swash); on rock 0.4 of the train reflected (a standing component) and the height capped at
  `2 γ h + 0.25 m`. The train is band-limited like the cascades (`texelsPerWavelength` 8): a vertex grid coarser than an
  eighth of the local wavelength stops displacing (and the displacement morphs with the rings), a pixel footprint wider
  than that stops tilting the facet and hands the train's mean square slope `(a k)² / 2` to the LEAN roughness.
- **Cascade fades** (`landscapeOceanCascadeFade`): a cascade is full above a tenth of its longest wavelength (18 m for the
  unbounded swell cascade) and gone at 0.4 × that depth: 7.2–18 m, 2–5 m and 0.25–0.625 m at medium quality.

On coastal v3 (`tests/artifacts/screens/landscape/ai597/d2/shore/statistics.json`, calm / moderate / rough): crest angle
mean 10.8 / 10.0 / 9.8° (p90 24 / 23 / 22°); breaking depth p90 0.65 / 2.03 / 4.57 m against `H / γ` 0.44 / 1.65 /
4.07 m (the deepest breaking texel 0.72 / 2.18 / 5.12 m: the shoaled height exceeds the deep height); breaking share of the
bar 0 / 3.5 / 53 %, the reef 0 / 7.6 / 43.5 %, the surf 0 / 49 / 52 %, the swash 29 / 44 / 44 % (of all its texels, dry ones
included), the open-sea zone 0 / 0 / 4.6 % (its shoals above 5 m), the platform and the bluff toe 0 % (every rock texel of v3 lies 0.4–10 m above sea level, so the rock surge is exercised by the unit tests
only); the march takes 165–190 ms plus the 51 ms distance transform and the 8–21 ms fill, yielding to the frame loop
every 65 536 texels.

## 3. Runtime (D1, D2)

| Part | Where | What |
| --- | --- | --- |
| Owner | `ocean/LandscapeOcean.js` `createLandscapeOcean` | resolves to a handle whatever happened (`active`, `unavailable` without float render targets, `failed` with a reason; inert handles hold nothing); loads the extent field, initializes the spectrum, links the surface program in parallel (`KHR_parallel_shader_compile`) while the flat reference keeps drawing, then hides the reference plane; `setSurround` binds the far field; `update({dt, camera})` once per frame before the render (clock, simulation batch under its own timer query, ring placement) |
| Fields | `ocean/LandscapeOceanField.js` | depth below sea level rasterized at texel centres from the saved chunks through the bounded loaders: the extent from the level-2 chunks (1024² at 3.906 m on coastal v3, 16 chunks, 240 ms) and the surround from its level-1 chunks (512² at 62.5 m, 4 chunks, 347 ms) as RGBA16F textures (8 + 1 MiB GPU, float32 rasters on the CPU); inside the landscape bounds the extent field answers, beyond them the surround's while a surround is active, elsewhere there is no sea (the AI 596 water extent contract) |
| Simulation | `ocean/LandscapeOceanSimulation.js` | one RGBA32F atlas (cascades × N by N) for h0 and two FFT ping-pong atlases, per-cascade RGBA16F wrapped displacement and derivative textures with mips, a butterfly DataTexture; per frame the time pass, `log2 N` horizontal and `log2 N − 1` vertical butterfly stages over the atlas, the last stage per cascade, the derivative pass per cascade: `2 log2 N + 2 cascades` single-output draws (22 at medium) of at most 3 N² fragments; `EXT_disjoint_timer_query_webgl2` around the batch; `readback(cascade)` for verification |
| Surface | `ocean/LandscapeOceanSurface.js` | a camera-snapped clipmap: one shared grid geometry (integer indices, quads split along one diagonal) drawn per ring; ring r has `ringCells` cells of `baseCell × 2^r`, its origin snapped to twice its cell (stable parity, no swimming), a hole where ring r − 1 lies (vertices strictly inside collapse to the hole edge), and a CDLOD morph over the outer 70–95 % of its half extent: odd vertices take the mean of their even neighbours sampled at the coarser mip, even vertices the coarser mip, so adjacent rings meet exactly. Rings double until the far plane (25 km): 11 rings of 128 cells at medium (360,448 triangles, 11 draws, 0.4 MB) |
| Shading | `ocean_surface.frag.glsl`, chunk `ocean_sampling.glsl` | normal from the filtered cascade slopes; GGX split-sum reflectance of the facet with the LEAN roughness (base Cox–Munk mean square slope of the unresolved part plus the slope variance the mips removed); reflected sky from the prefiltered map at a mip level that spreads the lookup by twice the removed slope deviation (the pixel sees the mean sky of its facets); a reflection that dips below the horizon resolves to the sea's upwelling colour; the sun glitter is Cox–Munk (Beckmann facet distribution, Schlick Fresnel, Smith masking) so it vanishes away from the mirror direction; composed in display space as the reference does (tone-mapped sky × reflectance + tone-mapped glint, premultiplied alpha = reflectance) over the terrain, which keeps the water column |
| Amplitude control | `ocean_sampling.glsl` | each cascade's spectral displacement fades with the local depth (`landscapeOceanCascadeFade` in `uOceanCascadeInfo.zw`: 7.2–18 m, 2–5 m and 0.25–0.625 m at medium; D1 ran one 0.3–4 m band for every cascade), so the beach and the far coast never see the open sea's amplitude and the D2 shore train takes the swell over below 18 m; the swell cascade carries a world-space value-noise envelope (±35 % at 1.5 km) so its patch never repeats exactly |
| Shore march (D2) | `ocean/LandscapeOceanShore.js`, `LandscapeOcean.js` `marchShore` | after the extent field and the coast load, `computeLandscapeOceanShore` marches the sea state's swell over the depth raster in slices of 65 536 accepted texels that yield to the frame loop (the ocean reports `active` once it is done, 0.9 s on coastal v3 with the 240 ms field raster), fills the land side of the travel time and counts the breaking texels per coastal zone; a sea-state switch (`setSeaState`, awaited by the view's `setOcean`) re-initializes the spectrum at once and marches the shore again in the background, swapping the travel time and the wave height into the textures when done (`snapshot().ocean.settled` and `.shore.settled` wait for it; a superseded march is dropped) |
| Coast (D2) | `ocean/LandscapeOceanCoast.js` | loads `geology/manifest.json` beside the landscape manifest through the bounded geology loaders (the sidecar is bound to the landscape, its level-2 pages hashed), samples the coastal zone label and the wave exposure nearest at the field's texel centres (16 pages, 5 419 rock and 41 027 exposure texels on v3), reports staleness against the terrain revision; a missing or unbound sidecar yields the neutral coast with the reason in `snapshot().ocean.shore.coast` |
| Shore pass (D2) | `chunks/landscape/ocean_shore.glsl` in both surface programs | the vertex program adds the train's displacement to the cascade sum inside the CDLOD morph (odd vertices take the mean of their even neighbours at the coarser cell, like the cascades, so the rings stay watertight); the fragment program adds its analytic slope to the filtered cascade slopes and its unresolved mean square slope to the LEAN roughness; `uOceanTime` carries the clock each frame (`surface.update(camera, time)`), `setShore` the train's angular frequency and group period; a facet tilted away from a grazing view bends its normal toward the eye instead of switching to the underwater branch (the D1 branch painted the backs of steep crests as the sea's underside); debug view 8 shows the weight, the crest sharpening and the bore strength |

## 4. Evidence (D1, D2)

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
- D2 (`tests/artifacts/screens/landscape/ai597/d2/`, README.md there): gate captures `d2/animated/` (NW-12, NW-10, NW-09, NW-01),
  the shore poses `d2/shore_poses/` (OS-01..OS-05, `tools/landscape_review/poses/ocean-shore-v1.json`), the shore verification view
  `d2/debug8/` (`--ocean-debug 8`), composites `d2/composites/` (NW-12 against the R09 substitute, NW-01 against the R08 substitute,
  NW-10, OS-01, OS-03), the offline statistics `d2/shore/statistics.json` (`shore_statistics.mjs`), the suite receipt
  `d2/suite/shore-suite.json` (the D2 test of `landscape_ocean.pwtest.js`: field bytes, coast, inputs, the gate statistics per sea
  state, surf determinism at NW-12, debug view, the deterministic march, disposal), clips `d2/clips/`, the paired GPU measurement
  `d2/perf/` and the regression logs `d2/regressions/`; unit tests `landscape_ocean_shore.test.js`, `landscape_ocean_coast.test.js`.

## 5. Known limitations after D2

- The shore wave is one monochromatic train (the swell period at the sea state's Hs): the wind sea's shorter waves fade
  below their own shoaling depth without breaking; the group envelope rides with the phase speed (sets do not travel at
  the group velocity); reef shadows spread by first-order upwind transport, not by a diffraction model; breaking is the
  depth-limited `γ h` cap only (no steepness-limited whitecapping offshore, which is D3's Jacobian source); the exposure
  damping is a near-shore multiplier, not a source-side one.
- The rock surge (uncapped height, 0.4 reflected, no bore) is exercised on synthetic rasters only: every `platform` and
  `bluff-toe` texel of coastal v3 lies 0.4–10 m above sea level, so the sea never reaches rock there.
- At the waterline a crest can wash a few metres over low sand as a displaced water surface above the beach until D4
  shapes the swash; without foam (D3) the breaking fronts read as dark faces.
- The train stops at the landscape extent: the surround's coast keeps the D1 depth fade only.
- No foam, swash or wet-sand lag (D3, D4); the AI577 static wet band is unchanged.
- The sky reflection is the prefiltered calibrated sky only (no terrain reflection, D5); the water colour and refraction
  of the seabed are the terrain's AI577 column (D5 refines them).
- The far-field sea over the surround damps near the far coast from a 62.5 m depth raster: the far shoreline is coarse.
- The bathymetry fields are rasterized per load, not per edit: an accepted terrain edit leaves the depth fade (and the D2 shore fields)
  stale until the next load, while picking, queries and the terrain itself are current (`snapshot().ocean.settled` waits only for the
  far-field binding).
- Performance is measured in D7 with the same-condition tables; D1 reports the simulation batch's own GPU time and the
  surface program's compile time in `snapshot().ocean`.
