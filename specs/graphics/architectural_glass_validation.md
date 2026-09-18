# AI 549 validation — architectural glass

Validated on 2026-09-18 against material/config baseline `ebec743`. Burban,
B Glass and Terra & Mar now use explicit coated/clear dielectric glazing.
Existing geometry, facade rhythm and room content remain unchanged. The separate
transmitted-sun example is an opt-in, fixed planar fixture beside Burban; it does
not enable city-wide colored shadows or general refractive caustics.

## Preserved visual evidence

- [Interactive before/after gallery](../../tests/artifacts/screens/buildings/burban/ai549/review.html): 72 matched 1920×1080 facade images.
- [Burban evidence](../../tests/artifacts/screens/buildings/burban/ai549/): front, three-quarter, base-up and grazing views, plus three lower and three upper sweep poses in each lighting setup.
- [B Glass evidence](../../tests/artifacts/screens/buildings/bglass/ai549/) and [Terra & Mar evidence](../../tests/artifacts/screens/buildings/terramar/ai549/): four poses each in each lighting setup.
- Original reference copies: [Burban](../../tests/artifacts/screens/buildings/burban/references/burban.png), [B Glass](../../tests/artifacts/screens/buildings/bglass/references/bglass.png), [Terra & Mar](../../tests/artifacts/screens/buildings/terramar/references/b8.png). The gallery records SHA-256 hashes; originals are untouched.
- [Transport evidence](../../tests/artifacts/screens/buildings/burban/ai549/transport/): `glass-only.png`, `transport-only.png`, `combined.png`, `stale.png`, validated bake and runtime report.
- [Actual gameplay control](../../tests/artifacts/screens/buildings/burban/ai549/gameplay/): before/after images and raw report.

Each facade directory contains `before-daylight`, `after-daylight`,
`before-street` and `after-street`. Daylight uses the ordinary calibrated
environment, ACES exposure 0.051100170522; street uses a separately labeled
detailed HDRI diagnostic at exposure 1.6, sun intensity 5.75 and hemisphere
intensity 1.46. All pairs have identical camera, sun, actual loaded HDR URL,
exposure and postprocessing, asserted by the capture. Background and environment
both load. No new building was modeled, so the new-model 4K gate does not apply.
All generated files remain gitignored local evidence, not committed baselines.

The source comparison and angle sweeps show the intended lower clear/upper
reflective distinction and coherent curved reflections. Sparse rooms and old
interior-atlas content remain visible limitations for AI 552. The existing HDRI
cannot show missing local city reflections; those remain AI 551 work.

## Performance conditions

Hardware: AMD Ryzen 5 9600X six-core CPU, NVIDIA GeForce RTX 3060, Windows Chrome,
ANGLE D3D11. Performance viewport: 1280×720; screenshots: 1920×1080. Graphics:
MSAA 8×, high cascaded shadows, high GTAO, bloom off, color grading off, ACES.
Facade table uses ordinary calibrated daylight and the same fixed pose per pair:
Burban `sweep-upper-2`, B Glass and Terra & Mar `grazing-close`. Complete resolved
settings and camera coordinates are retained in each `report.json`.

Each run waits for shader/texture readiness, warms 30 frames and measures 90.
Frame time is the arithmetic mean of simulation/render submission followed by
`gl.finish()`, excluding the between-sample scheduler yield. CPU submit time
ends before `gl.finish()`. FPS is reciprocal mean frame time: **uncapped workload
throughput, not presented gameplay FPS**. These short sequential runs include
driver, scheduling, residency and garbage-collection variation; they do not
establish a speedup or a broad regression bound.

| Facade | Mean frame ms, before → after | Throughput FPS | CPU submit ms | Draw calls | Triangles |
|---|---:|---:|---:|---:|---:|
| Burban | 1.59 → 1.31 | 628.05 → 765.96 | 1.59 → 1.30 | 226 → 226 | 367,320 → 367,320 |
| B Glass | 2.37 → 2.54 | 421.94 → 393.01 | 2.37 → 2.54 | 398 → 398 | 370,962 → 370,962 |
| Terra & Mar | 1.76 → 1.74 | 569.26 → 574.35 | 1.75 → 1.74 | 302 → 302 | 220,552 → 220,552 |

