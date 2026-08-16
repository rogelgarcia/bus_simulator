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

| quality | map | radius | box | m/texel | VRAM | frame |
| --- | --- | --- | --- | --- | --- | --- |
| low | 4096 | 110 m | 220 m | 0.054 | 64 MiB | 10.05 ms (measured) |
| med | 8192 | 200 m | 400 m | 0.049 | 256 MiB | ~12.5 ms (estimated) |
| high | 16384 | 340 m | 680 m | 0.042 | 1024 MiB | 13.24 ms (measured) |

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

| quality | cascades | splits | boxes | maps | m/texel | VRAM | frame |
| --- | --- | --- | --- | --- | --- | --- | --- |
| low | 2 | 60 / 340 | 132 / 757 | 8192 / 4096 | 0.016 / 0.185 | 320 MiB | +6.33 ms |
| med | 3 | 45 / 150 / 340 | 99 / 331 / 757 | 8192 / 8192 / 4096 | 0.012 / 0.040 / 0.185 | 576 MiB | +8.27 ms |
| high | 4 | 45 / 90 / 190 / 340 | 99 / 198 / 420 / 757 | 8192 / 8192 / 8192 / 4096 | 0.012 / 0.024 / 0.051 / 0.185 | 832 MiB | +10.23 ms |

`high` is today's shipping layout, already visually validated. `med` keeps the
same near sharpness and gives up only mid-field detail. `low` has a **11.5x
density step** at its single 60 m boundary — verify that seam in motion before
shipping it; the 4x step at 45 m was reported as visible within minutes.

**Candidate upgrade for `high`, pending a visual check:** 4 cascades at
20/60/160/340 measured **+8.78 ms with 0.0055 near** — cheaper *and* 2.2x
sharper than the row above, same VRAM. It moves the first seam from 45 m to
20 m, where it occupies more screen space and steps 2.9x rather than 2.0x. If
that seam does not read in motion, adopt it for `high`; the measurement is
solid, only the appearance is unverified.

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

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
