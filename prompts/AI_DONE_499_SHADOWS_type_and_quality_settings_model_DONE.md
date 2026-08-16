**DONE** — implemented and measured 2026-08-15. See the summary at the bottom.

#Problem

Shadow settings are one flat list — `off / low / medium / high / ultra /
cascade_ultra` — that mixes two orthogonal things: which *technique* renders
the shadows, and how much budget it gets. Cascaded is wedged in as a sixth
"quality" even though it is a different renderer, not a better tier.

Three loose fields hang off the side (`cascades`, `splitScale`,
`mergeCasters`), two of which are really tuning knobs rather than player
choices, and one of which — distance — produced a control that could make
things *worse*: a 16384 map at 110 m measured **slower** than the same map at
340 m (15.43 vs 13.24 ms), because a tight box magnifies every triangle across
far more texels. A distance slider that costs performance when you reduce it is
a broken control.

# Request

Collapse the player-facing model to two switches, with quality governing
resolution *and* distance together so every step down is unambiguously cheaper.

**type:** off | single | cascade    **quality:** low | med | high

This is a settings/UI refactor on the **current** shadow architecture. It does
not depend on `AI_graphics_498` (bus shadow map, three upgrade, cascade
retune) and should land first; 498 then re-tunes the tier *values* it defines,
not the model itself.

## Type: single

One fitted map, one geometry pass. Box is 2x the radius, so density is
`2 * radius / mapSize`. The ladder holds density roughly constant and spends
each step on **reach**:

| quality | map | radius | box | m/texel | VRAM | vs off |
| --- | --- | --- | --- | --- | --- | --- |
| low | 4096 | 110 m | 220 m | 0.054 | 64 MiB | +2.91 ms |
| med | 8192 | 200 m | 400 m | 0.049 | 256 MiB | +5.22 ms |
| high | 16384 | 340 m | 680 m | 0.042 | 1024 MiB | +5.93 ms |

All cells re-measured against `off` = 10.89 ms after implementation
(`tests/benchmarks/ai499_type_quality_2026-08-15.json`); the estimate for `med`
is gone. Note how little the top step buys in frame time (+0.71 ms) for 4x the
VRAM — `high` is a memory decision far more than a speed one.

**Known consequence: "short and very sharp" is no longer expressible.** Today's
shipped `high` is 8192 at 110 m = 0.027 m/texel, sharper than any cell above,
because it has a deliberately short reach. Folding distance into quality gives
that up by design. It stays reachable through the dev overrides below if it
turns out to be missed.

16384 is verified to genuinely allocate and cast here (render target at full
size, no GL error, frame differs from a shadow-disabled reference) — but it is
a real 1 GiB commitment, and `_maxShadowTextureSize` must keep clamping it on
cards reporting less.

## Type: cascade

N maps, one geometry pass each. A cascade box is **~2.2x its split distance**
(it bounds a slanted frustum slice, unlike the single map's camera-centred
box). Costs measured this session against `off` = 8.45 ms:

| quality | cascades | splits | boxes | maps | m/texel | VRAM | vs off |
| --- | --- | --- | --- | --- | --- | --- | --- |
| low | 2 | 60 / 340 | 132 / 757 | 8192 / 4096 | 0.016 / 0.185 | 320 MiB | +4.63 ms |
| med | 3 | 45 / 150 / 340 | 99 / 331 / 757 | 8192 / 8192 / 4096 | 0.012 / 0.040 / 0.185 | 576 MiB | +5.56 ms |
| high | 4 | 45 / 90 / 190 / 340 | 99 / 198 / 420 / 757 | 8192 / 8192 / 8192 / 4096 | 0.012 / 0.024 / 0.051 / 0.185 | 832 MiB | +7.24 ms |

