# Landscape ocean (AI 597)

Status: D1 (spectral ocean surface), D2 (depth-aware shore waves), D3 (foam lifecycle) and D4 (swash and wet beach) delivered
2026-10-12, D5 (water colour, refraction and light) 2026-10-14, D6 (inland water) closed 2026-10-14 with no inland water published,
D7 (integrated acceptance) delivered 2026-10-14 on `codex/landscape`: the prompt is DONE. This page is the canonical contract of the animated sea of the landscape
viewer: what it is, how it is encoded and driven, how it integrates with the AI577 water optics and the AI 596 terrain,
and what it costs. Every number is copied from a receipt under `tests/artifacts/screens/landscape/ai597/` (paths given).

## 1. Contract

| Item | Value |
| --- | --- |
| Recipe | `landscape-ocean-v1` (`LANDSCAPE_OCEAN.id`, `src/graphics/engine3d/landscape/ocean/LandscapeOceanModel.js`) |
| Surface | `landscape-ocean-surface-v1` (`ocean_surface.vert.glsl` / `ocean_surface.frag.glsl`) drawn instead of the AI577 flat plane while `landscapeOcean=animated` (the default); `flat` keeps the AI577 reference plane (`landscape-water-surface-v1`) as the inspection surface |
| Authority | None. Sea level stays `coordinates.seaLevel` (Y = 0) for every query, pick, report and terrain shading; the ocean only replaces the drawn surface. The water reference keeps the optical water body (`lighting.water.opticalLevel`); the ocean's rings are never in the pick set (`pickPoint` sees only the authoritative tiles) |
| Residency | kind `landscape-ocean`: the view holds the whole share `LANDSCAPE_OCEAN.budgets` = 48 MiB CPU / 80 MiB GPU (32 / 64 in D1; D2 added the shore channels, D4 the swash sheet's native beach band) as one standing reservation in the shared ledger for its lifetime (`ensureOceanShare` → `createLandscapeOceanLedger` → `createLandscapeReservedShare`) whenever the budget is at least the shipped uncached profile (a smaller budget, such as the historical 128 / 64 and constrained 48 / 24 MiB evidence profiles, keeps every byte for the streams and reports the ocean `unavailable`), and the ocean's own entries (fields, spectra, geometry; 24.5 MiB GPU at medium) are accounted inside it, so a rebuild after a sea-state, quality or flat switch can never be denied by the streams, which expand into any free room within a frame (the D1 suite caught exactly that denial, first per resource and then for a share released on the flat switch). The shipped profiles grew by exactly the share, as they did for the surround: `LANDSCAPE_STREAMING_BUDGETS` 640 / 352 → 672 / 416 MiB, `LANDSCAPE_SURFACE_CACHE_BUDGETS` 640 / 544 → 672 / 608 MiB (748 and 1110 MiB at 2560 × 1440 and 3840 × 2160), `streamReserveGpuBytes` 352 → 416 MiB, D2 raised the CPU profiles 672 → 688 MiB with the 48 MiB CPU share and D4 the GPU profiles 416 → 432 and 608 → 624 MiB (764 and 1126 at 2560 × 1440 and 3840 × 2160) with the 80 MiB GPU share; the appearance ceilings follow (336 / 208 MiB) |
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

## 2c. Foam model (D3)

Foam is a lifecycle state over the extent plus an instantaneous term per fragment (`ocean/LandscapeOceanFoam.js`,
`materials/landscape/ocean_foam.frag.glsl`, `chunks/landscape/ocean_foam.glsl`, constants `LANDSCAPE_OCEAN.foam`):

- **State** a ping-pong RG16F raster at the extent field's resolution (1024², 3.906 m on coastal v3; 8 MiB in the share):
  `r` the foam density on the water, `g` on the sand the foam **supply** the swash can leave (since D4: the water foam at the
  texel's nearest waterline, taken as each crest arrives there; the AI 597 D4 swash sheet places the foam it draws from it with
  its own run-up cycles, §2d). One full-screen pass advances it by a fixed step of 1/30 s, sharing the surface's uniforms so it
  reads the same fields, train and cascades.
- **Step** both channels decay (`e^(−dt/τ)`, τ 6 s on the water, 25 s on the sand); the water channel is advected against a
  0.3 m/s shoreward drift along the train (semi-Lagrangian) and blended 15 % with its four neighbours; the sources of the step,
  rates per second capped so a texel saturates at 1: the **breaker band** at the bore front of the shore train (`bore ×
  cos⁴(φ + 0.6)`, rate 0.6), **whitecaps** where the spectral surface folds (`smoothstep(0.55, 0.8, 1 − J)` of a point sample of
  the full-resolution minimum cascade Jacobian under the depth fades, `oceanFoldingAt`, rate 0.15, filling a texel to half at
  most so a streak stays lacy), the **shoreline line** where each crest reaches the last 6 m of water (rate 0.3); on the sand of the swash
  band (100 m inland, `LANDSCAPE_OCEAN.swash.landMeters`) the supply channel takes the water foam at the texel's nearest waterline
  (2 m past it along the shore distance's gradient) as each crest arrives there (the land side of the shore field carries the
  waterline's travel time, so the phase is defined there) and keeps the larger of that and its decayed value (D4; the D3 deposit
  rate of 0.6 within 8 m saturated the whole band).
- **Schedule** (`landscapeOceanFoamSchedule`, pure): the clock's time is split into fixed steps with a carried remainder; a time
  the steps cannot reach within 4 steps (no last time, a time before the last one, a jump such as `setClock`, a long frame)
  restarts the state from zero 12 s earlier and steps up to it (360 steps, 1.9 ms of GPU submission), so the state at a fixed
  time is the same function of that time on every run; a sea-state switch restarts it the same way.
- **Drawing** the fragment's density is the state (bilinear) plus its own breaker front (`0.9 × bore × cos⁶(φ + 0.6)`) and
  folding (`0.6 × smoothstep` of its full-resolution folding); the coverage is `smoothstep(edge, edge + 0.3, density)` with
  `edge = 0.22 + 0.9 (1 − pattern)` against a world-space procedural pattern (value noise at 9.6 and 2.4 m for the patches, ridged
  noise at 2.4 and 0.6 m for the lace, a 0.15 m bubble octave that fades with the pixel footprint: no texture, no tiling, the
  same pattern on every device). Foam is a Lambertian layer (albedo 0.85) under the sun irradiance with the terrain's sun
  visibility and the sky irradiance of the facet, hazed like the water, composed over the water's radiance by its coverage, and
  it raises the fragment's alpha to opaque. Debug view 9 shows the density, the coverage and the sand's supply.
- **Numbers** (`tests/artifacts/screens/landscape/ai597/d3/foam_statistics.json`, the state's covered fraction per coastal zone at
  30 s, calm / moderate / rough): offshore 0 / 0 / 6.9 %, reef 0 / 5.3 / 45.5 %, bar 0 / 17 / 56 %, surf 0 / 56 / 58 %, swash
  15.6 / 37.9 / 38.5 % (the calm sea's 0.34 m swell foams only on the swash line); whole extent 0.2 / 1.8 / 4.3 %.

## 2d. Swash and wet beach (D4)

The run-up, the backwash and the wet beach are a thin sheet drawn over the sand the terrain renders (`ocean/LandscapeOceanSwashBand.js`
pure, `ocean/LandscapeOceanSwash.js` runtime, `materials/landscape/ocean_swash.vert/frag.glsl`, chunk `chunks/landscape/ocean_swash.glsl`,
constants `LANDSCAPE_OCEAN.swash`). The terrain program has no sampler or uniform left for a wet state, so the sheet carries the AI577
D5 calibrated wet surface in time and the terrain hands its static coastal wetting to it while the sheet draws (`uLandscapeOcean.y`,
`landscapeCoastalWetSurface(..., reach × (1 − uLandscapeOcean.y))`, `LandscapeLighting.setOceanSurface(animated, swash)`).

- **Band** the native beach samples (the hierarchy's finest level, `manifest.grid.maxLevel`; the coarser levels differ from them by
  3 cm on average and up to 1.8 m at the bluff steps, so nothing coarser can sit on the sand) whose shore distance lies between 6 m
  into the water and 100 m inland and whose height between 1.5 m below and 2.5 m above sea level: on coastal v3 29 chunks, 344 669
  vertices (grid column, height in millimetres, grid row as 16-bit integers; centimetres staircased the film front along the grid),
  665 348 triangles, 6.06 MB, loaded beside the shore march in 0.3–0.4 s; one mesh per chunk with a bounding sphere, premultiplied,
  no depth write, drawn before the rings, never picked (picking reads the terrain meshes only). The vertex program lifts the sheet
  3 cm over the sand plus 4 mm per metre of distance (2 mm until 2026-10-14: from 70 m up the coarser terrain level still rose through
  the sheet in small hollows and the front band ringed the holes), so the far band never fights the coarser terrain levels for depth, and
  seaward of the waterline sinks it 30 cm per metre of depth below the still water, so it never pokes up through a trough of the sea.
- **Arrival** the train's crest reaches the waterline at phase 0; the sand follows its nearest waterline texel's travel time, read 2 m
  past the waterline along the gradient of the exact shore distance and averaged over the 3 × 3 texels there (the marched time has local
  maxima in the inner corners of the raster's staircased waterline; the breadth-first copy of the land side forms Manhattan arcs the front
  would otherwise follow).
- **Run-up** Stockdon et al. (2006) R2 of the sea state's swell, `1.1 (0.35 β √(H L) + 0.5 √(H L (0.563 β² + 0.004)))`, with H the
  continuous significant height, L the deep-water swell wavelength (`√(H L)` 12.05 m moderate) and β the foreshore slope of the longshore
  position: the field's sand height 8 m inland of the waterline over those 8 m, averaged along the shore, between a 0.02 floor and 14° (a
  local slope turns a berm face into metres of run-up and a raster texel's centre into none), scaled wave by wave by the train's group
  envelope, its longshore variation and the shore exposure like the train itself.
- **Cycle** `u = fract(lag / period)` runs the sheet's front up to `R sin(π u) / β` metres inland of the waterline along the shore distance
  averaged over 3 × 3 texels (a smooth offset of the shoreline; until 2026-10-14 the native sand's height placed the front, and every
  hummock on the foreshore then wore a ring of foam, each remembered run-up its own nested ring, every ridge a seaward spike); the sand's
  own relief never interrupts the sheet. The sand at a distance d is under the sheet while the front is beyond it, and wet afterwards with
  the drying lag `e^(−t / 60 s)` from the last of the eight remembered cycles whose excursion passed d (the oldest fades out over its last
  period, so the memory window never drops a wave at once); below the tidal and capillary reach (0.85 m) the sand stays saturated (the D5
  static band's core); the wrack line lies 2 m wide at the highest remembered excursion. Everything is analytic in the clock, so a fixed
  time repeats exactly and a sea-state switch only changes the inputs.
- **Foam** the leading edge is a band 3 m wide along the beach behind the advancing front, thinning away as the sheet recedes (foam rides
  the advance; the backwash leaves its foam on the sand instead); behind it the sheet carries 0.3 of the shoreline's supply thinning
  seaward, and the backwash leaves 0.5 of it dying over 10 s, most where each run-up stalled (lines parallel to the shore at each
  remembered excursion, never rings). All of it lies on the land side of the waterline: the water side is the rings' (their breaker and
  shoreline foam); a water-side band traced the level sets of the marched arrival time, with its local maxima in the inner corners of the
  staircased waterline, as closed loops (the islands of foam of 2026-10-14). The front's foam goes through the D3 lace; the carried and
  deposited foam draws as soft wisps over the pattern's high ground (the lace threshold at a low density keeps only its veins: a needle with
  a hole, a cell as a polygon). The shore distance measures to the sea connected to the extent's boundary (`landscapeOceanSeaMask`; an
  enclosed pocket of below-sea-level texels is no shoreline; coastal v3 holds none, reported in `snapshot().ocean.shore.seaMask`).
