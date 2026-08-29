# Benchmark baselines

Saved measurements kept under version control so later changes can be compared
against them. `tests/artifacts/` is gitignored, so anything worth keeping has
to be copied here.

## Files

| file | what it captures |
| --- | --- |
| `shadow_modes_2026-08-15.json` | All shadow quality modes: off / low / medium / high / ultra / cascaded x2, x3, x4 |
| `shadow_modes_splitscale_2026-08-15.json` | Cascaded x4 at `splitScale` 1.0 / 0.75 / 0.55, plus off / high / x3 / x2 |
| `shadow_modes_with_culling_2026-08-15.json` | Same set, after visible-region caster culling landed — compare against the file above |
| `shadow_culling_correctness_2026-08-15.json` | Culling on/off draw calls and surviving caster counts at four camera/sun combinations |
| `shadow_modes_culling_and_merge_2026-08-15.json` | Same set again, after merged shadow casters landed — the current state |
| `shadow_merge_correctness_2026-08-15.json` | Merge on/off draw calls at four cameras, including a rooftop-level view |
| `ai499_type_quality_2026-08-15.json` | Every cell of the `type` x `quality` model (AI_499): off, single low/med/high, cascade low/med/high |
| `ai520_static_visibility_bake_2026-08-29.json` | AI_520 production PVS bake, storage/inventory, and 750-view native validation table |
| `ai520_static_visibility_runtime_2026-08-29.json` | AI_520 interleaved full-renderer A/B, lookup cost, and 12-case shadow-preservation matrix |
| `ai520_road_sensitivity_2026-08-29.json` | AI_520 full 1x/10x road-density table for merged and 1/2/4/5-cell chunks |

### The type x quality ladder (AI_499, measured)

Deltas against `off` = 10.89 ms, 3 of 5 passes accepted by the drift gate:

| cell | vs off | draw calls | VRAM | m/texel |
| --- | --- | --- | --- | --- |
| single/low | +2.91 ms | 2,643 | 64 MiB | 0.054 |
| single/med | +5.22 ms | 3,635 | 256 MiB | 0.049 |
| single/high | +5.93 ms | 4,003 | 1024 MiB | 0.042 |
| cascade/low | +4.63 ms | 2,899 | 320 MiB | 0.016 / 0.185 |
| cascade/med | +5.56 ms | 3,481 | 576 MiB | 0.012 / 0.040 / 0.185 |
| cascade/high | +7.24 ms | 3,987 | 832 MiB | 0.012 / 0.024 / 0.051 / 0.185 |

### Shadow optimisations, 2026-08-16

Each measured as a within-run A/B with minimum-of-many-samples. They come from
different runs, so the deltas are individually valid but should not be summed
against one absolute baseline.

| change | saving | evidence |
| --- | --- | --- |
| instanced facade detail stops casting | **3.99 ms** | cascade/high +6.59 -> +2.60 ms over `off`; 938 draw calls; 0.81 Mtri |
| shadow maps built once per frame | **0.63 ms** | 2 map rebuilds -> 1; 226 -> 113 shadow draws; **pixel-identical** |
| caster merge, buildings + props | **1.71 ms** | 1,557 -> 113 shadow draws (the buildings half predates today) |

Shadow-pass draws at cascade/high, directly instrumented by wrapping
`shadowMap.render` and `renderBufferDirect`:

| state | draws |
| --- | --- |
| no caster merge | 1,557 |
| buildings merged only (before 2026-08-16) | 472 |
| + props merged | 226 |
| + maps built once per frame | **113** |

Two things worth keeping in mind for the next round:

- **A geometry's material groups each cost a draw in the shadow pass**, where
  materials are irrelevant. Before the prop merge, 14 traffic signs produced 73%
  of all shadow draws — a 56-triangle stop sign cost 16-24 draws through 4
  material groups times the cascades it touched.
- **Pin shadow-map construction to the pass that produces the visible image.**
  The pipeline renders the scene several times per frame, and the sun-bloom
  occlusion pass swaps in dark materials; building the maps during it changed
  0.68% of pixels. Building them for the main composer pass instead is
  pixel-identical, because that pass was already the last to rebuild them.

### The cost model, re-derived 2026-08-16

`shadow_cost_model_2026-08-16.json`, `shadow_instanced_casters_ab_2026-08-16.json`

The AI_484 conclusion — "shadow cost is geometry throughput" — **no longer
holds**. It was measured before caster culling, merged casters and dropping
instanced facade detail; those cut caster geometry to ~0.27M triangles, which
at 1.3-2.4 ms/Mtri cannot account for the cost that remains. Re-measured from
scratch, with `off` = 8.77 ms and instanced casters off (the shipped default):

| config | vs off | draw calls | Mtri |
| --- | --- | --- | --- |
| cascade/low | +1.31 ms | 2,519 | 2.37 |
| single/high | +1.80 ms | 3,023 | 4.06 |
| cascade/high | +2.60 ms | 3,049 | 3.35 |
| cascade/high, instanced casters ON | +6.59 ms | 3,987 | 4.16 |

What the cost is **not**:

- **Not per-lit-pixel.** At a quarter of the screen area the shadow delta was
  unchanged: single/high 2.44 -> 2.41 ms (1.01x), cascade/high 3.60 -> 4.10 ms.
  The CSM receiver shader is not the bottleneck.
- **Not map resolution, below 16384.** At a fixed 200 m reach: 2048 +1.90 ms,
  4096 +1.79, 8192 +1.75 — 16x the texels for nothing. But **16384 jumps to
  +4.34 ms**, a cliff rather than a slope, at the point the map becomes a 1 GiB
  allocation.