**The +6.33 / +8.27 / +10.23 figures this table originally carried were
wrong.** The sweep that produced them set `city._shadowCuller = null`
immediately after `_deactivateCascadedShadows()` had restored every
`castShadow` flag, so it measured cascades with visible-region caster culling
switched off — a configuration the game never ships. Cascade cost was
overstated by 1.7-3.0 ms, which mattered: it made cascade look strictly more
expensive than single at matching tiers, and it is not. **`cascade/low` costs
less than `single/med` (+4.63 vs +5.22) while resolving 3.3x finer near the
bus**; it only gives that up past 60 m, where its second lane is coarse.

`high` is today's shipping layout, already visually validated. `med` keeps the
same near sharpness and gives up only mid-field detail. `low` has a **11.5x
density step** at its single 60 m boundary — verify that seam in motion before
shipping it; the 4x step at 45 m was reported as visible within minutes.

**Candidate upgrade for `high`, still open:** 4 cascades at 20/60/160/340
measured +8.78 ms with 0.0055 m/texel near — cheaper *and* 2.2x sharper than
the shipped row. It moves the first seam from 45 m to 20 m, where it occupies
more screen space and steps 2.9x rather than 2.0x. Two things must happen
before adopting it: the seam has to be checked in motion, and the number has to
be **re-measured**, because it came from the same culler-disabled sweep as the
figures corrected above. Its *relative* standing against the other sweep rows
is still meaningful; its absolute cost is not.

## Options UI

Two switches, but **one** control: seven buttons, exactly one active at a time
across the whole block. Type is the row label, quality is the button, so every
cell is reachable in a single click — cascade/med to single/low is one press,
not two.

```
Shadows
              [ Off ]
  Single      [ Low ] [ Med ] [ High ]
  Cascade     [ Low ] [ Med ] [ High ]

  Merged shadow casters   [ On ] [ Off ]
```

`Off` sits above the two ladders on its own row and is the same kind of button
as the rest — it lights up when selected and clears whichever ladder cell was
active. The Single and Cascade rows line up column-for-column (the button group
is right-aligned, `styles.css:580`, and both rows carry the same three labels),
which is the point: the two techniques read as parallel ladders at matching
budget, not as one flat list of six tiers.

**`makeChoiceRow` cannot express this as-is** (`OptionsUiControls.js:65`). Each
row owns a private `current` and guarantees exactly one active button *in that
row*, so three stacked rows light three buttons. Two specific blockers:

- `setActive()` returns early when the id is not in that row, so a row cannot be
  cleared from outside — `setValue('')` is a silent no-op, not a deselect.
- The constructor force-activates the first button whenever `current` is not
  found, so each row highlights itself on build no matter what.

Add a control that owns one active id across N labelled rows and returns them
(a shared selection group, or `makeChoiceRow` taking an optional external
selection object). Either shape works, but "no button active in this row" must
be a representable state. Keep it generic — no shadow-specific logic in the
control layer. The existing classes (`options-row options-row-wide`,
`options-choice-group`, `options-choice-btn`, `.is-active`) are sufficient; a
segmented variant already exists if the ladders should read as one unit.

Because `type` and `quality` are separate fields, passing through `Off` must
**preserve** the quality tier: Off then back returns to the cell you left, not
to a default. Today's flat `quality: 'off'` loses that.

Each click emits once, with both fields set.

## Tasks

- Add `type` and `quality` to `ShadowSettings`, deriving the existing internals
  (`mapSize`, radius, `cascades`, `splitScale`, bias, `normalBias`, `radius`)
  from the tables above. Keep `SHADOW_QUALITY_PRESETS` as the resolved shape so
  `City` needs minimal change.
- **Back-compatibility is mandatory** — saved settings and existing URLs must
  keep working: `off`->off; `low`->single/low; `medium`->single/med;
  `high`,`ultra`->single/high; `cascaded`,`cascade_ultra`,`csm`,`5`->cascade/high.
  Sanitisation already accepts these aliases; keep every one of them resolving.