- **Shading** composed in linear light over the sand's representative radiance (albedo 0.4 under the sun and sky irradiance) and
  carried to the terrain's display-encoded pixel as a display ratio (the alpha: the wet sand under the reflection, the Lekner–Dorf
  darkening of the calibrated wet surface, 0.6 of the albedo) and a display increment (the colour: what the reflection and the
  glitter add over it); multiplying the pixel by the linear ratio or adding a display-encoded glint to it both failed (0.6 linear
  reads as 0.32, display(a) + display(b) ≫ display(a + b)). The water sheet is near a mirror: the finest cascade's slopes at half
  their amplitude as its ripples, a 0.008 mean square slope below them, so the sun breaks into glitter on it; saturated sand keeps
  the calibrated wet roughness (0.18) at 0.6 gloss. Dry, unfilmed sand is discarded. Debug view 10 shows the wetness, the film and
  the front foam over the surface's view 9.
- **Surface over the sand** the displaced rings fade out within 4 m inland of the still-water line (`ocean_surface.frag.glsl`), and on
  the land side a ring crest standing above the sea level fades with its height (it showed over the beach as a foamed sliver), so a crest
  never washes over the beach as a water surface; the sheet owns the water on the sand. In the sheet's verification view (10) the rings
  discard, so the view shows the sheet alone (they drew opaque over it before).
