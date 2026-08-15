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

Headline of the culling change: cascaded x4 went 24.18 -> 20.15 ms at bus
level (9,862 -> 6,100 draw calls), and 30.27 -> 15.02 ms under a low sun, with
the rendered image pixel-identical either way.

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

## Reading the numbers

`perPose.busLevel.msPerFrame` is a synchronous burst average, not real frame
pacing — treat it as a comparison between configs on one machine, not as an
FPS prediction. `drawCalls` is a whole-frame accumulation across shadow, scene
and post passes (`PostProcessingPipeline` sets `info.autoReset = false`), so it
is not "objects on screen". Subtract the `off` row to isolate shadow cost.

Headline results are written up in
`prompts/AI_DONE_484_SHADOWS_cascaded_shadow_maps_and_sun_light_ownership_DONE.md`.
