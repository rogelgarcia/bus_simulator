# Problem

The user selected a Cycles-rendered target from AI 560 and wants the actual game to approach its appearance: a brighter, detailed facade, convincing sun-to-shade color and saturation, softer distant shadows, sharper canopy contact shadows, and appropriately sheltered window interiors. The supplied game comparison is explicitly **ACESFilmic with grading Off**. Do not attribute the reported difference to the historical G00 Vivid grade; that is a different baseline.

The current production bake already uses Cycles for static diffuse transport. Its static sun channel caches depth and evaluates filtered visibility at runtime; this does not automatically preserve the finite-sun penumbra of a Cycles beauty render. A nearby canopy can cast a sharper physical shadow than a distant pole, while a fixed shadow filter can make the canopy too soft and the distant shadow too sharp. More sampling or blurring everything cannot be assumed to solve this.

The AI 560 exporter also omits some runtime window/interior shader behavior. A dark exported window is not proof that its interior lighting is correct. Material/export parity and lighting composition must be investigated separately while retaining the selected target as immutable evidence.

# Request

Implement and execute an iterative, reproducible workflow that brings the game toward the selected reference using **Three.js-compatible ACESFilmic** and creative grading Off. Continue through exporter corrections, measurements, necessary renderer/bake changes, rebaking when justified, and actual game comparisons. A report or improved Blender-only image does not complete the task.

The user authorizes a simple Blender-compatible replacement for unsupported window interior materials: deterministic fake room silhouettes and restrained gray/beige surfaces are sufficient. The user also authorizes restoring baked direct lighting **if measured evidence shows that it helps**. Preserve the accepted indirect engine and AI 548 coverage/optimizations, original bus appearance, independent reflection controls and complete runtime fallback.

## Frozen evidence and target identity

The original attachments have already been copied byte-for-byte to the following gitignored directory:

`tests/artifacts/screens/ai562_acesfilmic_reference_matching/references/`

| File | Role | Original resolution | SHA-256 |
| --- | --- | --- | --- |
| `user_game_aces_grading_off.png` | User's game comparison; caption confirms `Game · aces · off` | 1472 × 906, including gallery framing | `800185cb5b688c35d2d2372d9b2d9d2f254c1b2f243b223288af50273336b33d` |
| `user_cycles_target.png` | User-selected visual target | 2482 × 1412, including surrounding border | `bee2fe32333a6091005ced7f3c7a6dac76dba93c7a8f6d0ca93ad75f09f8df72` |

Use `references/manifest.json` as the saved provenance record. Preserve the originals; crops, alignment previews and annotations are separate derivatives. These differently sized screenshots must not be compared numerically as if their image rectangles were aligned camera captures.

### Additional target: pose 02 · bus_shared_01_02

The user explicitly adds this second comparison to the acceptance set because the game's shaded areas are too dark. It supplements the first target. The supplied game caption is `Game · aces · off`; the Cycles target caption is **`ACESFilmic · +0.5 EV`**. Both captions identify 1920 × 1080 source images, while the saved attachments include scaled gallery framing.

Original attachments are preserved in `references/pose_02/`, with a separate immutable provenance record in `references/pose_02/manifest.json`:

| File | Original attachment resolution | SHA-256 |
| --- | --- | --- |
| `user_game_aces_grading_off.png` | 1476 × 920 | `d37a71960e947ea4f844632a2f7e5c6e10f569f04791e29d876dd1e95f1c3526` |
| `user_cycles_target_aces_plus_0_5_ev.png` | 1146 × 712 | `95093847a68b5814c14ea08bac75286e0f5559f3a1f50844f3ca9cc951705669` |

