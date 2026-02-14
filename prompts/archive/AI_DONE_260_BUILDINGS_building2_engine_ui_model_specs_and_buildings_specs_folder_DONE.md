#Problem (DONE)

There is confusion and drift between the Building Fabrication “engine”, the UI workflow, and the underlying building specification format(s). We currently have:

- A legacy (v1) engine/model/UI that cannot support bay/facade-based buildings.
- A new (v2) effort in progress (engine/model/UI) intended to support facade/bay building.
- Multiple AI prompts and specs that describe parts of the system, but without a single stabilized “source of truth” split into: **engine**, **UI**, and **model**.

We need to consolidate and clearly separate:
1) **Engine**: rules/behavior/solving/rendering responsibilities (what happens).
2) **UI**: authoring workflow and reusable UI framework patterns (how users author).
3) **Model**: the building specification used by the engine (what is authored/serialized).

# Request

Stabilize the Building v2 documentation by creating three authoritative specification files under a new `specs/buildings/` folder:

- `BUILDING_2_SPEC_engine.md`
- `BUILDING_2_SPEC_ui.md`
- `BUILDING_2_SPEC_model.md`

These specs must be built by reviewing and merging all existing Building Fabrication v2-related AI prompts (including DONE prompts) plus the existing `specs/` documents. Also update project rules so that any AI prompt that changes the building specification must update one or more building specs.

Tasks:
- Establish terminology + versioning:
  - Define v1 (legacy) vs v2 (facade/bay) clearly in the specs.
  - Explicitly state that v2 is the rendering/authoring target going forward.
  - Define the relationship between engine/UI/model and their responsibilities/boundaries.
- Consolidate from prompts/specs:
  - Review all AI prompts related to Building Fabrication v2 (including DONE prompts) and extract requirements into the new specs.
  - Merge in relevant content from the existing specs in `specs/` (including building fabrication + facade layout + floorplan/topology + any other building-related specs).
  - Ensure no contradictions remain between the three new spec files (engine/UI/model separation must be clear).
- Engine spec (`specs/buildings/BUILDING_2_SPEC_engine.md`):
  - Describe the v2 engine responsibilities and behaviors:
    - Layout solving/filling rules (including group repetition and center-out distribution where applicable).
    - Geometry generation responsibilities (walls/belts/roofs/etc) at a requirements level.
    - Validation and warning/error surfacing requirements (no silent fallbacks).
    - Handling of floorplan topology and face identity constraints (stable faces derived from footprint edges).
  - Legacy support:
    - State that loading a v1 building must convert to v2 model and render via engine v2.
    - Include references/reminders for the conversion rules (windows/spacing/columns grouping + repetitions).
  - Structure reminder:
    - Add an explicit reminder that **each major engine feature/concept must live in its own spec file** (or its own sectioned file) so the engine spec does not become a monolith.
- UI spec (`specs/buildings/BUILDING_2_SPEC_ui.md`):
  - Describe the v2 fabrication UI workflow at a high level:
    - Screen entrypoints, panels, and authoring flow expectations.
    - Face selection and face locking expectations.
    - Where “load/export/metadata” live in the UI.
  - Reuse + framework guidance:
    - Add a clear requirement to **reuse UI builders/framework components** to avoid duplicated UI logic.
    - Prefer convention over configuration: adding a new UI item should be a one-liner registration, while the framework owns implementation details.
- Model guidance (`specs/buildings/BUILDING_2_SPEC_model.md`):
  - This file is guidance-oriented:
    - Explain that a v2 model/spec exists and is what the UI writes and the engine consumes.
    - Describe versioning and compatibility expectations (v1→v2 conversion).
    - Do NOT fully specify the concrete JSON/ES module schema here (format can be derived from source code).
- Repo/specs organization changes:
  - Create `specs/buildings/` and move building-related specs under it.
  - Update `PROJECT_RULES.md`:
    - Any AI prompt that changes the building specification must update one or more specs under `specs/buildings/`.
- Deleting old specs (only after verification):
  - Once the three new Building v2 specs capture every feature, delete the old building-related specification files from the root `specs/` folder.
  - Before deleting, do a one-by-one checklist review of each feature in the old specs/prompts and confirm where it is captured in the new specs (explicit checklist required).

Constraints:
- Treat the new `specs/buildings/` files as the authoritative source going forward.
- Keep “engine vs UI vs model” separation strict to reduce future confusion.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_260_BUILDINGS_building2_engine_ui_model_specs_and_buildings_specs_folder_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Created Building v2 specs under `specs/buildings/` splitting engine, UI, and model responsibilities.
- Added v1→v2 conversion spec and a migration checklist to verify coverage before removing legacy docs.
- Moved building-related legacy/spec docs into `specs/buildings/` and cleaned up `specs/` root.
- Updated `PROJECT_RULES.md` to require building-spec changes to update `specs/buildings/`.