- **Not triangles, at this scale.** 0.81M triangles separate instanced-on from
  instanced-off, but they cost 3.99 ms — roughly 5 ms/Mtri, against the 1.3-2.4
  measured when geometry really was the bottleneck.

What it tracks is **draw calls in the shadow passes**, at very roughly 2-3 us
each: the 938 calls that instanced casters add cost 3.99 ms. So the lever is
fewer shadow-pass draws, not fewer triangles — box-proxy casters were measured
and rejected on exactly this basis (all 66 merged building casters together hold
162k triangles, median 282 per building; removing every one of them saves
0.27 Mtri and under 0.3 ms, inside the noise).

**Method note — benchmarking a machine in intermittent use.** Contamination only
ever makes a sample slower, so take the **minimum** over many short interleaved
bursts rather than a median: configs round-robin, 8 rounds x 6 bursts of 12
frames, report min with median alongside as a noise signal. The previous
attempt at this measurement used medians with a pass-level drift gate, got 1/5
passes accepted, and produced a physically impossible negative shadow cost. With
minima the same machine gave noise ratios of 1.11-1.34x and reproducible
numbers.

**The earlier cascade figures (+6.33 / +8.27 / +10.23) were wrong** — the sweep
script that produced them set `city._shadowCuller = null` right after
`_deactivateCascadedShadows()` had restored every `castShadow` flag, so those
runs measured cascades with visible-region caster culling switched off.
Cascade cost was overstated by 1.7-3.0 ms. Anything that nulls the culler is
measuring a configuration the game never ships.

Cumulative effect on cascaded x4 at bus level, each stage measured with a
passing contamination check:

| stage | frame | draw calls |
| --- | --- | --- |
| baseline (AI_484 as shipped) | 24.18 ms | 9,862 |
| + visible-region caster culling | 20.15 ms | 6,100 |
| + merged shadow casters | **14.87 ms** | **3,523** |

Both stages are provably lossless: the rendered image is pixel-identical with
each optimisation on and off. For reference the single-map `high` preset in the
same run is 9.62 ms / 2,938 calls — so cascaded now costs ~1.5x the frame time
of the old mode while carrying 4.4x the near texel density and triple the
range.

Both were taken on the same machine (RTX 3060, 1280x720, WebGL2) on
2026-08-15, at commit `3a043dd`, with the shadow work of AI_484 complete:
4 cascades, splits 45/90/190/340 m, per-cascade maps 8192/8192/8192/4096.

## Method (repeat this exactly or the numbers are not comparable)

1. **Close the game.** Anything else using the GPU inflates results by
   1.5-1.7x and can even invert the ranking of two configs. This is not
   hypothetical — it happened twice during AI_484.
2. Serve the repo and **verify the server serves the working tree** (fetch a
   file you just edited and grep for the change). A stale server rooted in
   another checkout silently benchmarks old code.
3. Drive the frame loop manually — `?pose=` pauses the game loop, so each
   sample is `city.update(engine)` + `engine.renderFrame()` in a burst,
   terminated by `gl.finish()` so GPU work is included.
4. Neutralise `GameplayState._updateChaseCamera`; the live rAF loop otherwise
   moves the camera between samples.
5. Discard a warm-up burst (shader compiles, cold caches), then take the best
   of two 30-frame rounds at each camera.
6. **Measure a reference config first and last.** If the two disagree by more
   than ~15%, something else was using the GPU and the run is void. Both saved
   runs pass this check (0.0% and 1.6% drift).

## Noise floor, and the half-rate AO trap

**GTAO defaults to `half_rate`, so the AO pass fires on every other frame.** In
a completely frozen scene (fixed camera, culler parked, caster count verified
identical) draw calls alternate in a strict two-frame cycle — measured
3,132 / 4,099 / 3,132 / 4,099. Consequences:

- `renderer.info.render.calls` read after a burst is **phase-dependent**. Two
  readings of the same config can differ by 60% purely on which frame landed
  last. Read it across an even number of frames, or accept it as a range.
- Any burst must span an **even** frame count so the AO phase balances out.
- For measuring something small, switch AO off for the duration
  (`setAmbientOcclusionSettings({ mode: 'off' })`) rather than trying to
  average the oscillation away.

## Never compare configs across page loads

**A fresh browser warms up over its first several page loads, and the trend is
big enough to invert results.** Measured in one run: `off` at 19.15 ms on the
first page and 4.42 ms on the last — 77% drift, same config. Whichever config
is measured last looks fastest, which silently manufactures conclusions. One
earlier finding here ("shadow cost rises at smaller viewports") was an artifact
of exactly this and had to be withdrawn.

The reliable shape is **one page, configs switched at runtime, visited
round-robin** so residual drift hits every config equally, comparing medians.
`engine.setShadowSettings(...)` + `city.applyShadowSettings(engine)` switches
quality live; allow ~250 frames plus a few seconds afterwards, because changing
shadow mode recompiles thousands of materials. Done this way, per-config spread
drops to 2-8% and the numbers reproduce.

With that method (AO off, scene frozen, culler parked, GPU idle) the harness
resolves a few milliseconds. Anything under ~2 ms still cannot be separated
from noise — report it as bounded ("under 1 ms"), not as a value.

## Reading the numbers

`perPose.busLevel.msPerFrame` is a synchronous burst average, not real frame
pacing — treat it as a comparison between configs on one machine, not as an
FPS prediction. `drawCalls` is a whole-frame accumulation across shadow, scene
and post passes (`PostProcessingPipeline` sets `info.autoReset = false`), so it
is not "objects on screen". Subtract the `off` row to isolate shadow cost.

Headline results are written up in
`prompts/AI_DONE_484_SHADOWS_cascaded_shadow_maps_and_sun_light_ownership_DONE.md`.