- Options UI: replace the Shadow quality row with the Off / Single / Cascade
  block described above, and remove the Shadow distance row (folded into
  quality). Keep the **Merged shadow casters** toggle — it is orthogonal and
  lossless. Rewrite the section note: drop the distance paragraph, and state
  that `single/high` costs 1 GiB of VRAM.
- Retire `cascades` and `splitScale` as player-facing settings; keep them as
  dev URL overrides (`?shadowCascades=`, `?shadowSplitScale=`) so tuning and
  benchmarking still work, and so "short and sharp" stays reachable.
- `normalBias` must scale WITH texel size for every tier (a value tuned for a
  coarse map detaches the shadow on a fine one). Anchor: 0.03 at 0.054 m/texel.
- Tests: sanitisation round-trip for every legacy alias, monotonic ladders
  (map size and reach both non-decreasing with quality), and the cascade preset
  invariants already covered (splits ascending, `mapSizeScales` powers of two).

# Verification

- **Drive the real options UI, not just the URL or the settings API.** The UI
  previously emitted only `shadows.quality` and silently dropped every other
  field, which made a toggle look dead while the URL path worked fine. Click all
  seven buttons and confirm the engine state follows.
- After every click, assert **exactly one** `.is-active` button in the shadow
  section — a count of two or three is the failure mode the current row control
  produces by default, and it is easy to miss by eye when the rows are adjacent.
- Click cascade/med then single/low and confirm it takes **one** click, changes
  both fields, and triggers one rebuild.
- Reopen the panel after each change and confirm the active button matches the
  live engine state — the draft round-trip through `getDraft()` is where the
  field-dropping bug lived (`OptionsUI.js:1200`).
- Off must preserve the tier: single/high, Off, then click Single again returns
  to `high`.
- Switching type or quality rebuilds the cascade set: confirm no renderer crash
  across every transition, including cascade->single->cascade and changes of
  cascade count. Two crashes were fixed here already (uniform deletion in
  dispose; missing recompile on cascade-count change) and both were only
  reachable by exactly this kind of switching.
- Benchmark each cell with the `tests/benchmarks/README.md` methodology — one
  warm page, configs switched at runtime, round-robin, medians, reference
  config first and last, **game closed**. Replace the estimated cells with
  measured ones.
- Seam check in motion at `cascade/low` and at the candidate `high`, at low sun
  so shadows stretch across the boundary.
- Confirm VRAM per cell matches the table; `single/high` at 1 GiB is the one
  worth stating in the UI note.

## Outcome (2026-08-15)

- `ShadowSettings` rebuilt around `type` + `quality`; presets keyed
  `<type>_<quality>` so `City` consumes them unchanged.
- Every legacy flat id still resolves (`off`, `low`, `medium`, `high`, `ultra`,
  `cascaded`, `cascade_ultra`, `csm`, `0`-`5`); legacy records additionally get
  their stale `cascades` / `splitScale` reset, since neither was ever a
  deliberate choice and a stale count would hand a 2-cascade tier a 4-cascade
  split array.
- Single tiers now carry `radiusMeters`, so reach comes from the quality tier
  rather than a City constructor option.
- `makeExclusiveChoiceRows` added to the options control layer: N labelled rows
  over one shared selection, with "no button active in this row" as a real
  state. `makeChoiceRow` was left alone.
- Shadows panel is now Off / Single / Cascade with one active button across all
  three rows; the Shadow distance row is gone.
- `cascades` / `splitScale` retired as player-facing; still available as
  `?shadowCascades=` / `?shadowSplitScale=`, plus new `?shadowType=` and
  `?shadowTier=`.
- Fixed alongside: the Lab scene's shadow toggle wrote `quality: 'off'`, which
  under the new model sanitizes back to a tier and leaves shadows on.
- 7 unit tests added (`shadow_settings_type_quality.test.js`); node unit suite
  282 passing, same 4 pre-existing failures as HEAD.