| Facade | p95 frame ms | Resident texture count | Resident geometry count | Compiled programs | JS heap MiB |
|---|---:|---:|---:|---:|---:|
| Burban | 1.90 → 1.80 | 160 → 160 | 534 → 534 | 27 → 27 | 142.28 → 112.02 |
| B Glass | 2.40 → 3.60 | 79 → 79 | 344 → 344 | 29 → 30 | 87.65 → 87.86 |
| Terra & Mar | 1.90 → 1.80 | 93 → 93 | 248 → 248 | 29 → 30 | 91.67 → 91.97 |

Glass repair adds no measured draws, triangles or textures. One additional
program is resident for B Glass and Terra & Mar. Heap differences are snapshots,
not demonstrated memory savings. Per-pass CPU timing and GPU timer-query timing
are **not measured**: this capture only brackets aggregate submission and
completion. Total GPU memory bytes are **not measured**: renderer counters expose
resource counts, not driver allocation bytes. No extra transmission scene pass
is introduced by the coating hook.

### Gameplay compatibility control

The real game boots BigCity2, fixes bus position at (0,0,0), camera at (30,12,95)
looking toward (30,6,125), pauses motion and explicitly selects current live
lighting in both contexts. Same hardware, viewport, warm-up and sample count.
The default city contains **zero materials from the three changed buildings**;
this is a compatibility control and cannot measure the glass change's benefit.

| Metric | Before → after |
|---|---:|
| Mean completed frame ms / throughput FPS | 10.95 → 11.71 / 91.36 → 85.37 |
| p95 completed frame ms | 12.20 → 14.20 |
| Mean CPU submit ms | 10.94 → 11.71 |
| Draw calls / triangles | 1,468 → 1,468 / 2,619,340 → 2,619,340 |
| Resident textures / geometries | 87 → 87 / 1,923 → 2,014 |
| JS heap MiB | 486.46 → 445.55 |

Geometry residency and heap are cache/collection snapshots; rendered work is
identical. Individual CPU/GPU passes and total GPU bytes were not measured for
the same reasons as above. No causal glass performance conclusion is drawn from
this unaffected scene.

### Bounded transmitted-sun fixture

At the same 1280×720 viewport, 30 warm-up and 90 measured frames, glass-only
averaged 3.70 ms and combined transport 1.26 ms. Draws changed 322 → 310 and
triangles 367,608 → 367,584: three represented pane casters are removed from
four sun cascades while the map is active. Both runs retain 44 textures and
73 geometries. The adapter retains one 128² RGBA32F map, exactly **256 KiB**,
even while disabled, and adds one receiver lookup with no new scene render.
The timing difference is not a claimed optimization; short-run warming and
scheduling remain confounders. Aggregate completion only was timed here.

The runtime report verifies active loading, receiver ownership, shadow-caster
restoration and stale fallback for a moved pane, moved receiver and resized
receiver. Unit tests separately verify numerical transmittance/Fresnel,
unobstructed white, energy bounds and profile invalidation. Parallel thin sheets
do not focus sunlight, so no caustic-concentration result is claimed.

## Validation and reproduction

Passed: 88 focused Node tests covering the three building configs, derived
TerraMar variant, window settings, transport solver and shared bake framework.
Passed: browser material/persistence/curved-normal integration, twelve facade
capture cases (three buildings × two phases × two environments), transport
capture/invalidation, and actual gameplay control. Gallery image/reference
selectors were checked in Chrome. `git diff --check` is clean.

Use `node tools/bake.mjs --target lighting/illumination/glass-transmission` for
the bounded bake, then the standard selected-test runner for
`tests/headless/visual/specs/ai549_transport_capture.pwtest.js`. The facade and
gameplay scripts are documented in [the implementation contract](architectural_glass.md).
Set `GLASS_BASELINE_REF=ebec743` for historical capture and `GLASS_PHASE=before`
or `after`, `GLASS_ENV=daylight` or `street` for the facade runs. Machine browser
paths come only from the existing ignored shared bake configuration.
