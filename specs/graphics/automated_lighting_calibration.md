# Automated lighting calibration

AI567 owns an isolated calibration search and an AI562 handoff. The implementation
lives under `tools/bake_lighting/experiments/automated_calibration/`, registered as
`lighting/experiments/automated-calibration` in `node tools/bake.mjs`. It never
publishes production materials, changes game defaults or certifies the full city.

## Stages and authority

The master invokes independently callable `validate`, `baseline`, `prepare`,
`calibrate`, `search`, `render`, `analyze` and `review` stages. Each has authenticated
receipts and retained attempt logs. Source changes require new exports; material
or transport changes invalidate cached raw renders. Display-only variants reuse
the same HDR radiance. Recombination is not used: AI566's complete unchanged
renders form the search dataset, and new full renders verify both finalists.
The separately callable `review-revision` authenticates completed evidence and
builds a new presentation directory without modifying the original report or
claiming that historical baselines describe a subsequently changed game.

Validation reruns AI564's equations, HDR transfer and tone checks against verified
raw inputs without overwriting the old report. AI565 and AI566 identities and
their passing checks are required. Measured-reference limitations, custom shader
approximations and grazing-angle review cases remain explicit blockers for claims
of production equivalence. A successful job does not override these distinctions.

Fresh native baselines retain installed shadow/indirect packages and repository
lighting defaults, with ACESFilmic and grading Off. Captures record effective
settings, packages, loaded resources and exact camera/bus transforms. The disposable
browser does not modify personal preferences. All five views and the canonical
four bus placements are checked, including the shared bus for poses 01/02.

## Identifiability and selection

The physical illumination scale is fixed by the AI565 clear-day horizontal neutral
receiver. No city albedo, sun/sky power, sky tint, geometry, local exposure or grade
is optimized. Three documented atmospheres and two frozen material variants are
discrete conditions: clear/hazy/overcast and verified conversion/optional plausible
materials. Overcast is a stress case rather than sunny-weather acceptance.

Only global exposure offsets −0.5, 0 and +0.5 EV are varied after physical checks.
ACESFilmic r183 is primary, pinned Blender5.2.1 AgX with None look is an alternative.
All views share a candidate's exposure. Training views 01/04/05 and held-out views
02/03 are fixed before search. Each material family selects a finalist by the
tracked lexicographic rule: training guard violations, clear-condition preference,
absolute EV offset, then lower EV. Validation views cannot choose the finalist.

Display guards flag excessive clipped highlights, crushed facade-region pixels
and insufficient blue separation in the sky. These are broad aesthetic thresholds,
not measurements of real city surfaces. Region definitions are fixed geometry-
aligned rectangles; windows and textures can influence their averages. Every
score component, alternative and sensitivity sweep remains available. There is no
single realism score or numeric fitting to generated reference images.

Independent full renders use a different seed, increased samples and tighter
adaptive threshold. Whole-image mean and exposed absolute-difference quantiles
bound expected render variance. Both held-out display guards and raw verification
must pass before a profile is labeled `validated-lab-candidate`. Failures remain
`blocked`; production publication is always prohibited.

## Evidence and handoff

`profile.json` contains source/scene/material/daylight/display identities, units,
raw and display measurements, artifact hashes, assumptions and integration tasks.
The pose-grouped report includes fresh baseline, original export, fixed legacy
targets, all candidates and independently rendered finalists. Multi-selection,
2×2 comparison, keyboard carousel and bottom thumbnails retain exact image settings.

Bulk output stays in ignored `tests/artifacts/screens/ai567_automated_calibration/`.
One browser or renderer runs at a time. Four CPU render threads and serial image
decoding limit contention. Stage durations, failures, cache reuse and sampled owned
process memory are recorded; unavailable GPU and production performance metrics
are labeled explicitly.

AI562 applies approved normal/F0/material/export changes, coherent sun/sky and
matching bakes, with source-isolated lighting/visibility tests and runtime performance
measurements. Direct baking is conditional on evidence. AI551 retains ownership
of city-local reflections. AI567 does not mark either production task complete.