- [ ] Include the user-designated `pose_02` / `bus_shared_01_02` as an explicit primary acceptance comparison alongside the original target. Resolve its full camera transform, shared bus placement, scene-light recipe and source EXR from the tracked poses and AI 560 receipts; cross-check the supplied view against the gallery identity and report any discrepancy instead of silently assigning a different camera. The target's +0.5 EV is known from its caption; the lighting configuration is not.
- [ ] Add fixed measurements and full-resolution crops for the shaded red-brick facade and ground-floor storefronts on the left, the shaded building on the right, and bus paint/trim in this view. Recover readable material detail and plausible shaded radiance toward the selected reference while preserving real recess/contact darkness, sunlight highlights and the original bus appearance. Measure linear illumination and displayed color separately; do not treat every near-black pixel as an error.
- [ ] Keep the selected +0.5-EV Cycles target visible throughout iteration. Also compare game and Cycles at matched exposure, with grading Off, to separate exposure changes from sun/sky/bounce/material corrections. A global exposure adjustment may be retained if it improves the full acceptance set; no pose-specific exposure, lifted-black overlay or local brightness patch. Validate retained changes against both selected targets and all five poses so brighter shaded walls do not wash out the original bright facade.
- [ ] Preserve chronological game captures for this target in every retained candidate iteration, with its own baseline/target/final columns and diagnostic crops. Show the actual EV and source-light identity next to every image. White window placeholders and glossy grass in the exported target remain documented material/export limitations; matching their artifacts is not an acceptance goal.

Existing experiment:

- Tools and tracked defaults: `tools/bake_lighting/experiments/lighting_configurations/`.
- Saved run: `tests/artifacts/screens/illumination_560/runs/run-1788907361363-8928a069/`.
- Viewer and limitations: that run's `report/index.html` and `report/review.md`.
- Saved scene: `tests/artifacts/screens/illumination_560/scene/8c6e7243fe66d4a5/bigcity2_lighting_lab.blend`.
- Canonical five poses and shared bus placement: the experiment's tracked `config/source_poses.json` and `config/poses.json`.

Tasks:

- [ ] Recover the selected image's pose, scene-light configuration, display recipe, EV, render resolution, source identity and underlying EXR from the AI 560 manifests and image matching. Do not assume L00/L01/L03 or a particular EV based on brightness. Save the matched original unframed target, its raw reference and receipts by content identity. If the target cannot be identified, retain the screenshot as the visual target and explicitly record unknown metadata; ask only for information necessary to resolve an otherwise blocked comparison.
- [ ] Create a fresh, separately named game iteration `000_baseline` with ACESFilmic and grading Off, the same camera/bus transforms and installed baked data. Capture requested and effective settings, active bake/probe/AO states and package hashes. Capture before source/material/bake mutations; preserve any old production packages needed to reproduce the baseline. Do not relabel or overwrite AI 560 G00/G01 or its display variants.
- [ ] Freeze a shared display contract: the exact ACESFilmic operator used by the installed game, scene-linear working space, exposure multiplier/EV, white balance and one output encoding. Account for the existing Three.js ACESFilmic exposure convention in offline processing. Grade Off means no creative LUT/look. Keep auto exposure, bloom, vignette, sharpening and other differences explicitly controlled. Any later display change is global, versioned and compared separately; no per-pose exposure or saturation fixes.

## Lighting and shadow diagnosis

