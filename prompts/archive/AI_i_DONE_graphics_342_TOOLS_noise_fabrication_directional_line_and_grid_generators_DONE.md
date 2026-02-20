# DONE

# Problem

The current noise fabrication screen only provides cloud-like noise, which is limiting for material workflows that need directional patterns and clean seam lines for normals.

# Request

Enhance the noise fabrication tool so it supports directional and line-based procedural patterns for sidewalks and wall tile/stone subdivision workflows.

## Requirements Checklist
Implementation groups: 7

### Group 1: Foundation and Compatibility
- [x] Preserve existing cloud/ridged workflows so existing usage is not regressed.
- [x] Ensure each noise implementation has the necessary parameter model for its behavior and controls, without forcing unrelated/shared-only parameters.

### Group 2: Generator and Preset Expansion
- [x] Add a `Directional fBm` generator that keeps organic noise behavior but adds directional stretching controls (`horizontalStretch`, `verticalStretch`) suitable for directional wear/streaks.
- [x] Add a `Line Bands` generator with orientation control (`horizontal`/`vertical`) and line shaping controls (`lineCount`, `lineWidth`, `softness`) for seam-like and strip-like normal content.
- [x] Ensure `Line Bands` supports single-seam use by allowing settings that produce one dominant vertical or horizontal line.
- [x] Add a `Tile/Grid Subdivision` generator with independent axis controls (`verticalLines`, `horizontalLines`) and joint shaping (`jointWidth`, `jointSoftness`) to fake stone/tile plate splits.
- [x] Default tile/grid joints to groove behavior (indented seams) rather than raised seams for normal-map authoring.
- [x] For this AI scope, expand generator families beyond cloud/line/grid by implementing at least the baseline material-focused set defined in this checklist (`Cellular/Worley`, `Edge Wear Mask`, `Micro Grain`, `Directional Streak/Flow`, `Crackle/Fracture`, `Low-frequency Blotch`); additional families are optional follow-up work.
- [x] Add baseline catalog entries for core material workflows: `Cellular/Worley`, `Edge Wear Mask`, `Micro Grain`, `Directional Streak/Flow`, `Crackle/Fracture`, and `Low-frequency Blotch`.
- [x] Add practical presets for the new workflows: `Sidewalk Streaks`, `Vertical Seam (Single)`, `Horizontal Seam (Single)`, and `Stone Plates Grid`.

### Group 3: Catalog Data and Loading Contract
- [x] Create a basic loadable noise catalog source (module or JSON-backed data model) that the screen reads at runtime to populate available noise types.
- [x] The loadable catalog should include, per noise entry, at least: id, display name, short description, usage example, supported map-target hints (`Normal`, `Albedo`, `ORM`), and default preset reference.
- [x] Use a catalog-only picker source policy for this AI (no implicit generator-metadata fallback), and enforce it consistently so picker entries come from one authoritative catalog path.

### Group 4: Noise Picker UX and Guidance
- [x] Add a noise picker UI in the noise fabrication screen that presents available noise types as quick-select entries with type name and short usage examples.
- [x] For each noise type tile/card in the picker, show a short description field plus a compact usage example snippet.
- [x] Show richer contextual details on hover for each noise picker entry, including suggested effect/application and guidance on mixing with other noise types to achieve specific results.
- [x] In the noise picker, add per-noise map-target hints indicating suitability for `Normal`, `Albedo`, and `ORM` workflows.
- [x] For `Albedo` hints, include guidance about safe color usage (brightness/hue/saturation variation) so noise does not produce unrealistic color shifts.
- [x] For `ORM` hints, include channel-oriented guidance (roughness breakup, metalness masking, AO/cavity shaping) so noise usage is physically plausible.
- [x] Keep the noise picker content practical for material authoring by requiring each catalog entry to include at least one concrete usage example tied to sidewalks, wall seams, or stone/tile subdivision, aligned with available generators/presets.

### Group 5: Layer Stack Authoring Workflow
- [x] Support layered noise mixing so multiple noise generators can be combined into one final output texture/normal source.
- [x] Represent the active noise stack as tabs, with one tab per applied noise layer.
- [x] Include a `+` tab action to add a new noise layer to the stack from the noise picker.
- [x] Support loading a selected catalog noise into the screen as an active generator layer (or into the currently selected layer when replacing), so catalog entries are not just informational.
- [x] Define the picker load behavior clearly: selecting a catalog entry from `+` creates a new layer from that catalog noise; selecting from an existing layer tab applies/replaces that layer with the chosen catalog noise.
- [x] Define default behavior for adding/replacing layers (default preset selection, initial layer naming, and initial strength/blend values).
- [x] Provide per-layer mixing controls (at least blend mode and layer strength) so stacking is usable for real material authoring workflows.
- [x] Define the supported layer blend-mode list and exact compositing behavior (math order, clamping/normalization rules, and deterministic evaluation order).
- [x] Add per-layer transform controls (`scale`, `rotation`, `offset`) and define layer coordinate space explicitly; for this AI, implement UV-space transforms as required, and if world-space is not implemented, mark it unsupported rather than silently falling back.
- [x] Add layer tab actions for duplicate and rename so artists can quickly branch and organize noise variants.
- [x] Add layer tab actions for lock and solo to speed up stack isolation while tuning.
- [x] Add a reorder icon at the top-right of the tab area that opens a dedicated popup for reordering noise layers in the stack.
- [x] Apply reorder changes from the popup deterministically to both live preview and saved recipe state.
- [x] Keep layer stack order deterministic and preserve it through recipe export/import.

