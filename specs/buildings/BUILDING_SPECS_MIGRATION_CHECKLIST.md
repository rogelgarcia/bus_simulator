# Building Specs Migration Checklist (v1/v2)

Status: **Working checklist**  
Purpose: ensure new `specs/buildings/` documentation captures all existing building-related requirements before removing legacy spec files from `specs/`.

---

## 1. New authoritative entrypoints (expected)

- [x] `specs/buildings/BUILDING_2_SPEC_engine.md` created
- [x] `specs/buildings/BUILDING_2_SPEC_ui.md` created
- [x] `specs/buildings/BUILDING_2_SPEC_model.md` created
- [x] `specs/buildings/BUILDING_1_TO_2_CONVERSION_SPEC.md` created

---

## 2. Source prompts/specs coverage (one-by-one)

### 2.1 AI prompts (Building Fabrication v2)

**AI_DONE_252_BUILDINGS_building_fabrication_single_building_fixed_footprint_DONE.md**
- [x] “Edit one building” workflow → `specs/buildings/BUILDING_2_SPEC_ui.md`
- [x] Centered 2×1 starting footprint (when creating) → `specs/buildings/BUILDING_2_SPEC_ui.md`

**AI_DONE_253_BUILDINGS_building_fabrication_face_editor_and_mirror_lock_DONE.md**
- [x] Face selection (A–D) and viewport highlight → `specs/buildings/BUILDING_2_SPEC_ui.md`
- [x] Mirror/lock concept (A=C, B=D) → `specs/buildings/BUILDING_2_SPEC_ui.md`
- [x] Stable face identity derived from footprint → `specs/buildings/BUILDING_2_SPEC_engine.md` + `specs/buildings/BUILDING_2_FLOORPLAN_TOPOLOGY_SPEC.md`

**AI_DONE_254_BUILDINGS_building_fabrication_bay_layout_authoring_and_geometry_controls_DONE.md**
- [x] Bay-based facade layout per face → `specs/buildings/BUILDING_2_SPEC_engine.md` + `specs/buildings/BUILDING_2_FACADE_LAYOUT_SPEC.md`
- [x] Bay sizing + min widths + padding bays → `specs/buildings/BUILDING_2_FACADE_LAYOUT_SPEC.md`
- [x] Per-bay depth (extrude/inset) + wedge angle 15° steps → `specs/buildings/BUILDING_2_SPEC_engine.md` + `specs/buildings/BUILDING_2_FACADE_LAYOUT_SPEC.md`
- [x] UI validation warnings for invalid layouts → `specs/buildings/BUILDING_2_SPEC_engine.md` + `specs/buildings/BUILDING_2_SPEC_ui.md`

**AI_DONE_255_WINDOWS_shared_window_fabrication_module_and_bay_window_feature_popup_DONE.md**
- [x] Windows are bay content (not face-global spacing) → `specs/buildings/BUILDING_2_SPEC_engine.md` + `specs/buildings/BUILDING_2_FACADE_LAYOUT_SPEC.md`
- [x] Building-owned reusable window definitions + per-bay overrides → `specs/buildings/BUILDING_2_SPEC_engine.md` + `specs/buildings/BUILDING_2_SPEC_model.md`
- [x] Floor-skip/interval for bay windows → `specs/buildings/BUILDING_2_SPEC_engine.md`
- [x] UI reuse requirement (avoid duplicated UI) → `specs/buildings/BUILDING_2_SPEC_ui.md`

**AI_DONE_256_BUILDINGS_building_fabrication_generate_geometry_from_bays_and_update_belts_roofs_DONE.md**
- [x] Walls follow bay silhouette (depth + wedge) → `specs/buildings/BUILDING_2_SPEC_engine.md`
- [x] Depth transitions join correctly (no cracks) → `specs/buildings/BUILDING_2_SPEC_engine.md`
- [x] Belts and roofs follow silhouette → `specs/buildings/BUILDING_2_SPEC_engine.md`
- [x] Export includes facade/bay layout + window definitions → `specs/buildings/BUILDING_2_SPEC_model.md`

**AI_DONE_257_BUILDINGS_facade_repeat_groups_center_out_fill_solver_DONE.md**
- [x] Repeatable multi-bay groups + local repeat ranges → `specs/buildings/BUILDING_2_SPEC_engine.md` + `specs/buildings/BUILDING_2_FACADE_LAYOUT_SPEC.md`
- [x] Deterministic center-out extra distribution → `specs/buildings/BUILDING_2_SPEC_engine.md` + `specs/buildings/BUILDING_2_FACADE_LAYOUT_SPEC.md`
- [x] Legacy v1 → v2 conversion rules (spacing + columns) → `specs/buildings/BUILDING_1_TO_2_CONVERSION_SPEC.md`
- [x] Solver debug visibility requirements → `specs/buildings/BUILDING_2_SPEC_engine.md`

**AI_DONE_258_BUILDINGS_building_fabrication_scene2_simplify_ui_and_thumbnail_loader_DONE.md**
- [x] BF2 screen entry + no roads → `specs/buildings/BUILDING_2_SPEC_ui.md`
- [x] Sun bloom off while in BF2, restore on exit → `specs/buildings/BUILDING_2_SPEC_ui.md`
- [x] Empty start state (no building) → `specs/buildings/BUILDING_2_SPEC_ui.md`
- [x] Top-left panel placement (name/type + Load/Export) and view panel below → `specs/buildings/BUILDING_2_SPEC_ui.md`
- [x] Load thumbnails 2×3 paged grid from offscreen render → `specs/buildings/BUILDING_2_SPEC_ui.md`
- [x] Right panel empty in phase 1 → `specs/buildings/BUILDING_2_SPEC_ui.md`

**AI_DONE_259_BUILDINGS_building_fabrication2_faces_locking_and_layers_ui_layout_DONE.md**
- [x] Left `Create Building` spawns centered 2×1, 4 floors → `specs/buildings/BUILDING_2_SPEC_ui.md`
- [x] Default locking A→C and B→D on creation → `specs/buildings/BUILDING_2_SPEC_ui.md`
- [x] Face locking master/slave + unlink from master UI → `specs/buildings/BUILDING_2_SPEC_ui.md`
- [x] Floor layer authoring flow (`+ Floor` top-level, per-floor-layer faces + linking) → `specs/buildings/BUILDING_2_SPEC_ui.md`
- [x] Building-level layer groups + min 1 floor + 1 roof enforced → `specs/buildings/BUILDING_2_SPEC_ui.md` + `specs/buildings/BUILDING_2_SPEC_model.md`
- [x] Floor controls (floors + height) in floor layer group → `specs/buildings/BUILDING_2_SPEC_ui.md`

---

### 2.2 Existing specs

**BUILDING_FABRICATION_FACADE_LAYOUT_SPEC.md**
- [x] Moved to `specs/buildings/BUILDING_2_FACADE_LAYOUT_SPEC.md`
- [x] Updated/verified to include local repeat ranges + center-out distribution rules

**BUILDING_FABRICATION_FLOORPLAN_TOPOLOGY_SPEC.md**
- [x] Moved to `specs/buildings/BUILDING_2_FLOORPLAN_TOPOLOGY_SPEC.md`

**BUILDING_FABRICATION_SPEC** (legacy)
- [x] Moved to `specs/buildings/BUILDING_1_SPEC_legacy.md`

---

## 3. Cleanup gate (only after all checks above are done)

- [x] Remove the old building-related spec files from the root `specs/` folder (after the moves above are complete).
- [x] Confirm `specs/` root no longer contains building v1/v2 spec docs (they live under `specs/buildings/`).