- [ ] Compare aligned game and Cycles outputs before and after tone mapping. Inspect direct sun diffuse/specular, sky/environment diffuse, bounced diffuse, environment reflection, AO/contact and emissive contributions independently. Match channel semantics rather than names: Cycles diffuse-direct may contain environment illumination, whereas the engine's direct channel may mean only the named sun. Verify light-only units, receiver base-color application, material color spaces, HDR decode/range, normal response and absence of duplicate ambient or double shadowing.
- [ ] Establish fixed diagnostic regions on the bright facade, shaded facade, canopy contact edge, distant pole/building shadow edge, storefront interiors, bus paint/trim/rims and asphalt. Measure scene-linear luminance/color ratios, display color differences and shadow transition profiles on appropriate material masks. Distinguish texture/normal detail, direct penumbra, indirect occlusion, AO and filtering/denoising. Record uncertainty and derive tolerances from reference noise/alignment before using them as pass criteria; histograms alone do not establish parity or realism.
- [ ] Fix the identified sun/sky/bounce balance and material-response errors at their owning layers. If lighting inputs change, generate matching validated bakes. Do not keep an incompatible package active or paint coordinate-specific corrections onto the scene. Preserve colored bounce and plausible sun/shade saturation instead of forcing equal saturation everywhere. Evaluate all five poses to avoid fitting just the selected building.
- [ ] Match finite-sun shadow behavior: preserve sharp contact beneath the canopy and allow penumbra to widen with caster-to-receiver separation for distant shadows. Inspect actual source geometry, normals, alpha coverage, bias, cache resolution, filter radius and sun angular diameter before selecting an implementation. Identify any softness caused by indirect light or low-resolution filtering rather than the sun. Include both near-contact and distant-occluder regression fixtures, plus moving-bus shadows and low-angle sunlight.
- [ ] Evaluate an appropriate representation, such as physically sampled static sun visibility, a sufficiently resolved direct-diffuse bake, or distance-aware runtime filtering. Compare quality, memory and frame cost; no blanket blur or forced choice of algorithm. Document what the chosen cache actually stores and why its runtime reconstruction retains the intended shadow shape. Check thin geometry, silhouettes, tile/chart seams, normal maps and direct specular visibility.

## Blender-compatible window and interior export

- [ ] Extend the existing standalone city exporter to identify unsupported runtime window/interior materials through material metadata/semantics. Substitute a deterministic Blender-compatible interior representation while preserving window frames, glazing boundaries, UV/layout, facade openings and repeated-instance placement. Simple shallow room proxies or textured backplanes with subdued gray/beige silhouettes are sufficient; avoid replacing unrelated black trim, panels, bus glass or an entire building.
- [ ] Separate the glazing's reflection/transmission behavior from the interior representation. Use documented materials, modest reflectance and depth/occlusion where required; no emission or arbitrary exposure offset to make interiors legible. Keep source-opaque glazing opaque unless a separately declared material correction intentionally changes transmission. Record proxy ray visibility and transport participation so fake rooms neither leak light nor silently remove real casters. Bake-compatible transport changes require matching source identity and regeneration.
- [ ] Version and seed the replacement policy. Save source material IDs, replacements, parameters and unresolved limitations; reproduce it from tracked exporter/configuration in a fresh checkout. Preserve the reusable Blender scene and resource packing. Do not alter the original game assets just to simplify export.
- [ ] Produce a separately labeled updated Cycles reference after the exporter change, retaining the original selected target. Compare outside-window lighting to detect unintended transport changes. Never move the target silently to make a game discrepancy disappear; proxy interiors are a declared approximation, not verified real rooms. Adjust the game's interior response only where evidence supports it, keeping the exterior and interior visually consistent.

## Conditional baked direct lighting and game integration

- [ ] Run a controlled live-direct versus baked-direct comparison if direct baking can improve the diagnosed discrepancy. Historical channel names do not prove that the package contains a finite-sun diffuse bake; inspect the actual representation. Keep indirect, materials, sun profile and display fixed for this comparison. Record an explicit retain/restore decision with image and cost evidence.
- [ ] If beneficial, restore a supported, independently controllable baked-direct option, including settings migration, UI/status, compatibility checks and runtime ownership. Baked direct diffuse must replace its overlapping live contribution; preserve separately owned direct specular/clearcoat and applicable transmission. Static visibility already present in a baked texel must not be multiplied twice. Moving bus/vehicle shadows must still affect the result; validate the finite-source approximation where static and moving occluders overlap.
- [ ] Ensure corrected lighting works in Current/Baked/Auto and interacts coherently with sun, hemisphere, diffuse IBL, reflections, AO, tone mapping and exposure. Preserve the accepted AI 548 path. Configuration transitions must prepare in the background and swap coherently without a disabled-lighting flash, stale materials, long main-thread stalls or runaway background processes. If direct baking has no useful advantage, retain live direct with the demonstrated shadow/composition improvements and explain the decision; do not restore it solely to check a box.

## Automated iteration and progress history

