# Lighting configuration experiments

AI 560 lives under `tools/bake_lighting/experiments/lighting_configurations/`.
Its [README](../../tools/bake_lighting/experiments/lighting_configurations/README.md)
is the command, input-schema, stage ownership and limitation reference.

The experiment consumes the accepted game scene and installed bakes. It captures
G00 before export-specific material preparation, freezes five camera transforms,
shares one bus for poses 01/02, and stores four placements in a reusable Blender
project. Each view layer excludes unrelated buses from all transport. The game
and Blender project use one validated metric coordinate conversion.

Authored pose/lighting/render/color/analysis JSON and every executable stage are
tracked. Source snapshots, Blender files, raw EXRs, PNGs, metrics, logs and galleries
are ignored under `tests/artifacts/screens/illumination_560/`. The full master and
standalone stages use the shared bake framework and machine configuration.

Transport and display transformations remain separate. Six lights × five cameras
produce 30 pilot EXRs. A documented provisional heuristic
selects two lights; those and L00 produce 15 4K beauty references, accompanied by
matching 4K G00 images. Analysis cannot establish photorealism, source accuracy or
runtime performance from histograms. Material/sky translation limitations must be
visible alongside comparisons. Lighting candidates do not change production
settings or make incompatible baked packages applicable.

An accepted EXR contains only the requested camera's view layer. The renderer
decodes every scanline before writing a completion receipt. Image processing
selects the named camera explicitly and rejects ambiguous or unrelated layers;
it must never consume an earlier camera's retained Render Result. The analyzer
decodes each EXR once for all lobe/source/mask measurements.

The main review page uses three columns: Three.js ACESFilmic, AgX and ACES 2.0.
Each pose starts with its game reference, followed by one row per scene-lighting
configuration. Sticky column headings contain independent −1 to +1 EV sliders
stepped by 0.5 EV. Only the AgX column contains the look/grade selector. These
display changes reuse the saved linear EXRs and never retrace the city.

Separate baseline menus select the native game's ACESFilmic, AgX or Neutral tone
mapping and Vivid/Off/Warm/Cool grading. G00 remains the original ACESFilmic,
exposure 1.02, Vivid 65% capture. G01 contains native game display variants with
the same installed bakes and unchanged poses. Game grading and the offline AgX
look are distinct controls. ACES 2.0 is not labeled as a native game tone mapper.

Clicking a comparison opens a full-page carousel ordered game baseline,
ACESFilmic, AgX, ACES 2.0. Arrow buttons/keys navigate; Escape closes it and returns
focus. The separate diagnostic page retains blind labels, wipe views and crops.
Final preferences may justify future display-only changes or new source
lighting/bakes; neither is automatically promoted by this experiment.

## Planned game-to-reference matching

[AI 562](../../prompts/AI_graphics_562_ATMOSPHERE_match_game_lighting_to_cycles_acesfilmic_reference.md)
tracks the follow-up implementation to match the selected Cycles target in the
actual game using ACESFilmic with grading Off. Its scope includes lighting
composition, finite-sun shadow softness, declared Blender-compatible interior
proxies, a measured decision on restoring baked direct light, and immutable
progress captures. The user's game comparison already has grading Off; it must
not be confused with the original Vivid G00 baseline. The two original supplied
images and checksums are preserved under
`tests/artifacts/screens/ai562_acesfilmic_reference_matching/references/`.
This is planned work; AI 560 outputs and the production lighting are unchanged.
