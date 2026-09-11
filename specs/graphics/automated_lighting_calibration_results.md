# Automated calibration results

AI567 is implemented and executed. Accepted run:
`tests/artifacts/screens/ai567_automated_calibration/runs/calibration-02/`.
The workflow completed in **511 seconds (8 minutes 31 seconds)** with authenticated
AI566 radiance reuse. Production game materials, settings and bakes are unchanged.

## Selected candidates and alternatives

Both material families selected **D01 clear daylight, +0.5 EV global presentation
offset, ACESFilmic, grading Off**. AgX/None remains available for the same images.

- `D01_conversion_ev+0.5`: generated road-normal channel correction and authored
  Phong F0 preservation; retains original material choices as far as export allows.
- `D01_plausible_ev+0.5`: the same corrections plus the optional dry-grass,
  dielectric-glazing, bounded bus reflection and muted window-interior proposal.

The +0.5 offset passed the fixed dark-facade display guard where 0 and −0.5 did
not. It is an exposure/presentation preference, not evidence that solar energy was
wrong. The clear gray-card physical scale remains unchanged before this display
choice. Hazy D02 at +0.5 also passes and is retained; the declared sunny/clear
condition preference breaks the tie. Overcast D03 remains a physical stress case,
not a sunny-weather candidate. No ground-truth photorealism ranking is claimed.

Training used poses 01/04/05. Held-out poses 02/03 did not influence selection;
both finalists passed their guards there, then passed independent full-render
checks on all five poses. All 18 candidates and their rejected/retained reasons
remain available with both tones: 180 candidate displays, 20 finalist displays,
five fresh baselines, ten original-export displays and three fixed visual targets.
The report contains **218 images**.

## Validation and evidence

- Reran AI564 independent checks on authenticated unchanged raw data: **38/38
  transport**, four input/HDR and two display checks, plus injected fault detection.
- Authenticated AI565's **86** checks and AI566's **209** checks. The 12 material
  grazing-angle review comparisons and unsupported reference/shader cases remain
  explicit; passing the harness does not certify full city renderer equivalence.
- AI567's **31/31** neutral-scale/raw-finiteness checks and **10/10** independent
  finalist render checks passed. Maximum whole-image mean difference was 0.044%;
  maximum 95th-percentile absolute difference after exposure was 0.02083. Limits
  fixed before rendering were 3% and 0.06, respectively.
- **Six Node tests** passed: production isolation, bounded identifiable inputs,
  held-out split, promotion gates, tampered receipts, synthetic clipping/crush and
  retention of failed baseline images. The latter retry guard was added after the
  successful render run and tested without changing its image results.
- **One browser integration test** passed: all 218 images decode, all ten pose/tone
  shortlist selections work, and selection, 2×2 comparison, keyboard navigation,
  thumbnails and closing the carousel preserve image identity.

The [report](../../tests/artifacts/screens/ai567_automated_calibration/runs/calibration-02/report/revisions/layout-v2/index.html)
includes actual settings and measurements per image. The
[profile](../../tests/artifacts/screens/ai567_automated_calibration/runs/calibration-02/profile.json)
freezes scene/source/material/daylight/display contracts and integration tasks.
Raw EXRs, source receipts, reference hashes, search sensitivity, `.blend`, every
attempt and fresh game metadata remain in the run. Original targets are labeled
visual-only and never numerically fitted. Browser captures of the grouped results:
[pose02](../../tests/artifacts/screens/ai567_automated_calibration/runs/calibration-02/report/revisions/layout-v2/qa/pose_02_comparison.png),
[pose03](../../tests/artifacts/screens/ai567_automated_calibration/runs/calibration-02/report/revisions/layout-v2/qa/pose_03_comparison.png).
The presentation-only layout revision took3.8s, preserves the original report and
fits a complete2×2 selection above the thumbnails. Image bytes/calibration settings
are unchanged; its fresh browser test also verifies viewport fit.