- [ ] Reuse and extend AI 560's independently callable capture, city-export, scene-verification, render, analysis and report stages. Register any new experiment leaf in the existing `tools/bake.mjs` hierarchy, using `tools/baking/blender.local.json`. Keep scripts, schemas, reusable recipes and default poses tracked, with owning READMEs and `PROJECT_TOOLS.md` entries. Generated scenes, images, EXRs and reports remain gitignored. Expensive experiments must not enter the no-argument production bake set.
- [ ] Make the experiment controller support resumable hypothesis-based iterations: capture baseline, isolate a cause, apply a bounded change, regenerate affected outputs, capture the actual game, measure, inspect and keep/reject the change. Resume by complete source/settings/recipe identity. Reuse unchanged EXRs and bakes; record elapsed time, failed stages and cache reuse. Release only owned browser/Blender/server processes after success, failure or cancellation.
- [ ] Store **every captured progress image**, including rejected alternatives, under `tests/artifacts/screens/ai562_acesfilmic_reference_matching/runs/<run-id>/iterations/<sequence>_<description>/`. Use new immutable iteration directories; never overwrite a previous before/after/reference image. Keep raw game captures, rendered PNGs, relevant EXRs, crops/differences, exact poses, settings, source/package hashes, git revision plus dirty-input hashes, hardware, timing and parent iteration identity together. Generated evidence must not be staged or committed.
- [ ] Maintain a progress gallery grouped by pose, showing the frozen target, original game baseline, chronological game iterations and versioned exporter reference variants. Display the actual renderer/recipe/EV and changed parameters. Retain full-page carousel, keyboard navigation and before/after comparison; include close-ups of both canopy and distant shadows and the interiors. Preserve the existing AI 560 three-tone viewer, while this task's primary evaluation is ACESFilmic with grading Off.
- [ ] Use the selected pose for rapid diagnosis and all five canonical poses for retained candidates. Produce final game/reference comparisons at 3840 × 2160 and retain 1920 × 1080 progress images. Preserve the shared bus placement for overlapping camera poses and verify actual frame projection, material/texture readiness and applied bake statuses for every capture. No accidental fallback may be scored as an improvement.
- [ ] Continue corrective iterations until the major observed facade/color/shadow/interior differences have been addressed, measured results support the improvement across the poses, and regression/performance checks pass. Do not stop after creating tools, one unreviewed candidate or merely listing known fixes. Report any remaining representational limit precisely; do not claim pixel equivalence for approximate interiors or subjective photorealism from an error score.

## Validation and completion

- [ ] Add meaningful deterministic regressions for confirmed composition, shadow, exporter or settings-transition defects, using the standard selected-test workflow. Check material appearance, prior sidewalk/facade seam fixes, bus grounding, reflections and moving shadows. Measure same-condition CPU/GPU frame time, FPS, draw calls and relevant memory/pass costs before/after; include repeated toggle cycles and owned-process cleanup. Record resolution, hardware, settings, pose/workload, warm-up, sample count and statistics; unavailable metrics require a reason.
- [ ] Document the final source-light/display contract, window proxy policy, chosen shadow/direct representation, package compatibility, commands, measured gains/costs and remaining limitations in the relevant illumination and experiment specifications. Coordinate with AI 549/551/552/561 where their scopes overlap; this workflow does not depend on implementing every unrelated lighting prompt or reopening completed prompts.

## On completion

- Mark this document DONE in the first line only after the implemented workflow has been executed and the actual game result has been reviewed against the preserved target.
- Rename in `prompts/` to `AI_DONE_graphics_562_ATMOSPHERE_match_game_lighting_to_cycles_acesfilmic_reference_DONE.md`; do not archive automatically.
- Add a high-level one-line summary per completed change and the measured before/after performance table with benchmark conditions. State whether baked direct was restored and why.
- Share original reference, initial game and final game images grouped by pose, the full progress gallery and actual workflow/render/capture time. Distinguish tested improvements from remaining approximations. Do not commit generated evidence.