- **Residency** the band reserves in the ocean share (6.1 MiB GPU and CPU on v3; the estimate 8 MiB); the share grew to 48 / 80 MiB
  and the shipped GPU profiles by the same 16 MiB (416 → 432 MiB, 608 → 624 MiB, 764 and 1126 MiB at 2560 × 1440 and 3840 × 2160).
- **Review poses** `OS-06` (the swash from the berm, 3 m over the dry sand 47 m east of the swim beach's waterline, looking down the
  foreshore) and `OS-07` (the wet line from 70 m above, heading 180: with the calibrated sun at azimuth 45° and elevation 55°, a
  nadir view heading 0 looks straight at the sun's mirror point, 35° from nadir toward +x+z, and the whole wet beach reads as glare).

## 2e. Water colour, refraction and light (D5)

Since D5 the viewer's frame renders into a linear half-float target and a final pass tone-maps it for the canvas
(`LandscapeFramePipeline.js`, pure constants `LandscapeFramePipelineModel.js`, `materials/landscape/frame_final.frag.glsl`): three.js
compiles the materials' own tone mapping and output transfer out under a render target, so every landscape material writes linear
radiance unchanged, and the sea composes the water in linear light over the opaque frame it reads (`chunks/landscape/ocean_light.glsl`,
constants `LANDSCAPE_OCEAN.water` and `.light`).

- **Frame pipeline** the target is RGBA16F with a depth renderbuffer at the drawing buffer's size, bound between frames (programs
  compile and tiles upload against its variant; the view re-binds it after its canvas reads); the first ring's `onBeforeRender`
  copies the frame drawn so far (the terrain, the backdrop, the swash sheet) into the scene texture (RGBA16F, the same format so the
  copy is always legal); the final pass applies the renderer's tone mapping and the sRGB transfer with an FXAA-console edge filter on
  the encoded taps in place of the canvas multisampling (an RGBA16F target with four samples would cost 116 MB at 1080p and 464 MB
  at UHD, and the copy cannot read a multisampled framebuffer). Bytes: 41.5 MB at 1920 × 1080 (target 16.6, depth 8.3, scene 16.6),
  166 MB at 3840 × 2160, reported by `snapshot().pipeline`, display-sized like the canvas and not a ledger stream. The flat AI577
  reference renders through the same pipeline, so its sky reflection composes in linear light as well (its horizon reads darker than
  the display-space blend it was calibrated with; the D1 note that linear composition brightens dim reflections by the tone curve's
  slope described that calibration, not the physics).
- **Column handover** with the animated sea drawn and the camera above the water, submerged terrain writes the seabed lit under water
  without its column, interface or air light (`terrain.frag.glsl`, `uLandscapeOcean.x`); the surface applies them once. Below the
  water the terrain keeps its column and the surface its D1 underwater branch.
- **Refraction** the eye ray refracts at the facet (`refract(−v, n, 1/1.333)`) and runs to the seabed level, the still-water depth of
  the field plus the facet's own height above the level; the scene texture is read at that point's projection through the frame
  camera (`uOceanViewProjection`), or at the fragment's own position where the refracted point projects outside the frame or over
  land (the straight sample is the seabed the eye ray hit). The AI577 column (`landscapeWaterColumn` with the local water's
  constants) runs along the refracted path from the surface; the upwelling radiance crosses the interface as the transmitted share
  over n²; the reflected sky at the split-sum reflectance and the glitter add; the water is opaque, the foam a Lambertian layer.