## Concrete AI562 mapping

The selected coherent atmosphere uses sun azimuth45°, elevation35°, diameter0.53°,
altitude100m, model aerosol density0.25, air/ozone1 and model ground albedo0.3.
Its numerical linear RGB normal-incidence sun irradiance is approximately
`[155.83739249, 130.09394330, 96.10796931]`. For a native directional light, use
intensity equal to the largest component and linear RGB color equal to the vector
divided by that intensity. These are the pinned model's scene-linear quantities;
the approximately90.9klux estimate comes from its spectral CIE-Y calculation.
Do not reinterpret arbitrary RGB values directly as lux.

The sky is D01's disc-free directional radiance field; hemisphere fill is zero,
and exactly one finite sun owns direct solar energy. Visible sky and reflections
must use the same atmosphere. Blender's combined world already contains its sun:
do not add another Sun lamp to that reference. The original HDRI0.28/hemi1.22/sun7
controls are retained only in the baseline, not silently mapped to physical values.

Base exposure is −4.7905280843EV, multiplier0.0361332771. The selected presentation
is −4.2905280843EV, multiplier**0.0511001705**. It uses the same Three.js r183
ACESFilmic internal `/0.6` convention as the game. **The current game exposure
sanitizer clamps to0.1 minimum**, so this is not a ready-to-import settings object:
AI562 must support the calibrated exposure range, or explicitly scale *all*
radiance contributors and matching bakes together while applying the inverse
exposure change. Never clamp exposure or rescale only sunlight.

AI562 must integrate the road normal fix, exporter F0 semantics and accepted
material adapters, then regenerate affected sky/bounce packages. Preserve bus base
colors and independent reflection controls. Validate procedural interiors, alpha,
AO and normal scaling rather than claiming exact translation. Compare canopy
contacts and distant penumbrae, as well as source-isolated direct specular/shadows.
Restoring baked direct remains conditional on quality and cost evidence. AI551
retains local reflection ownership. Nothing here marks AI562 production work done.

## Timing and resources

Windows, RTX3060, pinned Blender5.2.1/Cycles OPTIX, four CPU threads, one active
browser/renderer. Fresh game captures1920×1080; source search renders64 samples;
finalists1920×1080/128 samples, independent seed567, adaptive threshold0.01 and
OIDN. Twenty final display images derive from ten full-render EXRs.

| Stage | Measured wall time | Sampled owned working-set peak |
| --- | ---: | ---: |
| Prerequisite checks | 10.9s | 0.28GiB |
| Fresh baseline capture | 124.9s | 5.83GiB |
| Scene inspection/preparation | 5.8s | 1.34GiB |
| Raw calibration | 40.8s | 0.27GiB |
| Candidate evaluation | 54.3s | 0.39GiB |
| Independent finalist renders | 241.2s | 8.58GiB |
| Final analysis | 20.7s | 0.47GiB |
| Review generation | 2.6s | 0.24GiB |

These are one-run stage measurements, not statistical speedup claims. The total
includes receipt hashing and orchestration. Memory samples every five seconds sum
owned process working sets and may count shared pages more than once. Per-process
GPU time/VRAM were not measured. Task-owned capture/render processes terminate;
the explicitly opened local preview server is intentionally persistent.

| Production metric | Before | After | Reason |
| --- | --- | --- | --- |
| Frame time/FPS | Not measured | Not measured | Production rendering path unchanged |
| CPU/GPU rendering time | Not measured | Not measured | No production optimization applied |
| Runtime memory | Not measured | Not measured | Offline process peaks do not substitute for a game benchmark |

`calibration-01` preserves the failed sandbox attempt: network access denied the
game's existing CDN modules, so no baseline was accepted. Its approximately250s
failed capture is excluded from the successful511s timing. Unsandboxed execution
completed the authorized capture; reference data and original renders were retained.