- Verified by driving the real options UI: all 7 cells, exactly one active
  button after each click, engine state following, one-click cross-row
  transitions, Off preserving the tier, save/reopen round-trip, and a planted
  legacy `cascade_ultra` record migrating on load. 38 mode switches across
  benchmark and capture runs produced zero page errors.

### Follow-up fix: cascade downshift crashed the renderer

Reported after the first pass: `cascade/med -> cascade/low` died with "cannot
read properties of undefined (reading 'toArray')" in `flatten()`.

Three's CSM keeps ONE Vector2 array per material and truncates it to the live
cascade count on every update (`_getExtendedBreaks` ends with
`target.length = this.breaks.length`). Uniform upload, though, is driven by
whichever PROGRAM a mesh holds, and one material can hold several — instanced
vs not, different light hashes, variants that were not visible when the set was
rebuilt. Any program still declaring a larger `CSM_CASCADES` reads past the end
of the array. **Only lowering the count can do this**, which is why single tiers
and upward cascade steps were always safe. The pre-existing `renderer.compile()`
guard narrows the window but cannot close it: it only reaches material variants
that are visible and in the scene at that instant.

Fixed by holding every `CSM_cascades` array at the 4-cascade maximum, both where
it is born (our `onBeforeCompile`) and after every `csm.update()`. Padding
repeats the last real break, so a stale program samples a saturated range rather
than zeros for the one frame before it recompiles. Padding only appends entries
beyond `CSM_CASCADES`, which no correctly-matched program can read, so it cannot
change rendered output.

**How the original verification missed it:** the benchmark and capture runs both
walked a fixed order — off, single low/med/high, cascade low/med/high — which
never once *decreased* the cascade count. The doc asked for "no renderer crash
across every transition"; a fixed sweep is not every transition. Regression test
added at `tests/headless/e2e/shadow_cascade_count_switching.pwtest.js`, covering
every downward step plus a forced program/uniform mismatch.

### Follow-up fix: cascade med/high sometimes doubled the sun

Reported alongside the crash: at `cascade/med` and `cascade/high` the scene
sometimes goes over-lit — high worse than med, `low` never, `single` never — and
it clears by itself.

Same root cause as the crash, opposite direction. The CSM fragment loop runs
over `NUM_DIR_LIGHTS` (the scene's directional light count) but only index
`CSM_CASCADES - 1` acts as the catch-all last cascade. A material whose define
sits BELOW the live light count therefore keeps iterating past its own cascades
and applies the surplus lights again; a lit material with no `USE_CSM` at all
sees every cascade light as a plain full-intensity sun. Measured by forcing the
state: **+81 luma, near double, at 3 and 4 cascades — and exactly 0 at 2**,
because nothing can sit below the floor of two. That is precisely the reported
signature, and why it self-clears: the next mode switch re-registers everything.

So a stale cascade count is dangerous in both directions — above the live count
it reads past the uniform array and crashes, below it silently doubles the light.

Fixed by (a) registering from `engine.scene` rather than just the city group and
its extra roots, so no lit material is missed, and (b) a slow repair pass
(`reconcileMaterials`, every 120 frames) that re-registers anything unregistered
and corrects any wrong `CSM_CASCADES`. Verified end to end: breaking all 2,632
materials to a count of 2 drives luma 88.8 -> 172.2, and the repair returns it to
88.8 exactly.

The repair pass is a safety net, not a root-cause fix: the original trigger never
reproduced here across a full 7x7 transition matrix, 44 randomized UI clicks, and
whole-scene censuses, all of which showed a consistent light/define state.
`city.shadowReconcileRepairs` counts repairs — if it is ever non-zero in normal
play, something upstream is skipping the registration choke point.

**Still open:** the seam check in motion at `cascade/low` (11.5x density step at
60 m) — static captures cannot settle it. The candidate `high` layout needs
re-measuring before adoption.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
