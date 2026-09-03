# Problem

The illumination framework spans offline export, Blender compilation, binary transport, static sun depth, dynamic bus shadows, lightmaps, AO composition, streaming, and runtime mode switching. Component tests are insufficient to authorize production use. The optional path must prove visual correctness, freshness/corruption safety, resource lifecycle, and a meaningful net benefit while the current engine remains fully functional and unregressed.

# Request

Run the integrated release validation for the complete AI 526 descendant chain, resolve only test-discovered integration defects within their owning modules, and make an evidence-based promotion/default decision. Never remove the Current engine or make baked assets mandatory.

## Execution gate

- Do not start until AI 527 through AI 535 and AI 546 are DONE.
- Verify that every child completion summary links raw artifacts and states its measured limitations. Do not replace missing child evidence with projections.
- Freeze the exact source, compiler, payload, browser, graphics, and route profiles used by the final run.

Tasks:
- Build a full traceability matrix from every AI 526 requirement to a child implementation, specification, automated test, visual case, benchmark, or documented deferment.
- Validate these deployment/runtime matrices:
  - no baked assets at all;
  - baked assets installed but Current selected;
  - compatible Baked selected;
  - Auto choosing Current;
  - Auto choosing Baked;
  - wrong city/profile/sun/environment;
  - stale geometry/material/alpha/compiler hashes;
  - missing optional and required chunks;
  - truncated, corrupt, swapped, duplicate, and unknown-version payloads;
  - unsupported texture/precision/memory capabilities;
  - cancelled/failed loading and recovery;
  - repeated runtime switches and city/state teardown/reload.
- Require Current mode with baked code/assets absent and present-but-inactive to match the accepted pre-framework visual result and show no statistically significant frame-time, memory, draw-call, shader-variant, load-time, or startup regression beyond documented tolerance.
- Run deterministic lab and real driving routes covering walls, roofs, road/curb/sidewalk, overhangs, interior thresholds, roofline detail, low/long sun, city/tile/chunk edges, alpha-cutout vegetation, partial static shadows moving across the bus, bus self-shadow, bus-to-world shadow, bus contact, and rapid camera/vehicle motion.
- Run same-session current-versus-baked image comparisons for shadow visibility and approved perceptual/reference comparisons for intentional GI changes.
- Enforce zero missing static occluders and strict thresholds for leaks, acne, peter-panning, seams, halos, stale tiles, UV errors, mips, temporal crawling, shadow lag, history artifacts, mode-switch flashes, and double-darkening.
- Validate exact source-hash sensitivity and normalization, output checksums, compiler signature drift, and profile selection using controlled one-variable mutations.
- Repeat the authoritative Blender build from clean inputs enough times to satisfy the AI 529 repeatability contract, and validate that only promoted complete outputs reach the production location.
- Measure the complete offline pipeline: export time/size/memory, Blender bake time/memory/settings, packaging/compression time, raw/packed/distributed size, and reproducibility hashes/tolerances.
- Measure the complete runtime pipeline: startup impact, request/load/hash/decode/upload, activation latency, peak/resident CPU/GPU memory, texture/chunk residency, shader/pass time, shadow/AO calls and triangles, full frame time/FPS, frame pacing/variance, and teardown/disposal.
- Use controlled interleaved same-page benchmark methodology and GPU completion synchronization where available. Record hardware, browser, OS, Three.js version, Blender archive/build/device/thread/settings, game resolution/pixel ratio, graphics and illumination modes, route/poses, warm-up, sample count, statistic, and contamination/noise checks.
- Test a primary supported GPU and at least one constrained/fallback configuration where available. If unavailable, mark it explicitly and do not infer support.
- Run the complete automated suite and shader-policy checks. Add focused regressions for every integration defect discovered.
- Make one final recommendation:
  - ship Baked as opt-in only;
  - allow Auto to prefer Baked for validated cities/profiles;
  - keep Baked development-only pending named gates;
  - reject/defer the path if net benefit does not justify cost/complexity.
- The decision must account for disk/download, bake maintenance, load latency, memory, fallback complexity, visual correctness, and end-to-end frame performance—not only shadow draw calls.
- Preserve Current as a permanent user-selectable and automatic fallback path regardless of the promotion result.

Acceptance requirements:
- The traceability matrix has no unexplained requirement gaps.
- Current mode is proven independent of Blender and baked assets and remains within its visual/performance regression gates.
- No invalid or partial payload can become active.
- Runtime switching and teardown are leak-free and visually atomic.
- Any promoted baked mode passes the complete correctness and performance matrix with reproducible artifacts and full benchmark conditions.
- The final recommendation distinguishes measured facts, toleranced differences, unavailable measurements, and deferred work.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it to `prompts/AI_DONE_536_TESTS_illumination_framework_release_validation_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Add a concise completion summary linking the traceability matrix, full test results, raw visual/performance artifacts, production payload/compiler signatures, known limitations, rollback instructions, and final promotion/default decision.
- Include comprehensive same-condition tables for Current baseline, Current with inactive add-on, every promoted Baked configuration, and Auto/fallback: frame time/FPS, frame variance, whole-frame and relevant pass calls/triangles, CPU/GPU time, disk/download size, load/decode/upload/switch latency, peak/resident memory, bake/export/package cost, hardware/software/settings/workload/warm-up/sample/statistic. Mark unavailable metrics as `not measured` with a reason; do not use projections as final results.