### Group 6: Export and Serialization
- [x] Ensure the screen exposes an export button; if missing, add one.
- [x] Export behavior must support the current layered stack state by always exporting stack recipe JSON; baked map outputs are optional in this AI and must be explicitly labeled as unavailable when not implemented.
- [x] Define export scope per map target (`Normal`, `Albedo`, `ORM`) including explicit ORM channel packing (`R=AO`, `G=Roughness`, `B=Metalness`) and validation for missing/invalid channel sources.
- [x] Keep recipe export/import and deterministic generation behavior working with the new generators and parameters.

### Group 7: Migration, Performance, and Validation
- [x] Define recipe/version migration behavior so legacy single-noise states import cleanly into the layered model.
- [x] Define concrete performance limits for this AI (`maxLayers=8`, `maxResolution=1024`) and fallback behavior when limits are exceeded (clamp to limits, surface a visible status warning, and keep deterministic output).
- [x] Define and implement a minimum test matrix with explicit coverage: catalog load/schema validation, tab actions (`add`, `replace`, `duplicate`, `rename`, `lock`, `solo`, reorder), layer-mix determinism, export determinism, legacy-to-layered migration, and import/export roundtrip compatibility.

Rules:
- Do not edit text of completed items (`- [x]`).
- Add a new item for any fix/change to previously completed behavior.
- You may patch contradictory non-completed (`- [ ]`) items in place.

## Implementation Notes
- Interactive AI started for noise fabrication generator expansion.
- Initial direction confirmed: tile/grid joints should default to grooves (indented look).
- Added requirement to include an in-screen noise picker with hover details and mix/application guidance.
- Added requirement for tab-based layered noise stack with `+` add tab and per-layer mixing controls.
- Added requirements for duplicate/rename/lock/solo tab actions and popup-based reorder flow from a top-right tab-area icon.
- Added requirements for broader noise families and explicit map-target hints (`Normal`, `Albedo`, `ORM`) inside the noise picker.
- Added requirements for baseline basic-noise catalog entries, per-tile descriptions/examples, and explicit export coverage for layered workflows.
- Added requirement to make the basic noise catalog explicitly loadable by the screen at runtime.
- Clarified explicit catalog-to-screen semantics: selected catalog noise must load into active/new layers with defined picker behavior.
- Moved layered execution-path checker and export decision-assistant scope into a separate non-interactive AI prompt.
- Added closure requirements for blend math, layer transforms, add/replace defaults, picker content-source policy, export packing rules, perf limits, migration behavior, and minimum test matrix.
- Reordered the checklist into a progressive dependency flow (foundation -> generators/catalog -> picker -> layering -> export/migration/tests).
- Grouped checklist requirements into 7 implementation groups that can be delivered coherently.
- Tightened ambiguous requirements into explicit v1 acceptance criteria (scope bounds, catalog source policy, picker practicality criteria, transform-space expectations, export guarantees, ORM packing, numeric perf limits, and concrete test coverage).
- Implemented a layered v2 noise state model with deterministic stack compositing, UV transform controls, catalog-driven add/replace flow, and legacy v1 migration.
- Implemented expanded generator families and presets (`Directional fBm`, `Line Bands`, `Tile/Grid Subdivision`, `Cellular/Worley`, `Edge Wear Mask`, `Micro Grain`, `Directional Streak/Flow`, `Crackle/Fracture`, `Low-frequency Blotch`).
- Added a runtime-loaded noise catalog module with schema validation and practical map-target guidance (`Normal`, safe `Albedo`, channel-aware `ORM`) used as the authoritative picker source.
- Rebuilt the noise fabrication UI with stack tabs, `+` add semantics, rename/description/duplicate/lock/solo workflow, and top-right popup-based deterministic layer reorder.
- Implemented recipe export scope validation (`Normal`, `Albedo`, `ORM`) with explicit ORM packing (`R=AO`, `G=Roughness`, `B=Metalness`) and deterministic JSON recipe export only.
- Added/updated Node unit coverage for catalog schema validation, stack/tab actions, deterministic mix/order behavior, export determinism, ORM validation, legacy migration, and recipe roundtrip compatibility.
- Added `specs/graphics/noise_fabrication_layered_catalog_tool.md` documenting the layered contract, blend math, export semantics, migration, and performance limits.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_i_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