- **Colour** the local water blends the AI577 clear coastal water toward the oceanic water with the still-water depth (absorption
  0.32 / 0.055 / 0.025, backscatter 0.0015 / 0.002 / 0.003 m⁻¹, blended between 5 and 20 m: the deep blue offshore) and toward the
  stirred surf water with the breaking and the foam (absorption 0.35 / 0.09 / 0.09, backscatter 0.012 / 0.014 / 0.016 m⁻¹, weight
  0.45 of the stirring: the milky turquoise of the surf); the bottom's own colour comes through the seabed sample (sand bright, rock
  and weed dark as the terrain renders them).
- **Caustics** the irradiance ratio of the refracted sun's mapping through the surface, `1 / |1 + (1 − 1/n) d ∇²h|`, from finite
  differences of the two finest cascades' slopes at the surface point the sun ray crossed above the seabed point (their mips average
  the far pixels), applied to the sun's share of the seabed's light (sun against downwelling sky at that depth), contrast 0.5,
  clamped 0.5–2, fading with depth from 6 to 15 m and with the pixel footprint from 3 to 10 cm per pixel (a 70 m view is otherwise
  solid speckle).
- **Crest scattering** the facet's own height (the cascades and the train sampled at the fragment, not the ring vertex's coarse cell)
  with the train's sharpening gives a crest factor (0.15–0.8 m); the local water's deep colour is added at strength 3.5 × crest ×
  (0.25 + 0.75 cos²) with cos the view toward the sun, under the sun's visibility and the transmitted share. Documented as an
  approximation of light scattered through thin crests.
- **Reflections** the sky from the prefiltered map (D1). Terrain: `reflection_hits.mjs` mirrored the eye rays of the review frames
  about the sea level over the extent's height raster: a planar mirror meets terrain in under 2 % of the sea at seven of eight
  poses and 12.7 % at NW-09 (the water-level view along the coast), 32 % there with a 5° facet tilt. That justified a heightfield
  screen-space reflection, not a planar re-render of the terrain: the mirrored ray of the train's smooth normal (the cascades'
  ripples flickered the result into loops) marches the field's land heights in growing steps (16, from 4 m) while it stays low
  (elevation below 0.35) and where it lands on terrain the frame shows, the frame's colour replaces the sky with a weight that softens
  over 3 m of clearance and fades at the frame's edges. Limits: only terrain inside the extent and inside the frame reflects, the
  frame's front-most surface stands in for anything it hides, no reflections of the sheet, the foam or the surround.
- **Verification views** 11 the seabed read through the surface, 12 the water just below the surface, 13 the caustic ratio (half),
  14 the crest scattering (crest, view toward the sun, scattering). In a verification view the rings and the swash sheet draw opaque
  (a ONE / ZERO blend) with alpha 0, the pipeline's sentinel: the final pass passes those pixels through untouched (the frame target
  clears to alpha 1), so the unitless views keep their raw values; the radiance views (3, 4, 11, 12) keep alpha 1 and are tone-mapped
  by the final pass with the scene (`oceanDisplay` compiles to the identity under the target).

## 2f. Inland water (D6)

AI 596 published no inland water surface on coastal-city-v3 (`LANDSCAPE_AI596_HANDOFF.md` §7: the land-cover class 0 is exactly the
4,447,457 samples below sea level, no drainage channel carries a water level above Y = 0; the hydrology is data only: the drainage
classes and the terrain fields' fill depths, 1,080 flats filled to 9.70 m at most, a pond candidate being a flat-pond sample with a
positive fill depth outside planning cover). D6 closed with that record on 2026-10-14. A future inland water product would publish a
water level per body (a raster or polygons, derived from the pond candidates as its own data-only product) and the ocean system would
draw it as a second instance of the surface at that level with the `calm` sea state and the flow direction from the drainage channels;
today the surface, the water column and the light are bound to the sea level and the extent field.

## 6. Presets and cost (D7)

### Quality presets (`LANDSCAPE_OCEAN_QUALITIES`, `landscapeOceanQuality=low|medium|high`, the test hook `setOcean({quality})`)

| Preset | Cascades (patch lengths) | FFT | Rings (cells per side × finest cell) | LEAN | Caustics, terrain reflection (D5) | Share estimate (`landscapeOceanResources`) |
| --- | --- | --- | --- | --- | --- | --- |
| `low` | 2 (1600, 100 m) | 128² | 64 × 1 m | off | off | 36.4 MiB GPU / 30.3 MiB CPU |
| `medium` (default) | 3 (1600, 200, 25 m) | 256² | 128 × 0.5 m | on | on | 48.1 MiB GPU / 31.0 MiB CPU |
| `high` | 4 (1600, 200, 25, 3.125 m) | 256² | 192 × 0.25 m | on | on | 53.7 MiB GPU / 32.3 MiB CPU |

