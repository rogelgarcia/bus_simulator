# Receiver irradiance delivery

## Reproduction and hypotheses

The southwest custom pose from the opaque-building review still has brick diffuse
13–16% below full Cycles and 16–19% below its geometric-normal Lambert control,
with material AO removed. Keep exposure, colors and production assets fixed.

Check independently:

1. Original 512-sample sky/bounce values versus postprocessed float atlas values.
2. Float values versus packed RGB9E5 values at the same address and mip.
3. Offline interpolation versus actual GPU receiver samples.
4. GPU irradiance times albedo/pi versus the shader's indirect diffuse lobe.
5. If delivery agrees, isolate reference lighting and source-scene reconstruction.

Use `lighting/experiments/reference-matching/irradiance-trace` through the shared
bake framework. The installed index must match the original offline bake, whose
raw pass receipts and used processed pages are checked by hash. Screenshot masks
exclude glass and erode boundaries. Every iteration lives under the AI562 screen
artifact directory; preserve failures and unchanged/restored source evidence.

## Iterations

- `irradiance_trace_20260912_01`: exact custom-pose capture in a fresh browser;
  actual GPU coordinates, LOD, irradiance and separate diffuse outputs. Its first
  analysis rejected eight unmapped pixels at cross-renderer mask boundaries.
  Preserved the capture and fixed that analysis assumption; no failed receipt was
  rewritten or certified.
- `irradiance_analysis_20260912_01`: 238,938 mapped building pixels. GPU sampling
  relative RMS 0.0308%; RGB9E5 quantization RMS 0.0685%; Lambert composition RMS
  3.54e-8. Static material restoration is exact. Padding raises the two main brick
  averages about 1.5%, rather than losing energy.
- `irradiance_reference_20260912_01`: exact native lighting and static source
  reconstruction change the main brick facade less than 1%. Primary albedo between
  those two Cycles scene reconstructions agrees. The game/source texture averages
  themselves still differ by several percent and are a separate residual.
- `irradiance_lobes_20260912_01`: original brick sky is 6–7% below the reference;
  bounce is 19–21% below. Dark stone sky differs 3%, bounce 15%. This isolates the
  largest deficit to transport, not runtime atlas delivery.
- `irradiance_fixture_20260912_01`: rejected multipart EXR assumption; preserved.
  `_02` is the passing low-bounce control. `_03` directly lights the bounce wall
  with sun energy 160 and fails bake/render parity by 8.34%, while sky agrees to
  0.0011%. Both inherited Blender's indirect sample clamp of 10. `_04` changes
  only that clamp to zero: bounce error falls to 0.0547%. This is the focused
  failing test for the native bake fix: white irradiance and colored camera
  transport must not lose different energy through a radiance clamp.
- `irradiance_wall_20260912_01`: exact original chart on building_9, 2,543 visible
  interior pixels. Native sky reproduces stored sky within 0.11%; bounce within
  4.66% (1024 samples, separately baked receiver versus original 512/joined).
  Changing only the indirect clamp from 10 to 0 increases bounce by 21.81% and
  leaves sky unchanged. This confirms the mechanism affects the actual city.
- `irradiance_wall_20260912_02`: authenticated replay against the exact source
  render. Unclamped sky error is -0.308%; bounce error is +0.246%. The original
  stored bounce is 21.36% below that render. These measurements are for the
  selected chart, not a whole-city certification.
- `irradiance_fixture_20260912_05`: production `configure_surface_irradiance`
  now runs the same passing fixture; maximum bounce mean error 0.0547%.
- Final `irradiance_fixture_20260912_06` passes through the native setup (7.6 s).
  `irradiance_wall_20260912_03` authenticates original page hashes and passes the
  new local reproduction/parity gates (3.7 s, replay of the 80.5 s chart bake).
  At identical 1024-sample chart settings, bounce error is -17.70% with clamp 10
  and +0.246% with clamp 0. The production profile is now v7 and explicitly marks
  disabled irradiance clamping. Thirteen framework tests and all syntax/diff
  checks pass; the selected test file was restored.
- Existing bake framework tests pass, 13/13. No production rebake or publication.

## Fix and remaining work

Disable sample clamping explicitly in the native surface irradiance setup and
version the bake profile so future jobs cannot be confused with old clamped
packages. Exercise that shared setup in the fixture. Preserve the installed bake:
the small chart experiment is not a production package. A subsequent full bake
must still pass existing validation/publication gates and be compared across all
poses. Do not compensate by changing game exposure or applying a global multiplier.

## Full v7 bake and installed comparison (2026-09-12)

- Framework run `run-1789254029307-27356-d552823d` passed all 11 jobs in
  4,165.3 seconds. It retains 512 samples, four diffuse bounces, ten 4096-square
  pages and 0.33 m texels. Profile v7 declares `disabled-irradiance-v1`.
  Bounce took 1,440.1 seconds, sky 1,206.8 seconds. The source package and chart
  layout match the previous v6 bake; exposure and material settings are unchanged.
- `unclamped_20260912_capture_01` passed all five canonical poses with fully
  applied indirect light and E55 shadows. Nine actual-game transition rounds had
  zero world dropouts, stable texture/geometry/program counts, and a maximum
  frame gap of 494.2 ms. `unclamped_20260912_native_01` passed all 14 native checks.
- `unclamped_20260912_install_01` installed receiver package
  `a837e60a48873e5d500828fa8593fa432290d184d039904300cf8cbd25444d3a`
  through the existing development-cache gates, preserving previous indexes in
  its receipt. The new parent shadow descriptor matches the installed streamed
  detail tiles. This is not a new aggregate release certificate.
- `20260912_southwest_pair_unclamped_01` contains the fresh 1920x1080 game and
  Cycles images at the exact southwest pose; the pair took 255.5 seconds.
  `20260912_southwest_pair_installed_bake_01` preserves the prior v6 pair.
- `unclamped_20260912_trace_01` and `unclamped_20260912_lobes_01` verify 238,938
  actual GPU samples against the new package and the unchanged source-scene
  Cycles diffuse control. GPU sampling RMS is 0.0316%; composition RMS is
  3.88e-8; restoration is exact. On the two main brick materials, bounce rises
  16.38% and 17.67%. The indirect-luminance deficit, with material AO removed and
  common game albedo, falls from 12.78%/14.28% to 4.91%/5.75%.
- The previously isolated chart gains 22.28% bounce and 9.91% combined indirect
  light, while its sky values remain unchanged to float precision. This local
  measurement is in `unclamped_production_20260912_probe_02`.

The clamp loss is fixed and the corrected full-city maps are installed. Exact
game/Cycles equality is not established: the main brick areas retain about 5-6%
indirect-light difference, and game/source albedo averages differ about 3-5%.
These are separate residuals; do not hide them with exposure or a global gain.
All named evidence folders are under
`tests/artifacts/screens/ai562_acesfilmic_reference_matching/`, except the bake run
under `tests/artifacts/screens/ai556_bake_framework/`.
