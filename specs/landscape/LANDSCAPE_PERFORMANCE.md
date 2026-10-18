# Landscape performance measurements

Status: AI 596 D6 wrote the same-condition tables (coastal v2 at the current shipped profile against coastal v3 with the surround, cold and warm loads, both surface-cache modes, residency) with their conditions under `tests/artifacts/screens/landscape/ai596/d6/performance/PERFORMANCE.md` (2026-10-11; the GPU was not idle, the Codex desktop app's process held 29–41%, so the rows are same-condition against each other): with the surface cache on at 640/544 both landscapes stay vsync-bound at 17.50 / 18.10 ms while the GPU pass grows from 1.03 / 2.74 ms (v2) to 5.01 / 6.83 ms (v3 with the surround); with the cache off at 640/352 v2 stays vsync-bound (GPU 3.10 / 11.49 ms) and v3 is GPU-bound at 17.60 / 35.10 ms cold, 51.4 FPS (GPU 10.33 / 35.89 ms: the uncached surface program over 3.2× the triangles at the heaviest stops). The v2 numbers below are the historical AI 576 D7 baseline, not a same-condition v2 row. D7 verified: the final benchmark passed on 2026-10-03, including both cold/warm routes under both hard budgets and zero controlled allocations after disposal. All browser contexts were closed. The measured results below come from the completed receipt, not screenshot FPS labels.

## Repeatable run

Use the existing landscape authoring server on **port 8002**, and the existing selected-test runner with `tests/headless/e2e/landscape_performance.pwtest.js` selected. Set `E2E_BASE_URL=http://127.0.0.1:8002` and `E2E_OUTPUT_DIR=tests/artifacts/screens/landscape/ai576/d7/performance/playwright`. The configured `PLAYWRIGHT_EXECUTABLE_PATH`, when required by the host, selects the installed Chromium executable. Run `node tools/run_selected_test/run.mjs`. Do not run another graphics browser workload concurrently.

The test runs serially, owns one browser context at a time, disposes the viewer, checks zero remaining controlled allocations, and closes the context in `finally`, including on failures. It never changes the terrain, asset manifest, saved bookmarks, or shipped memory defaults. Screenshots and machine-readable receipts remain gitignored:

- `tests/artifacts/screens/landscape/ai576/d7/performance/report.json`: conditions, source identities, every pose, timing/statistics, residency, request totals, and startup assertions.
- `comparison.md`: generated same-condition table, including an explicit unmeasured full-resident reference row.
- `<profile>-<cache>-<stop>-frames.json`: bounded flat frame/GPU arrays and column names.
- `<profile>-network.json`: actual landscape asset requests, declared channel sizes, response-body sizes and cache policy, plus final disposal state.
- `<profile>-<stop>.png`: overview, close approach, and close orthographic material evidence. Screenshots occur after the sampled frame window.

## Fixed conditions

The source is the retained **Coastal City Terrain v2** landscape: 4,000 × 4,000 meters, 2,049 × 2,049 native vertex samples, 1.953125-meter spacing, 64 native 257 × 257 tiles within the 85-node hierarchy. Each receipt records the canonical manifest SHA-256, revision, and original source SHA-256. All profiles use the same source and route.

| Setting | Value |
| --- | --- |
| Browser viewport / device scale | 1920 × 1080 / DPR 1 |
| Drawing buffer | Recorded separately; normally 1920 × 1056 because the shared 24-pixel PerfBar remains visible |
| Standard (shipped, read from `LANDSCAPE_STREAMING_BUDGETS`) controlled CPU / estimated GPU budgets | 688 / 432 MiB since AI 597 D4 (688 / 416 in D2 and D3, 672 / 416 in D1: the AI 596 D5 640 / 352 plus the animated ocean's share, LANDSCAPE_OCEAN.budgets, 32 / 64 MiB in D1 and 48 / 64 MiB since D2, held in the ledger for the view's lifetime; 512 / 256 MiB in AI577 D4 – AI 596 D4, 384 / 192 MiB in D2–D3); 640 / 544 MiB with the surface cache on at 1920 × 1080, the default since AI577 D7 (`landscapeSurfaceCacheBudgets` of the display: 684 at 2560×1440, 1046 at 3840×2160; 448 / 588 / 950 before D5). The D5 raise is the render-only surround's 128 / 96 MiB share ("Far-field surround" below) |
| Frame pipeline (AI 597 D5, `LandscapeFramePipelineModel`, outside the ledger) | 41.5 MB at 1920 × 1080 (RGBA16F frame target 16.6, depth renderbuffer 8.3, RGBA16F scene copy 16.6), 71 MB at 2560 × 1440, 166 MB at 3840 × 2160; display-sized like the canvas, which keeps its own multisampled buffers; reported by `snapshot().pipeline` |
| Water review poses (AI 597 D7) | same-condition tables of the flat reference and the animated ocean at the three quality presets in both surface-cache modes at NW-09, NW-10, NW-11, NW-12, OS-01, OS-04, OS-06 and OS-07: [LANDSCAPE_OCEAN.md](LANDSCAPE_OCEAN.md) §6 (`tests/artifacts/screens/landscape/ai597/d7/perf/PERF.md`) |
| Historical controlled CPU / estimated GPU budgets | 128 / 64 MiB (the AI 576 D7 standard) |
| Constrained controlled CPU / estimated GPU budgets | 48 / 24 MiB |
| Appearance | Shaded, calibrated world-scaled PBR; separate sea-level water enabled |
| Inspection/planning | Wireframe, grid, axes, LOD tint, boundaries, reference guides, and diagnostics disabled |
| Renderer | Existing antialiasing, low-power preference, ACES tone mapping and exposure 1.2; actual context settings recorded |
| Per-frame combined upload cap | 8 MiB across geometry, appearance, and planning |
| Warm-up per settled stop | 30 render frames discarded |
| Measurement per stop | 120 consecutive render frames |
| GPU query completion tail | Four additional frames; unmatched pending queries are reported, never copied from another frame |
| Optional measurement buffers | 4,096 frame/GPU slots, 458,752 controlled CPU bytes (448 KiB); no GPU allocation |

Profiles run in the order standard, historical, constrained. Results recorded below this section are historical AI 576 D7 measurements under the former 128/64 MiB standard; the AI577 D2 three-profile receipt is `tests/artifacts/screens/landscape/ai577/d2/prerequisites/performance/`. In that run the shipped profile reaches requested detail at every route stop (peak 166.19 MiB CPU / 111.68 MiB GPU), the historical profile is GPU-limited at the approach and orthographic-in stops, and the constrained profile peaks at 40.31 / 23.54 MiB. Initial budget overrides are applied before `LandscapeView.load()` using `landscapeCpuMiB` and `landscapeGpuMiB` URL parameters. Values must represent positive safe integer byte counts and cannot exceed the respective shipped default. A constrained startup never first loads at the standard profile. Ordinary viewer usage has no active capture buffer.

The route contains 11 stops: distant overview; a 30-frame approach to the highest-error level-2 coastal tile; a 30-frame traversal to another high-error tile at least 1,500 meters away; a fixed-position perspective view with FOV 100 → 5 → 100 degrees; a fixed-position orthographic view with 12,000-meter span and zoom 1 → 70; a 2,000-meter span at zoom 100 to exercise 20-meter appearance detail; orthographic zoom-out; and return to the initial distant overview. Exact positions, targets, projection settings, and interpolation counts are saved in the receipt. Frame-stepped movement and settled holds are deterministic; this is not a timed driving simulation.

AI577 D2 adds generated fine coverage pages, the shared native warp and material clump relief.
Its matched four-pose measurements (fine detail off / 50 cm / 25 cm GPU, residency, memory and
cold-load times) are recorded in [LANDSCAPE_SURFACE_DETAIL.md](LANDSCAPE_SURFACE_DETAIL.md)
"Measured results" and in the AI 577 completion record; the user's realism-first direction
defers reductions to D6.

## Cold and warm meanings

Each memory profile starts in a fresh browser context and viewer. This is the **cold context/load** row. It does not claim a cold operating-system disk cache, a restarted GPU driver, or a new Chromium process for every profile.

After the first route returns to coarse coverage, the viewer returns to the identical initial home pose and reloads in the same browser context. Home-positioning requests belong to a separate `preparationNetwork` receipt and are excluded from startup/route totals. The complete route then repeats. This is the **warm context/reload** row: code, driver and OS caches may be warm; fine CPU/GPU terrain and appearance residency has been released. It does not imply warm HTTP-cache hits. Request receipts record response `Cache-Control`, completed encoded body sizes, and failed/canceled requests. The authoring server serves static assets with `no-cache` and ETags; API JSON uses `no-store`.

The standard profile runs first, followed by the constrained profile in another fresh context of the same Chromium process. Driver and OS caches can therefore differ between the two cold-context startups. A shorter startup must not be attributed to the memory limit alone.

The receipt verifies that startup has only the root geometry leaf, no decoded native geometry sources, and fewer than all native height payloads requested. Returned overview allocation and renderer geometry/texture counts must match across both complete routes. Every stop must retain complete nonoverlapping terrain coverage, obey current and peak CPU/GPU limits, remain within the combined upload cap, and expose a degradation reason when the screen-error goal is unmet.

## Metric interpretation

- **Frame interval** is the viewer's actual `requestAnimationFrame` interval, including browser scheduling and instrumented test overhead. Median and nearest-rank p95 are reported; pooled route results combine equal-size settled windows. Mean FPS is `1000 / mean(frame interval)`. This includes browser pacing and is not uncapped renderer throughput. No portable FPS pass threshold is asserted.
- **CPU frame work** measures the synchronous viewer tick through the renderer submission and PerfBar update. It excludes asynchronous worker CPU, compositor execution, and the recorder's own write. Geometry and appearance streaming costs are separately recorded. This is not total process CPU time.
- **GPU frame time**, when available, uses the existing disjoint timer-query implementation. Only unique completed queries whose submission IDs match sampled frames enter the statistics. Unsupported, disabled, or unmatched timing remains **not measured** with a reason. Query time covers the renderer pass, not every system GPU task.
- **Controlled CPU bytes** include allocated/committed terrain buffers and pre-admitted worker, decode, upload, old/new-transition and optional measurement reservations. They exclude general JavaScript objects, browser/worker runtime heaps, compositor buffers and process overhead. **Estimated GPU bytes** are the shared buffer/texture allocation ledger, not a driver VRAM reading.
- **Peak CPU/GPU bytes are profile-lifetime high-water marks.** The warm row includes peaks from the preceding cold route and reload. They are not independently reset warm-run peaks. Per-stop current values are also retained.
- **Resident source bytes** describe currently decoded height/cover channel arrays. **Logical payload I/O bytes** sum authenticated declared height, cover and prepared material-page sizes for completed requests, including repeated requests. **Encoded response-body bytes** come from Playwright's request-size receipt. Neither is inferred from elapsed request time. Manifest/reference requests are listed separately; code, fonts, shader files and global PBR configuration metadata are outside this landscape payload total.
- **Triangles/draw calls** come from the active renderer after its render, including visible water and any enabled content. Geometry inventory triangle counts also include actual skirts. **Upload bytes** sum actual geometry/appearance/planning upload work across both loading and settled frames within each capture; the maximum per frame must remain at or below 8 MiB.
- **Time to coarse coverage** is measured from the start of `load()` to the first frame that renders the newly validated root. Cold navigation-to-coverage is additionally recorded, including module/bootstrap time. **Settled startup** includes appearance and reference readiness.
- **Time to requested detail** is only populated when geometry and appearance meet their requested goal. Under budget or source degradation it remains null, with a separate measured time to the valid settled fallback and its reason. A settled lower-detail result is not mislabeled as target detail. Camera-to-settled timing is an observed upper bound: the harness checks every six frames and requires two consecutive settled checks.

Travel/loading/settling frame statistics are separate from the 120-frame steady window. Their raw prefix excludes the final 30 warm-up, 120 measurement, and four GPU-query-tail frames at each stop. Those prefixes include the actual 30-frame camera traversals and the bounded settle polling overhead. The raw receipt remains available so a pooled steady FPS cannot conceal a navigation or upload stall.

The recorder reserves its two fixed typed arrays before allocation, refuses admission on budget pressure, stops accepting samples at its bounded capacity, and exposes dropped-sample counts. Tests fail if a sampling window overflows. Completion, budget replacement, and viewer disposal release these arrays and their ledger entry. Report serialization and Node-side statistical processing occur after the sampled window and are test-output work, not retained landscape residency.

## Full-resident comparison

A full native coastal render is **not measured**: this benchmark does not override hard memory budgets to force an unsafe reference allocation. The comparison table retains an explicit unmeasured reference row. No frame-time or FPS prediction substitutes for a measured result.

The separate analytic inventory is exact for its stated layouts:

- 2,048 × 2,048 cells × 2 = **8,388,608 native surface triangles**.
- A single float32 XYZ position array and uint32 triangle-list index array require `2049² × 12 + 8,388,608 × 3 × 4 = 151,044,108` bytes before normals, materials, textures, or temporary overlap. This is a specified indexed-reference layout, not a universal lower bound across all possible compression/topology schemes.
- Summing `estimateLandscapeMeshBuffers()` across all 64 native tiles gives the current adapter's full native geometry inventory, including skirts, normals, parent attributes, colors and indices; the measured receipt reports that arithmetic separately.

Even the stated position/index-only reference (144.05 MiB) exceeds the historical 64 MiB and constrained 24 MiB GPU profiles; it fits the shipped 256 MiB profile, and the full native adapter inventory (224.41 MiB) exceeds the historical and constrained profiles; since AI577 D4 the shipped 256 MiB GPU limit could hold that geometry alone, though not with appearance resources. The constrained profile therefore demonstrates a bounded working set on the real coastal source without a synthetic high-resolution claim.

## Recorded results

Final receipt: `tests/artifacts/screens/landscape/ai576/d7/performance/report.json`, started **2026-10-03 07:34:42 UTC**. Host: AMD Ryzen 5 9600X, 12 logical CPUs, 33,463,193,600 usable RAM bytes; Windows build 10.0.26200 x64. Browser: headless Chromium **151.0.7922.34**. Actual WebGL2 renderer: **NVIDIA GeForce RTX 3060 through ANGLE/D3D11**. The configured viewport was 1920 × 1080 DPR 1; the actual drawing buffer was 1920 × 1056. Source manifest SHA-256 was `58fc747102857c7d2b05c0aa991604d958379a4065e709ca3c1da4438b26f7b4`, revision `hierarchy-afaf934f8eb8fe074a0affb0`.

Each row contains 1,320 settled frames and 1,320 matched, completed GPU queries. CPU and GPU timing columns are median / p95 milliseconds.

| CPU/GPU budget MiB | Context/load | Frame interval ms | Mean FPS | Synchronous CPU ms | Measured GPU ms | Coarse / settled startup ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 128 / 64 | Cold | 17.40 / 18.10 | 57.43 | 0.30 / 0.60 | 3.50 / 5.43 | 573.1 / 1008.6 |
| 128 / 64 | Warm | 17.40 / 18.10 | 57.45 | 0.30 / 0.50 | 3.47 / 5.40 | 100.7 / 526.6 |
| 48 / 24 | Cold | 17.40 / 18.10 | 57.45 | 0.30 / 0.60 | 3.51 / 5.00 | 94.4 / 515.0 |
| 48 / 24 | Warm | 17.30 / 18.10 | 57.49 | 0.30 / 0.50 | 3.65 / 5.08 | 98.0 / 523.9 |
| Full coastal resident reference | Not measured | not measured | not measured | not measured | not measured | not measured |

Cold navigation-to-first-coarse-frame was 771.6 ms for the standard profile and 330.6 ms for the constrained profile. Profile ordering and cache scope are described above; these single-run startup differences do not isolate the effect of changing the budget.

| Profile MiB | Controlled CPU returned overview / lifetime peak MiB | Estimated GPU returned overview / lifetime peak MiB | Resident geometry leaves | Drawn triangles / draw calls across sampled views | Route upload bytes MiB |
| --- | ---: | ---: | --- | --- | ---: |
| 128 / 64 | 18.70 / 98.95 | 11.51 / 63.82 | 1–13; up to 4 native leaves | 133,124–798,724 / 3–8 | 244.16 per route |
| 48 / 24 | 11.20 / 38.04 | 6.51 / 23.77 | 1–4; geometry remained at levels 0–1 | 133,124–399,364 / 3–5 | 60.63 per route |

Cold and warm routes returned to exactly the same current CPU/GPU bytes and renderer geometry/texture counts within each profile. The maximum combined upload was **4,194,300 bytes in one frame**, below the 8 MiB cap. Disposal returned both controlled CPU and estimated GPU residency to zero. Every startup requested **zero native height payloads**, retained **330,245 source-channel bytes**, and completed **668,169 logical terrain/material payload bytes**; it did not fetch/decode/upload the full native grid.

| Profile MiB | Logical payload bytes per route MiB, cold / warm | Encoded response bodies MiB, cold / warm | Unique native-height payload URLs completed per route |
| --- | ---: | ---: | ---: |
| 128 / 64 | 57.17 / 57.17 | 25.10 / 0.00 | 18 of 64 |
| 48 / 24 | 22.74 / 22.74 | 10.44 / 0.06 | 15 of 64 |

These are terrain/appearance channel requests, including source-only prefetch; they are not counts of rendered native meshes. Repeated request bodies can come from the browser cache after revalidation. The measured static response policy was `no-cache`; the receipt does not classify individual cache hits. Temporary warm home-positioning I/O is separately recorded and excluded from these totals.

Travel/loading/settling frames were measured separately. CPU/GPU values below are p95 / maximum milliseconds, not the settled values above:

| Profile / load | Transition frames | Frame interval p95 / maximum ms | Synchronous CPU p95 / maximum ms | GPU p95 / maximum ms |
| --- | ---: | ---: | ---: | ---: |
| 128 / 64 cold | 1002 | 18.10 / 18.60 | 1.00 / 5.60 | 6.84 / 10.54 |
| 128 / 64 warm | 1002 | 18.10 / 18.60 | 0.90 / 1.90 | 7.25 / 13.58 |
| 48 / 24 cold | 564 | 18.10 / 18.40 | 0.80 / 6.00 | 6.64 / 13.60 |
| 48 / 24 warm | 558 | 18.10 / 18.70 | 0.70 / 1.40 | 8.95 / 13.75 |

Selected detail-change latencies below are observed camera-to-settled seconds, cold / warm. They begin after the 30-frame movement where applicable. A GPU-limited result is valid fallback coverage, **not** attainment of requested detail:

| Stop | Standard seconds | Standard result | Constrained seconds | Constrained result |
| --- | ---: | --- | ---: | --- |
| Approach A | 2.820 / 2.822 | GPU-limited; 13 / 16 desired geometry leaves | 1.152 / 1.043 | GPU-limited; 4 / 16 leaves |
| Approach B | 3.139 / 3.127 | GPU-limited; 13 / 22 leaves | 1.251 / 1.254 | GPU-limited; 4 / 22 leaves |
| Fixed-position perspective FOV 5° | 1.033 / 1.031 | Requested detail reached; 7 / 7 leaves | 0.928 / 0.941 | GPU-limited; 4 / 7 leaves |
| Fixed-position orthographic zoom 70 | 1.870 / 1.880 | Requested detail reached; 13 / 13 leaves | 1.246 / 1.253 | GPU-limited; 4 / 13 leaves |
| Orthographic 20-meter span | 1.883 / 1.861 | Geometry ready; finer appearance GPU-limited | 0.516 / 0.516 | Geometry and appearance GPU-limited |

All overview/wide/zoom-out endpoints attained their requested coarse detail; their per-stop timings are in the receipt. The two profiles retained continuous coverage throughout. Similar paced FPS does not mean equal visual detail: the constrained profile deliberately kept fewer geometry and appearance resources.

The analytic reference inventories were **144.05 MiB** for the specified full-grid position/index layout and **224.41 MiB** for all current native adapter geometry, before appearance or overlap. No full-resident performance measurement or inferred FPS is claimed.

## Runtime surface cache (AI577 D6)

`LANDSCAPE_TEST_SURFACE_CACHE=on` runs the route with the cache at 512/448 MiB; 128/64 and 48/24 cannot admit
an atlas and run uncached. Run close in time to the uncached run: GPU median 4.1/3.9 ms cold/warm against
5.6/5.6 (p95 5.8 against 11.4), CPU frame median 0.7 against 0.5 ms, estimated GPU current/peak 201/325 against
43/167 MiB, settled startup 8.6/3.8 s against 7.4/0.8 s (a warm reload regenerates every page). Whole-run GPU
timings drift 1–2 ms between runs; only paired measurements compare tightly. Receipts:
`tests/artifacts/screens/landscape/ai577/d6/cache-final/suites-on|off/`. AI577 D7 runs the route with the default (cache on):
512/448 MiB, frame median 17.5 ms (p95 18.1), peak estimated GPU 339 MiB against 167 MiB at 512/256 with the cache off
(receipts `tests/artifacts/screens/landscape/ai577/d7/cache-default/suites-default|off/`); paired 1440p/4K GPU and the
motion review are in LANDSCAPE_APPEARANCE_RUNTIME.md.

## Fixture resolution harness (AI 596 D3)

`tests/headless/e2e/landscape_resolution.pwtest.js` measures the terrain-synthesis fixture landscapes at the three
candidate native spacings (`assets/public/landscape/ai596-d3-fixture-{1953,0977,0488}` and the 4 km
`-4km-{1953,0977}` variants; `LANDSCAPE_RESOLUTION_FIXTURES` selects other ids or saved landscape directories;
`LANDSCAPE_RESOLUTION_ARTIFACTS` moves the receipts to another directory under the repository; `LANDSCAPE_RESOLUTION_ROUTE=natural-world`
replaces the bounds-scaled fixture route with the AI 596 D4 coastal city route, the natural-world poses resolved on the measured
landscape's own native ground: NW-13 overview, a 30-frame flyover to NW-10, NW-03 bluff toe, NW-08 low city, NW-01 beach, the
orthographic probe camera over the same 41 × 31 m patch translated onto the high-city south flank below NW-07 (x 3279–3320, z
2715–2744, inside one 250 m native tile of a 4097² landscape), return; `LANDSCAPE_RESOLUTION_SETTLE_MS` raises the 60 s settle limit).
Run it like the coastal benchmark through `node tools/run_selected_test/run.mjs` with
`E2E_BASE_URL=http://127.0.0.1:8002`, but with **no server running on 8002**: the test serves each fixture itself
on that port (`createLandscapeServer({ root, landscapeDirectory })`) and asserts that the served manifest is the
fixture's file byte for byte, so the canonical cache is never involved. A fixture whose `manifest.json` is missing
is skipped with a `not measured` receipt. Per fixture it records, under
`tests/artifacts/screens/landscape/ai596/d3/browser/<fixture>/`: the shipped profile of the run's surface cache
mode at 1920 × 1080 DPR 1; startup (no native height payload requested before the first covered frame, measured
from request timing against the page clock; what was fetched; coarse/settled startup; program compile ms); a
five-stop route derived from the manifest bounds (overview from the sea, a 30-frame approach to the bluff crest,
the gully close pose, a top-down orthographic close view over the probe patch, return) with 30 warm-up + 120
sampled frames per stop (frame interval, synchronous CPU, GPU ms; draw calls, triangles; resident leaves by level;
controlled CPU / estimated GPU current and lifetime peaks; uploads per frame ≤ 8 MiB and route totals; time to
settled detail and whether the 1.5 px geometry target was met); 64 picking probes (32 native vertices shared by
all spacings, 32 finest-cell centers on the gully D patch, raycast from the orthographic view against the
authoritative native height at the hit) and 64 `select()` queries that must return the stored float32 heights
exactly at vertices; disposal to zero controlled allocations. `comparison.md` beside the receipts is regenerated
from every receipt present. Fixtures saved without an appearance sidecar render fallback soil colors (the viewer
records `[Landscape] appearance manifest HTTP 404`), so these numbers exclude PBR materials and surface detail.

## Far-field surround (AI 596 D5)

The render-only surround (LANDSCAPE_STREAMING.md "Far-field surround") streams a second terrain document beside
the authoritative one, so its cost is measured with the natural-world route of the fixture harness
(`LANDSCAPE_RESOLUTION_FIXTURES=coastal-city-v3 LANDSCAPE_RESOLUTION_ROUTE=natural-world`, `LANDSCAPE_RESOLUTION_SURROUND=on|off|<url>`,
receipts under `tests/artifacts/screens/landscape/ai596/d5/browser/<run>/coastal-city-v3/`, 1920 × 1080 DPR 1, surface cache on,
RTX 3060 through ANGLE/D3D11, Chromium 151, 30 warm-up + 120 sampled frames per stop, no bake running; the `off at 512/448`
row is the AI 596 D4 receipt of the same machine and route). The surround document of the first runs was the D5 placeholder
sidecar (written into the cache root with `writeSynthesizedLandscape`, 2049² at 15.625 m, 85 nodes, bound to the v3 revision; deleted
once the sidecar was published), then the published sidecar `assets/public/landscape/coastal-city-v3/surround` at the same grid and
node count, so the residency figures carry over. "Surround" bytes are its own
ledger kind inside the shared totals; "GPU ms" is the renderer pass (both terrains, water, backdrop).

| Run (profile CPU/GPU MiB, surround share) | Settled startup ms | Lifetime peak CPU / GPU MiB | Surround tiles (levels) and bytes CPU / GPU MiB (peak) | Authoritative leaves at NW-10 / NW-03 / NW-08 / NW-01 | 1.5 px met | GPU ms median / p95 | CPU ms median / p95 | Max triangles / draws | Route uploads MiB (max per frame) | Settle ms NW-10 / NW-03 / NW-08 / NW-01 |
| --- | ---: | ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| off at 512/448 (D4 receipt) | 12,106 | 416.5 / 448.0 | — | 46 / 46 / 55 / 40 | overview, ortho, return | 5.71 / 7.86 | 2.00 / 3.70 | 4,577,966 / 39 | 1,037 (7.77) | 5,697 / 7,189 / 8,295 / 6,696 |
| on at 512/448, share 96/64 | 15,291 | 438.3 / 448.0 | 13 (L1 1, L2 12) at every stop, 76.7 / 49.1 (95.8 / 59.6); CPU share saturated, 2,097 → 10,030 share denials | 31 / 31 / 40 / 34 | overview, ortho, return | 6.59 / 8.55 | 1.90 / 2.90 | 4,502,566 / 37 | 756 (5.9) | 5,680 / 5,663 / 5,254 / 4,731 |
| on at 640/544, share 128/96 (shipped since D5) | 12,789 (surround decided 9.0 s later in the background, its program compile 8.9 s) | 569.7 / 543.9 | 19 (L2 15, L3 4: the four natives under the camera) at NW-10/NW-03/NW-01, 16 at NW-08 and the probe camera, 108.0 / 70.1 (127.8 / 80.6); share denials 682 → 7,815 | 52 / 52 / 61 / 49 | overview, NW-08, ortho, return | 6.99 / 8.69 | 1.90 / 2.90 | 6,792,872 / 56 | 1,262 (7.8) | 6,613 / 8,498 / 8,629 / 8,086 |
| off at 640/544 | 9,083 | 535.3 / 542.1 | — | 73 / 64 / 61 / 67 | overview, NW-03, NW-08, ortho, return | 6.20 / 8.71 | 1.70 / 2.80 | 6,327,982 / 57 | 1,419 (5.9) | 8,087 / 10,716 / 8,924 / 10,612 |
| on at 640/544, the published sidecar (`coastal-city-v3-surround` `synthesis-3034994a218a819ca042438f`, served from its cache-root copy) | 15,202 (includes the surround's 11.2 s background load and compile, which the harness waits for) | 565.6 / 543.9 | 19 (L2 15, L3 4; L1 1, L2 10, L3 8 at NW-08 and NW-01), 108.0 / 70.1 (128.0 / 80.6); share denials 1,370 → 18,093 | 52 / 52 / 61 / 49 | overview, NW-08, ortho, return | 6.65 / 8.18 | 2.20 / 3.40 | 7,192,232 / 59 | 1,229 (7.3) | 5,896 / 8,595 / 8,895 / 8,095 |

The last row measured the surround revision published at the time (`synthesis-3034994a218a819ca042438f`). The refined
revision published later on 2026-10-10 (`synthesis-857ae85a2b611d24990fafdc`, snapshot `manifest.245cc763…json`, the one
the cache holds) has the same grid and node count and was not re-timed in D5 (another session held the GPU during the
re-run window), so its residency figures carry over and its timing is re-measured by the D6 tables.

Reading: at the pre-D5 512/448 MiB profile the surround (the overview, one level-1 and twelve level-2 tiles, 49 MiB of GPU) took
its room from the authoritative stream, which sat at the 448 MiB GPU ceiling at every ground stop and lost 15 to 20 leaves per stop
against D4; the surround's own 96 MiB CPU share saturated at 13 tiles (the four 4 km natives under the camera were denied) — the
shipped profile could not hold v3 and the surround. The constants were raised by exactly the surround share: `LANDSCAPE_STREAMING_BUDGETS`
512/256 → **640/352 MiB**, `LANDSCAPE_SURFACE_CACHE_BUDGETS` 512/448 → **640/544 MiB** (the 2560×1440 and 3840×2160 profiles 588/950 →
684/1046), `LANDSCAPE_SURFACE_CACHE.streamReserveGpuBytes` 256 → **352 MiB** (the cache ceiling stays 192 MiB), and the share
`LANDSCAPE_SURROUND.budgets` to **128/96 MiB** (room for the four natives, their twelve level-2 neighbours, the hidden ancestors and the build
peaks). At 640/544 the authoritative stream holds more leaves than in D4 at every ground stop and reaches the 1.5 px target at NW-08
(the other three ground stops still settle with `gpu-budget`, the D4 finding carried into D6), the surround reaches its natives, and the
renderer pass costs 1.3 ms more at the median than the D4 run (the surround's 2.1–2.5 M triangles and up to 19 draws) while the frame stays
vsync-bound at 60 FPS. Without the surround the raised profile is filled by the authoritative stream itself (73/64/61/67 leaves, two more
stops at the 1.5 px target, GPU 6.20 ms): at the same 640/544 MiB the surround therefore costs about fifteen authoritative leaves at the
ground stops and +0.8 ms of GPU time at the route median, with the authoritative stream never below its D4 residency. The surround's cold program compile (its own terrain variant, 6–9 s on this host) runs in the background after `load()` returns,
so settled startup is unchanged. Picking and queries are unaffected (64 of 64 probe hits, 32 of 32 exact vertices in every run); disposal
returns every surround byte (0 entries of kind `landscape-surround` after dispose).

## Verification

`tests/node/unit/landscape_performance_capture.test.js` covers denied reservation rollback, bounded/drop-accounted frame and unique GPU sampling, prior-submission exclusion, and finish/abandon disposal without releasing terrain allocations. The browser benchmark verifies actual camera-driven I/O, resource limits, both fixed-position zoom modes, repeated coarsening/reload, and final zero controlled residency. Broader failure/cancellation/edit/source-fidelity gates remain in their focused D3–D7 suites.