`low` is the explicit low-cost path: two cascades at 128 texels, one-metre cells, no LEAN roughness, and the D5 light terms that cost
per pixel switched off (the caustic taps and the reflection march; the refraction read, the water column and the crest scattering
stay, as does everything of D2–D4). The share held in the ledger is the same 48 / 80 MiB for every preset (one standing reservation
for the view's lifetime, §1).

### Sea-state presets (`LANDSCAPE_OCEAN_SEA_STATES`, `landscapeSeaState=calm|moderate|rough`, `setOcean({seaState})`)

| Preset | Wind (speed, heading, fetch) | Swell (height, period, heading, spread) | Hs at medium (continuous) | Shore train (period, deep wavelength) |
| --- | --- | --- | --- | --- |
| `calm` | 3 m/s, 80°, 15 km | 0.25 m, 8 s, 95°, ±30° | 0.34 m | 8 s, 100 m |
| `moderate` (default) | 7 m/s, 85°, 60 km | 0.6 m, 8.5 s, 95°, ±25° | 1.29 m | 8.5 s, 113 m |
| `rough` | 12 m/s, 75°, 150 km | 1.5 m, 11 s, 100°, ±20° | 3.17 m | 11 s, 189 m |

Every preset is deterministic in the clock (`landscapeOceanTime`); a sea-state switch re-marches the shore train, resets the foam
state and re-reads the swash inputs; a quality switch rebuilds the simulation and the surface inside the held share.

### Cost at the water review poses

ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11), 1920x1080, 90 warm-up + 180 sampled frames, GPU frame time median / p95 ms (EXT_disjoint_timer_query around the frame's render, the ocean simulation batch separate), coastal-city-v3 with the surround, the animated ocean's clock free-running from 30 s, moderate sea state; 2026-10-15T01:51:54.367Z.

## Surface cache on

| Pose | Flat reference | Low (2 cascades, no light) | Medium (shipped) | High | Medium − flat | Draws (medium) |
| --- | --- | --- | --- | --- | --- | --- |
| NW-09 | 8.4 / 9.7 | 11.7 / 14.3 | 13.5 / 20.2 | 14.3 / 20.2 | 5.2 | 72 |
| NW-10 | 7.3 / 9.5 | 12.2 / 14.1 | 14.9 / 19.5 | 12.8 / 19.0 | 7.6 | 95 |
| NW-11 | 11.2 / 12.7 | 14.0 / 17.8 | 11.8 / 21.0 | 14.5 / 22.6 | 0.5 | 116 |
| NW-12 | 6.7 / 8.8 | 13.8 / 16.5 | 14.3 / 19.1 | 14.3 / 19.8 | 7.6 | 77 |
| OS-01 | 4.2 / 5.4 | 9.9 / 12.5 | 12.7 / 16.8 | 13.6 / 17.1 | 8.5 | 52 |
| OS-04 | 5.4 / 6.9 | 11.7 / 13.7 | 13.1 / 20.2 | 11.8 / 20.4 | 7.7 | 67 |
| OS-06 | 5.8 / 7.0 | 11.7 / 14.7 | 14.3 / 17.8 | 13.9 / 19.9 | 8.6 | 45 |
| OS-07 | 2.9 / 4.2 | 8.6 / 10.9 | 12.3 / 16.1 | 14.1 / 17.6 | 9.4 | 29 |

## Surface cache off

| Pose | Flat reference | Low (2 cascades, no light) | Medium (shipped) | High | Medium − flat | Draws (medium) |
| --- | --- | --- | --- | --- | --- | --- |
| NW-09 | 12.6 / 14.9 | 13.5 / 18.5 | 14.7 / 18.1 | 13.3 / 23.8 | 2.1 | 58 |
| NW-10 | 16.6 / 17.6 | 16.4 / 17.5 | 17.0 / 17.9 | 17.4 / 18.6 | 0.4 | 83 |
| NW-11 | 24.7 / 26.5 | 23.9 / 25.8 | 23.2 / 24.7 | 22.6 / 23.2 | -1.5 | 110 |
| NW-12 | 9.2 / 11.4 | 13.6 / 18.9 | 13.1 / 19.8 | 13.5 / 21.1 | 3.9 | 71 |
| OS-01 | 15.0 / 20.1 | 16.8 / 18.0 | 16.7 / 17.4 | 16.5 / 16.8 | 1.7 | 48 |
| OS-04 | 18.4 / 19.0 | 17.6 / 18.5 | 16.5 / 17.8 | 17.7 / 18.4 | -1.9 | 64 |
| OS-06 | 7.8 / 8.5 | 13.1 / 16.1 | 14.3 / 17.2 | 14.5 / 20.9 | 6.5 | 41 |
| OS-07 | 8.6 / 9.1 | 11.5 / 14.7 | 11.4 / 20.3 | 12.6 / 18.7 | 2.8 | 27 |

Across the 8 poses the shipped preset costs 6.9 ms more than the flat reference with the cache on and 1.7 ms with it off; the low path saves 1.7 / 0.1 ms against medium (cache on / off); high adds 0.3 / 0.2 ms over medium. The uncached v3 path stays GPU-bound (AI 596 D6): the surface cache, not the sea, decides whether the frame holds 60 Hz there.

### Regressions in both surface-cache modes

cache on: 84 passed, 3 skipped across 25 suites; cache off: 84 passed, 3 skipped across 25 suites. Every suite file ran in its own Playwright invocation (a fresh browser): the suites that take the base address each against a fresh v2 default server on port 8002 (its process tree killed and the port proven free between suites), the three self-serving suites (ocean, surround, resolution) with the port proven free before each, since a suite's server lingers on the port after its afterAll (run 2 and run 3 lost them to EADDRINUSE behind the ocean suite; run 4 with one shared server and browser per mode showed cross-suite coupling: the fabrication handoff read another selection, the large-editing report calls and the authoring edit test ran past their budgets and the lifecycle switch gap grew with the run, while each suite passes alone). Logs and the table under `tests/artifacts/screens/landscape/ai597/d7/regressions/`.

## 7. Handoff (what the next prompts consume)

- **Sea level and picking** stay the contract of §1: Y = 0 authoritative, water never picked, `landscapeOcean=flat` the inspection mode.
- **The frame pipeline (D5)** is the place for frame-wide passes: every material writes linear radiance into the RGBA16F target, the
  first ocean ring copies the opaque frame into `uOceanScene`, the final pass tone-maps and filters edges. A mist, fog or post pass
  (AI 600) reads the same target; its depth is a renderbuffer today (a depth texture is the next step if a pass needs it).
- **Wet and foam state for the ecosystem prompts**: the swash sheet carries the beach's wet state in time (`uLandscapeOcean.y` tells the
  terrain the sheet draws it); the foam state's sand channel is the shoreline's foam supply; the wrack line lies at the highest remembered
  run-up (`ocean_swash.glsl`); the shore distance (`uOceanField.y`, signed, exact) and the coastal zones (`LandscapeOceanCoast.js`) are
  the sea-side inputs AI 603's habitats can read.
