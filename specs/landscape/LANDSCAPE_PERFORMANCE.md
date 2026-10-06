# Landscape performance measurements

Status: D7 verified. The final benchmark passed on 2026-10-03, including both cold/warm routes under both hard budgets and zero controlled allocations after disposal. All browser contexts were closed. The measured results below come from the completed receipt, not screenshot FPS labels.

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
| Standard (shipped, read from `LANDSCAPE_STREAMING_BUDGETS`) controlled CPU / estimated GPU budgets | 512 / 256 MiB since AI577 D4 (384 / 192 MiB in D2–D3); 512 / 448 MiB with the surface cache on at 1920 × 1080, the default since AI577 D7 (`landscapeSurfaceCacheBudgets` of the display: 588 at 2560×1440, 950 at 3840×2160) |
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

## Verification

`tests/node/unit/landscape_performance_capture.test.js` covers denied reservation rollback, bounded/drop-accounted frame and unique GPU sampling, prior-submission exclusion, and finish/abandon disposal without releasing terrain allocations. The browser benchmark verifies actual camera-driven I/O, resource limits, both fixed-position zoom modes, repeated coarsening/reload, and final zero controlled residency. Broader failure/cancellation/edit/source-fidelity gates remain in their focused D3–D7 suites.
