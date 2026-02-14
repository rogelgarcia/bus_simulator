#Problem (DONE)

In Building Fabrication 2, bay-to-bay linking introduces a master/slave relationship for whole-bay inheritance. Two issues need to be stabilized:

1) `Duplicate` should not be available on slave (linked) bays, because duplicating from a bay that is already inheriting is ambiguous and leads to confusing chaining.
2) When a bay that currently has slaves is linked to a different master (i.e., it becomes a slave), its existing slaves must be redirected to the new master to avoid multi-hop chains and to preserve the intended inheritance graph.

# Request

Stabilize BF2 bay linking behavior:
- Hide `Duplicate` on slave bays.
- When linking a master bay to another bay, automatically redirect its existing slaves to the new master.

Tasks:
- Hide `Duplicate` on linked (slave) bays:
  - If the currently selected bay is a slave (linked to another bay), do not show the `Duplicate` button in the bay editor.
  - `Duplicate` remains available only when the selected bay is a master (not linked) and editable.
- Redirect slaves when a master becomes a slave:
  - If a bay `B` is currently a master (i.e., other bays link to `B`) and the user links `B` to another bay `A` (so `B` becomes a slave of `A`):
    - All bays that were previously linked to `B` MUST be updated to link to `A` instead.
    - This prevents chains like `C -> B -> A` and ensures `C` becomes `C -> A`.
  - Example requirement:
    - Bays: `A, B, C`
    - `C` is linked to `B`
    - User links `B` to `A`
    - Result: `B` is linked to `A` and `C` must also link to `A`
- Graph normalization (engine/model intent):
  - The bay-link graph should remain simple and deterministic:
    - No cycles.
    - Prefer linking directly to the “root master” (flatten chains) when possible.
  - Surface invalid linking attempts clearly (no silent corruption).
- Specs update:
  - Update relevant building v2 specs under `specs/buildings/` to document:
    - `Duplicate` visibility rules for master vs slave bays,
    - “slave redirection” behavior when a master is linked to another bay,
    - chain-flattening/root-master behavior (if implemented).

## Quick verification
- For a slave bay, the bay editor does not show `Duplicate`.
- Given bays `A, B, C` where `C -> B`, linking `B -> A` automatically updates `C -> A`.
- No multi-hop chains remain after linking (or they are flattened deterministically).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_288_BUILDINGS_building_fabrication2_bay_linking_redirect_slaves_and_hide_duplicate_on_slaves_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Hid the bay editor `Duplicate` action for linked (slave) bays to prevent ambiguous chained duplication.
- Normalized bay linking to always point at the root master and redirected existing slaves when a master becomes a slave.
- Updated BF2 UI/engine specs and extended the headless e2e test to cover duplicate visibility + slave redirection.