- **Budgets for AI 598**: the ocean share is 48 / 80 MiB, the pipeline 20 bytes per drawing-buffer pixel outside the ledger, and the
  uncached v3 path is GPU-bound (§6, `LANDSCAPE_PERFORMANCE.md`); the low preset is the cost lever the sea offers.
- **Inland water (D6)** waits for a published water level per body (§2f).

## 3. Runtime (D1–D5)

| Part | Where | What |
| --- | --- | --- |
| Owner | `ocean/LandscapeOcean.js` `createLandscapeOcean` | resolves to a handle whatever happened (`active`, `unavailable` without float render targets, `failed` with a reason; inert handles hold nothing); loads the extent field, initializes the spectrum, links the surface program in parallel (`KHR_parallel_shader_compile`) while the flat reference keeps drawing, then hides the reference plane; `setSurround` binds the far field; `update({dt, camera})` once per frame before the render (clock, simulation batch under its own timer query, ring placement) |
| Fields | `ocean/LandscapeOceanField.js` | depth below sea level rasterized at texel centres from the saved chunks through the bounded loaders: the extent from the level-2 chunks (1024² at 3.906 m on coastal v3, 16 chunks, 240 ms) and the surround from its level-1 chunks (512² at 62.5 m, 4 chunks, 347 ms) as RGBA16F textures (8 + 1 MiB GPU, float32 rasters on the CPU); inside the landscape bounds the extent field answers, beyond them the surround's while a surround is active, elsewhere there is no sea (the AI 596 water extent contract) |
| Simulation | `ocean/LandscapeOceanSimulation.js` | one RGBA32F atlas (cascades × N by N) for h0 and two FFT ping-pong atlases, per-cascade RGBA16F wrapped displacement and derivative textures with mips, a butterfly DataTexture; per frame the time pass, `log2 N` horizontal and `log2 N − 1` vertical butterfly stages over the atlas, the last stage per cascade, the derivative pass per cascade: `2 log2 N + 2 cascades` single-output draws (22 at medium) of at most 3 N² fragments; `EXT_disjoint_timer_query_webgl2` around the batch; `readback(cascade)` for verification |
| Surface | `ocean/LandscapeOceanSurface.js` | a camera-snapped clipmap: two shared grid geometries (integer indices, quads split along one diagonal): the full grid for ring 0 and, for every other ring, the annulus outside the square of `ringCells / 4 − 1` cells that always lies inside its hole (`landscapeOceanRingIndices`, `landscapeOceanRingHoleCells`); ring r has `ringCells` cells of `baseCell × 2^r`, its origin snapped to twice its cell (stable parity, no swimming), a hole where ring r − 1 lies whose fragments it discards (the annulus overlaps the hole by one or two cells, since the two lattices snap one cell apart; until 2026-10-14 the full grid's vertices inside the hole collapsed to the nearest hole edge, which turned the quads across the hole's diagonals and centre into triangles spanning the hole: the coarsest ring blended a flat sheet over the whole sea near the camera, its varyings interpolated across 16 km jumping as the camera moved — the "flicker" of the beach passes), and a CDLOD morph over the outer 70–95 % of its half extent: odd vertices take the mean of their even neighbours sampled at the coarser mip, even vertices the coarser mip, so adjacent rings meet exactly. Rings double until the far plane (25 km): 11 rings of 128 cells at medium (283,568 triangles, 11 draws, 0.7 MB) |
| Shading | `ocean_surface.frag.glsl`, chunk `ocean_sampling.glsl` | normal from the filtered cascade slopes; GGX split-sum reflectance of the facet with the LEAN roughness (base Cox–Munk mean square slope of the unresolved part plus the slope variance the mips removed); reflected sky from the prefiltered map at a mip level that spreads the lookup by twice the removed slope deviation (the pixel sees the mean sky of its facets); a reflection that dips below the horizon resolves to the sea's upwelling colour; the sun glitter is Cox–Munk (Beckmann facet distribution, Schlick Fresnel, Smith masking) so it vanishes away from the mirror direction; composed in display space as the reference does (tone-mapped sky × reflectance + tone-mapped glint, premultiplied alpha = reflectance) over the terrain, which keeps the water column |
| Amplitude control | `ocean_sampling.glsl` | each cascade's spectral displacement fades with the local depth (`landscapeOceanCascadeFade` in `uOceanCascadeInfo.zw`: 7.2–18 m, 2–5 m and 0.25–0.625 m at medium; D1 ran one 0.3–4 m band for every cascade), so the beach and the far coast never see the open sea's amplitude and the D2 shore train takes the swell over below 18 m; the swell cascade carries a world-space value-noise envelope (±35 % at 1.5 km) so its patch never repeats exactly |
| Shore march (D2) | `ocean/LandscapeOceanShore.js`, `LandscapeOcean.js` `marchShore` | after the extent field and the coast load, `computeLandscapeOceanShore` marches the sea state's swell over the depth raster in slices of 65 536 accepted texels that yield to the frame loop (the ocean reports `active` once it is done, 0.9 s on coastal v3 with the 240 ms field raster), fills the land side of the travel time and counts the breaking texels per coastal zone; a sea-state switch (`setSeaState`, awaited by the view's `setOcean`) re-initializes the spectrum at once and marches the shore again in the background, swapping the travel time and the wave height into the textures when done (`snapshot().ocean.settled` and `.shore.settled` wait for it; a superseded march is dropped) |
| Coast (D2) | `ocean/LandscapeOceanCoast.js` | loads `geology/manifest.json` beside the landscape manifest through the bounded geology loaders (the sidecar is bound to the landscape, its level-2 pages hashed), samples the coastal zone label and the wave exposure nearest at the field's texel centres (16 pages, 5 419 rock and 41 027 exposure texels on v3), reports staleness against the terrain revision; a missing or unbound sidecar yields the neutral coast with the reason in `snapshot().ocean.shore.coast` |
| Shore pass (D2) | `chunks/landscape/ocean_shore.glsl` in both surface programs | the vertex program adds the train's displacement to the cascade sum inside the CDLOD morph (odd vertices take the mean of their even neighbours at the coarser cell, like the cascades, so the rings stay watertight); the fragment program adds its analytic slope to the filtered cascade slopes and its unresolved mean square slope to the LEAN roughness; `uOceanTime` carries the clock each frame (`surface.update(camera, time)`), `setShore` the train's angular frequency and group period; a facet tilted away from a grazing view bends its normal toward the eye instead of switching to the underwater branch (the D1 branch painted the backs of steep crests as the sea's underside); debug view 8 shows the weight, the crest sharpening and the bore strength |
| Foam state (D3) | `ocean/LandscapeOceanFoam.js`, `ocean_foam.frag.glsl` | created after the surface with its uniform set, pre-rolled at the clock's time before the ocean reports active; every frame `advance(time)` runs the schedule's fixed steps (one full-screen pass of the 1024² RG16F raster each, ping-pong) before the rings are placed and hands the current target to the surface; a sea-state switch resets it; `foamReadback()` returns the rasters with their means, covered fractions and deposit per coastal zone (`oceanFoamReadback` hook); `snapshot().ocean.foam` records the steps, the last pre-roll, the resets and the submission time |
| Foam drawing (D3) | `chunks/landscape/ocean_foam.glsl` in the surface fragment program | the density of the fragment (state plus its own front and folding), the pattern, the coverage and the Lambertian foam radiance composed over the water's radiance with the alpha raised to opaque; `uOceanFoam` is the state texture, `uOceanFoamLook` (active, threshold, softness, albedo), `uOceanFoamPattern` and `uOceanFoamFold` the constants; debug view 9 |
| Swash band (D4) | `ocean/LandscapeOceanSwashBand.js` `loadLandscapeOceanSwashBand` | after the coast and the shore distance, beside the shore march: the native chunks whose bounds cross the band are loaded through the bounded loaders and each becomes an Int16 geometry of its band samples (29 chunks, 344 669 vertices, 665 348 triangles, 6.06 MB on v3 in 0.3–0.4 s); a chunk without band samples yields nothing |
| Swash sheet (D4) | `ocean/LandscapeOceanSwash.js` `createLandscapeOceanSwash` | reserves the band in the ocean share, one mesh per chunk under the surface's uniform set plus `uOceanSwash` (√(H L), period, drying, carried foam share), `uOceanSwashBand` (static reach, slope cap, cycles, front width), `uOceanSwashFoam` (deposit share and lifetime, film slope variance, ripple share) and the native grid; links its program in parallel like the surface (`ready(camera, signal)`), `setSeaState` only changes the inputs, `setLightingTier` rebuilds the program, `snapshot()` reports it under `snapshot().ocean.swash`; the ocean reports active once the sheet is linked (`swashActive` flips the terrain's handover) |
| Surface over the sand (D4) | `ocean_surface.frag.glsl` | the rings' radiance and alpha fade with `1 − smoothstep(0, 4 m, inland)` of the field's shore distance |
| Frame pipeline (D5) | `LandscapeFramePipeline.js`, `frame_final.frag.glsl` | created by the view with the renderer (null without float render targets: the frame draws to the canvas as before); `bind()` after the canvas reads, `render(scene, camera)` draws the scene into the target then the final pass to the canvas, `copyScene(renderer)` from the first ring's `onBeforeRender`; resizes with the drawing buffer; `snapshot()` under `snapshot().pipeline` (size, bytes, passes, copies) |
| Water light (D5) | `chunks/landscape/ocean_light.glsl` in the surface fragment program | `oceanWaterBody` (refraction, the local water type, the column, the caustics), `oceanTerrainReflection` (the heightfield march), the crest scattering in the fragment program; uniforms `uOceanScene`, `uOceanViewProjection`, `uOceanWater`, the two water types' attenuation and backscatter, `uOceanLight` |

