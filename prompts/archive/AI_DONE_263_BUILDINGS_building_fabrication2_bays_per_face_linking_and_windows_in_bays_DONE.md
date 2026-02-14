#Problem (DONE)

Building Fabrication 2 currently supports floor layers and per-floor-layer face selection/linking, plus base material configuration. We now need to author **bays per face** (with the same master/slave linking rules as materials).

# Request

Add bay authoring per face in Building Fabrication 2. Bays must support sizing constraints, repeatability to fill the face, and per-bay material override/inheritance indication.

Tasks:
- Scope + linking rules (important):
  - Bays are authored **per face** (per floor layer face).
  - If a face is linked as a slave, it must not duplicate/copy bay configuration; it only declares that it inherits from its master face and uses the master’s bay configuration.
  - This must follow the same link rules as material configuration.
- Floor layer UI:
  - Add a `+ Bay` button within the selected face context for a floor layer.
  - Bays belong to the currently selected face (master face authors; slaves inherit).
- Bay sizing:
  - Each bay has a width spec mode:
    - `fixed`: a single width value
    - `range`: `min..max`
  - Defaults:
    - `min` default is **0.1m** (must be enforceable)
    - `max` default is infinite
  - In the UI, represent “max is infinite” using a checkbox (e.g., `∞`) next to the max control.
  - Make it possible to edit the bay sizing mode and values (and show the current values clearly).
- Bay material override:
  - Each bay can override wall material using the same material picker widget as other material selection.
  - The UI must clearly indicate whether the bay material is inherited or overridden.
  - Clicking the bay material picker opens the same material popup selector (texture + color).
- Bay repeat-to-fill behavior (engine-facing requirement, driven by authored model):
  - Bays can be marked repeatable.
  - Repeatability is the **local repetition** concept (not group repetition).
  - Only bays marked repeatable participate in repetition.
  - Repetition strategy options:
    - Option A (balanced passes): add one extra repeat to each repeatable bay (in order) if *all* of those extras fit; otherwise stop repeating and proceed to leftover width distribution.
    - Option B (ordered fill): keep adding repeats one-by-one in a deterministic order until no more fit:
      - left→right
      - right→left
      - edges→center
      - center→edges
  - After repetition stops, any remaining space is distributed evenly across bays that have not reached max size.
    - Tie-break for remainder distribution must be **center-out** (deterministic).

Specs update:
- Update relevant specs under `specs/buildings/` to reflect:
  - bays authored per floor-layer face,
  - face linking inheritance rules (slaves reference master; no copying),
  - bay sizing min/max + infinite max UI semantics,
  - repeat-to-fill + even remainder distribution.

Constraints:
- Reuse existing UI builders; do not fork/duplicate large UI code.
- Implement only the bay UI/model requirements described here.
- Window configuration inside bays is out of scope for this prompt and must be implemented in a separate prompt.

## Quick verification
- Selecting a master face in a floor layer allows adding/editing bays; selecting a slave face shows it inherits from its master (no independent bay editing).
- Bays enforce min width 0.1m and support max infinite via checkbox.
- Bay material picker shows inherited/overridden state and opens the material popup selector.
- Marking bays repeatable causes repeat-to-fill behavior with deterministic even distribution of leftover space.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_263_BUILDINGS_building_fabrication2_bays_per_face_linking_and_windows_in_bays_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Added BF2 per-floor-layer per-face bay authoring UI (add/move/delete, width modes, repeatable, material override).
- Persisted bay specs in BF2 configs under `config.facades[layerId][faceId].layout.bays`.
- Extended the building fabrication generator to render bay-driven facade strips (including per-face material config + bay material overrides) and respect face linking inheritance.
- Updated building v2 UI/spec docs to include Bays behavior and “max = ∞” semantics.
