# DONE

# Problem

City placement today extrudes buildings from tiles or drops authored
footprints at fixed size. With N-face footprints (AI 512) and validated
stretch bands (AI 514), the city organizer should **snap buildings to the
available space**: take an authored footprint and grow/shrink its valid
stretch bands so the building fills its lot, while every facade re-solves
with its own repetition/expansion/grouping rules — one authored building
yields a family of correctly detailed variants at many lot sizes
(9-slice scaling for building plans).

# Agreed design (discussion 2026-08-26)

- The organizer fits deterministically: given a lot/build-area polygon and a
  candidate config, pick the footprint's valid stretch bands (AI 514 rule)
  and distribute the required Δ per axis across them.
- Authoring control: faces (or bands) carry a plan-level stretch preference
  (mirroring bay `expandPreference`: prefer_expand / allow / never), so a
  designer can pin a wing and let the body grow.
- Clamps come from facade solvability (every stretched face must still
  solve; the AI 514 clamp), plus the existing outward reserve (cornices,
  balconies, portal steps) against the lot boundary.
- When the target size is unreachable, place the nearest-fit size (largest
  that fits / smallest that satisfies minima) — never a sheared or broken
  plan; warn in the build log.
- Determinism: same lot + seed + config → same fitted footprint.

# Request

- A fitting function: (config footprint + stretch metadata, build-area
  polygon, seed) → fitted footprint with stable run ids.
- Wire it into the city organizer / CityMap building placement behind a
  per-entry flag (`fitToLot: true`), leaving current fixed-size placement as
  the default until content opts in.
- Distribution rule: proportional across participating bands, quantized so
  facades land on solvable lengths (reuse solver dry-runs).

## Delivery requirements
- Engine 2 only. Depends on AI 512 and AI 514 — implement after both.
- Unit tests: proportional distribution, preference pinning, clamp at
  solver minima, nearest-fit fallback, determinism per seed.
- Screenshot: the same catalog building fitted to a narrow and a wide lot in
  one city scene, facades showing different repeat counts.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

# Outcome (2026-08-29)

- Added a pure deterministic lot fitter that distributes quantized X/Z deltas through valid stretch bands while preserving facade ids and plan angles.
- Added face/band `prefer_expand`, `allow`, and `never` metadata with proportional weights, seed-stable tie breaking, solver clamps, and nearest-fit warnings.
- Wired the opt-in `fitToLot: true` entry contract and `footprintStretch` metadata through CityMap round-tripping, city rendering, config export, and BF2 generation.
- Reused facade bay dry-runs and the existing outward reserve to prevent fitted runs from crossing facade minima or lot boundaries.
- Added focused unit tests, a browser core integration guard, the narrow/wide city comparison scenario, and its visual capture.
- Documented the opt-in city stretch-fitting contract in the construction placement specification.