## 4. Evidence (D1–D5)

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

- D3 (`tests/artifacts/screens/landscape/ai597/d3/`, README.md there): gate captures `d3/animated/` (NW-12, NW-01, NW-10), the shore poses
  `d3/shore_poses/` (OS-01, OS-02, OS-04), the foam verification view `d3/debug9/`, composites `d3/composites/`, the per-zone foam
  statistics `d3/foam_statistics.json` (`foam_statistics.mjs`, the viewer's read-back per sea state), the suite receipt
  `d3/suite/foam-suite.json` (the D3 test of `landscape_ocean.pwtest.js`: state, pre-roll, per-zone foam across the sea states,
  determinism, debug view, disposal), clips `d3/clips/` (no popping), the periodicity receipts of the foam band, the paired GPU
  measurement `d3/perf/` and the regression logs `d3/regressions/`; unit test `landscape_ocean_model.test.js` (the schedule).

- D4 (`tests/artifacts/screens/landscape/ai597/d4/`, README.md there): gate captures `d4/animated/` (NW-12, NW-01, NW-03, NW-10), the
  swash poses `d4/shore_poses/` (OS-06, OS-07), the swash verification view `d4/debug10/` (`--ocean-debug 10`), composites
  `d4/composites/` (NW-12 and OS-06 against the beach-video swash frame, NW-01 against the shorebreak photo, OS-07 against the aerial
  beach photo), the suite receipt `d4/suite/swash-suite.json` (the D4 test of `landscape_ocean.pwtest.js`: the sheet over the native
  band inside the share, the lighting handover, determinism and motion of the wet line at NW-12, the pick through the sheet against
  the flat surface's, debug view 10, the half-period step at NW-03, the flat and animated switches, disposal), clips `d4/clips/`
  (NW-12, OS-06, NW-01, NW-03 over the beach regions), the paired GPU measurement `d4/perf/` (with OS-06 and OS-07) and the
  regression logs `d4/regressions/`; the look iterations `d4/first..eighth/` and the term probes `d4/probe_terms/`; unit tests
  `landscape_ocean_swash.test.js` (the band geometry, the loader, the inputs), `landscape_ocean_shore.test.js` (the land-side
  smoothing), `landscape_ocean_model.test.js` (the share, the parts, the lighting value). The foam fix of 2026-10-14 (the islands and spikes of foam the
  user reported on the beach passes): the look iterations and term probes under `tests/artifacts/screens/landscape/ai597/pass/`
  (`foam-fix1..10/`, `probe*/`, `needle_probe.mjs`), the passes `pass/beach-forward/clip.mp4` (facing north along the swash),
  `pass/beach-sideways/clip.mp4`, `pass/surf-low/clip.mp4`, `pass/coast-oblique/clip.mp4`; unit test `landscape_ocean_shore.test.js`
  (the sea mask). The clipmap hole fix of 2026-10-14 (the far sea "flickered" along the beach passes): the probes under `pass/`
  (`snap_probe.mjs`, `creep_probe.mjs`, `shift_probe.mjs`, `xcorr_probe.mjs`, `ring_probe.mjs`, `plane_probe.mjs`), the before/after frames under
  `pass/creep/` and `pass/hole_fix/`, the re-rendered `pass/beach-forward/clip.mp4` (the flickering render kept as
  `pass/beach-forward-before-hole-fix/`); unit test `landscape_ocean_model.test.js` (the annulus indices and the hole bound).

- D7 (`tests/artifacts/screens/landscape/ai597/d7/`, README.md there): the same-condition tables `d7/perf/PERF.md` (`measure_presets.mjs`,
  the receipt `measure_presets.json`), the regression logs and table `d7/regressions/` (every landscape suite, both surface-cache modes),
  the unit run `d7/unit-run5.log`; unit test `landscape_ocean_model.test.js` (the presets' light flag).

## 5. Known limitations after D5

- The shore wave is one monochromatic train (the swell period at the sea state's Hs): the wind sea's shorter waves fade
  below their own shoaling depth without breaking; the group envelope rides with the phase speed (sets do not travel at
  the group velocity); reef shadows spread by first-order upwind transport, not by a diffraction model; breaking is the
  depth-limited `γ h` cap only (no steepness-limited whitecapping offshore, which is D3's Jacobian source); the exposure
  damping is a near-shore multiplier, not a source-side one.
- The rock surge (uncapped height, 0.4 reflected, no bore) is exercised on synthetic rasters only: every `platform` and
  `bluff-toe` texel of coastal v3 lies 0.4–10 m above sea level, so the sea never reaches rock there.
- The swash is Stockdon's statistical R2 run-up per wave, not a hydrodynamic bore: no infiltration, no interaction between the
  backwash and the next bore, one front per train period; its foreshore slope and arrival come from the 3.9 m extent field, so a
  beach feature narrower than a texel runs up with its neighbours; the foam supply is per texel of the same field.
- Seaward of the still-water line the rings stay over the shallow sand, where their LOD steps show as faint angular patches of the
  reflection over the bright bottom (the water colour of D5 covers the shallows); a review pose that looks at the sun's mirror point
  sees the wet beach as glare, which is the physics of a wet mirror (OS-07 looks away from it).
- Foam is an opaque Lambertian layer: no translucency, no shadow cast by the crest onto it, and its persistence outside the
  extent is nil (the far-field sea shows the instantaneous folding only); whitecap streaks follow the folding of 4 m texels, so
  they are patches rather than individual crest breaks.
- The train stops at the landscape extent: the surround's coast keeps the D1 depth fade only.
- The terrain reflection is the heightfield screen-space march of §2e: terrain outside the extent or the frame, the sheet, the foam
  and the surround do not reflect, and the frame's front-most surface stands in for what it hides; caustics and the crest scattering
  are approximations (no sun-disc blur, no path through the crest); the water types are three blends, not a turbidity field.
- The frame pipeline's bytes scale with the display (41.5 MB at 1080p, 166 MB at UHD) outside the residency ledger; the flat
  reference composes in linear light since D5.
- The far-field sea over the surround damps near the far coast from a 62.5 m depth raster: the far shoreline is coarse.
- The bathymetry fields are rasterized per load, not per edit: an accepted terrain edit leaves the depth fade (and the D2 shore fields)
  stale until the next load, while picking, queries and the terrain itself are current (`snapshot().ocean.settled` waits only for the
  far-field binding).
- Performance is measured in D7 with the same-condition tables; D1 reports the simulation batch's own GPU time and the
  surface program's compile time in `snapshot().ocean`.
