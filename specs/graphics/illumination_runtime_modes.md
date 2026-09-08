# Player illumination modes (AI 535)

This is the current player-policy supplement to [the illumination framework](illumination_framework.md).
Offline source, channel, package and publication contracts remain unchanged.

## Controls and persistence

Options → Baked lighting offers Current, Baked and Auto:

- Current requires no bake files and performs no bake fetches. It uses the existing
  live sunlight, shadows, hemisphere/IBL and the user's Current AO preferences.
- Baked requests the selected channels, with an explicit reason when unavailable.
- Auto selects the same complete exact-compatible set when available, otherwise Current.

Baked preferences (shadow enablement, moving-shadow resolution and indirect
illumination) survive Current mode, Save/Cancel/Reset and preset export/import.
Current lighting/shadow settings and both AO parameter banks remain separate.
Defaults retain the existing high-resolution baked-shadow preference under Auto;
indirect remains an explicit opt-in. A distribution without packages works normally.

The accepted AI 548 implementation is now the **only baked indirect path**. Its
surface coverage and render optimizations are part of indirect illumination;
there is no enhancement switch or warning. The old direct/enhancement/link fields
are normalized for compatibility: direct=false, enhanced=true, linked=false.
Old saved settings and imports cannot enable baked direct. The original compiler
and low-level channel implementations remain available for offline development;
normal gameplay fetches neither original-preview nor direct-irradiance maps.
Direct sunlight remains live, with the selected live/baked shadow visibility.

## Atomic activation and fallback

`BakedLightingRuntime` coordinates `BakedShadowRuntime` and the enhanced receiver
runtime. It reuses AI 530's existing mode/resource controller, package validation,
shadow cache and frame ownership; there is no second renderer or resource loader.
The shadow pipeline holds prepared activation until every selected channel is
ready. Receiver activation follows successful shadow preparation in the same
frame, before AO composition and visible rendering. Complete Current rendering
continues through loading. Changing intent cancels old generations and restores
Current before starting a new asynchronous transaction.

A failure or source/profile change restores the complete Current selection; a
shadow package cannot remain active on its own when requested indirect failed.
An indirect-only selection is supported with live shadows. Empty selections stay
Current and explicitly report `no_channels_requested`.

One validated publication per channel can remain cached while inactive. Mode
round trips reuse its maps; identity/source changes, context loss, explicit reload
and disposal invalidate it. Reload / revalidate clears the cached indices and
resources and repeats the existing validation path. Superseded loads cannot
commit. GPU resource retirement remains with its original owner.

## Lighting tab interactions

| Control | Behavior with baked indirect selected |
|---|---|
| Exposure / tone mapping | Applied live to the composed result; no source invalidation. |
| Visible HDR background / gradient, sky colors/exposure, haze, glare/disc | Remain live display/atmosphere controls; they do not replace the separately authored IBL/hemisphere sources. |
| Sun azimuth/elevation | Restore Current and select only an exact sun/indirect profile. No approximate reuse. |
| Sun intensity/color | Changes direct sunlight immediately; bounced sunlight in indirect requires an exact revalidation. |
| Hemisphere intensity/colors | Restore Current and revalidate; the mapped indirect bake replaces this diffuse contribution. |
| IBL enabled/intensity/HDR identity | Restore Current and revalidate the baked environment contribution. Reflections remain live. |
| Bloom / grading / flare / AA / AO | Remain live; do not restart source loading. |
| AO scope | Effective indirect activation selects the user's baked-lighting AO preference (Dynamic Only by default). Loading, Current and fallback use the separate Current preference. |

The enhanced index light profiles are checked before expensive geometry/source
validation. Full authenticated source and channel hashes are still required;
the quick comparison cannot authorize a publication by itself. Incompatible
Lighting changes are visible as a fallback, and restoring a compatible setting
triggers exact revalidation without changing the selected mode.

### Planned follow-up: independent reflections and compatibility warnings

[AI 557](../../prompts/AI_graphics_557_UI_independent_ibl_reflections_and_baked_lighting_warnings.md)
requests a separate environment-reflection intensity that can change without
invalidating baked indirect lighting. Diffuse source controls retain exact-profile
validation. Settings that can invalidate selected baked channels will receive an
alert icon and an accessible, setting-specific explanation popup. This is planned
work; the current coupled IBL behavior in the table above remains in effect until
that prompt is implemented and this interaction contract is updated.

## Diagnostics and offline workflow

The performance bar's right side has fixed slots for Shadows, Indirect,
Bus indirect and Visibility. Label columns fit their full text with a separate
gap before the fixed-width status column, so longer labels cannot overlap values.
Labels are soft white; state text uses muted colors: Loading
(light blue), Validating (blue), Disabled (red), Off (gray), Applied (green).
Waiting, Preparing and Ready distinguish queued work, resource/shader preparation
and waiting for atomic activation. Missing, stale, unsupported or failed data
shows Disabled with its reason on hover/focus; user-disabled features show Off.
Only committed use reports Applied, not downloaded or merely validated resources.
Applied fades after four seconds without moving the other slots; hovering or
focusing the reserved slot reveals it again. A new activation restarts its timer.
Other states persist. On narrow viewports the slots scroll within the right-hand
area without covering the hide button or increasing the 24px bar height.
The strip polls compact runtime status at the existing performance-bar cadence;
it does not serialize full material/resource diagnostics or control the bake.

The player status shows requested → effective mode, phase/reason and profile.
Developer diagnostics expose the selected channels, retained unavailable/stale/
failed cause, source/profile/compiler and channel identities, resource timing,
channel memory/residency, coverage, and indirect/UV/page/unmapped/difference/mip
views. These are snapshots, with no per-frame notification spam. Current intent
is represented as effective Current with the controller's fallback/current-requested
reason; the six public lifecycle states remain unavailable/loading/active/stale/
failed/fallback, with failed availability retained as the fallback cause.

Offline generation is `node tools/bake.mjs`; consult [the bake hierarchy](../../tools/baking/README.md)
and [its contract](../tools/bake_framework.md). The shared gitignored Blender
configuration, domain/leaf scripts, validation and publication gates remain the
only supported workflow. Options never invokes Blender.

Validation evidence and same-condition measurements are recorded in the
[AI 535 completion report](illumination_535_validation.md) and
`tests/artifacts/screens/illumination_535/final/`.
