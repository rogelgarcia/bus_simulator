# Problem

Building Fabrication 2 has a basic recessed-balcony mode from AI 489, but it
does not yet represent the complete embedded balcony/loggia condition visible
in the Terra & Mar reference. The desired architecture is a usable pocket
carved into the building mass: the balcony floor, ceiling, side returns, and
rear doors/windows sit behind the nominal facade plane. The outer edge may be
open or guarded, or it may carry a full-height wall or screen while the recessed
occupied space continues laterally behind that opaque bay and remains visible
from an oblique angle.

The current `solid_wall` railing infill is only a guard-height strip. It is not
a full-storey facade wall, and independently generated recessed balcony bays do
not form one connected cavity behind different front treatments. AI 537 also
supports continuity for projecting balconies only.

# Request

Extend the existing Building Fabrication 2 balcony feature into a complete,
connected recessed-loggia system. Keep one balcony feature whose behavior varies
by placement and context; do not introduce an unrelated parallel balcony type.

Tasks:

- Preserve the existing projecting, basic recessed, and Juliet behaviors and
  all existing configurations. The new behavior must be opt-in.
- Treat an embedded balcony as an authored void in the facade mass with a
  configurable recess depth, opening height, sill/floor elevation, ceiling,
  floor slab, side returns, and rear wall/opening plane.
- Keep doors, windows, interior treatment, materials, shadows, UVs, and wall
  cuts aligned to the recessed rear plane rather than the nominal facade plane.
- Add independent outer-front treatments per recessed bay: open, glass guard,
  metal/grid guard, low solid guard, and full-height opaque wall or screen.
- Make a full-height front wall/screen genuine facade geometry rather than a
  railing stretched vertically. Author its thickness, depth/offset, material,
  edge returns, and relationship to the floor and ceiling without z-fighting,
  duplicate caps, or light leaks.
- Allow adjacent recessed balcony bays to form one connected loggia/corridor
  cavity even when their front treatments differ. A glass-fronted bay may
  therefore reveal, from an angle, additional occupied space behind an adjacent
  opaque front wall.
- Add an explicit connection/partition policy between adjacent recessed bays:
  solid separation, doorway/opening, or no partition. Remove internal duplicate
  return walls, guards, slabs, and soffits only when the authored connection
  permits it.
- Extend balcony continuity/topology semantics so connected recessed bays and
  facade-end/corner conditions are validated deliberately. Do not silently use
  projecting-balcony continuity behavior for an unsupported recessed case.
- Support repeated, mirrored, face-linked, reversed, and multi-floor facade
  layouts while preserving stable ids and deterministic geometry.
- Provide Building Fabrication 2 controls for the recess volume, outer-front
  treatment, full-height screen dimensions/material, and adjacent-bay
  connection policy. Include plan/section or equivalent preview feedback so
  the hidden cavity and partitions are understandable before rendering.
- Persist all new settings through normalization, cloning, import/export,
  catalog registration, save/reload, and silhouette/face remapping without
  losing or inventing connections.
- Reject invalid combinations with actionable diagnostics, including no usable
  recess depth, overlapping rear openings, full-height screens outside the bay,
  incompatible floor/ceiling offsets, and connections to non-adjacent or
  non-recessed bays.
- Add focused model, generator, continuity, remapping, serialization, editor,
  and browser tests. Cover a single recessed bay, two connected bays with glass
  and opaque fronts, every partition policy, face ends/corners, repeated floors,
  legacy basic recessed balconies, and invalid configurations.
- Use the approved two-bay diagram as the primary behavioral acceptance scene:
  Bay A has a glass or metal guard, Bay B has a full-height opaque front wall,
  and the cavity continues laterally so Bay B's hidden zone is visible through
  Bay A from an oblique camera.
- Keep the existing Terra & Mar catalog entry unchanged. The separate recessed
  Terra & Mar variant may be upgraded to the connected/full-height behavior only
  as an explicit acceptance showcase, without making that building-specific
  arrangement part of the generic model.
- Update the canonical balcony, facade/bay, Building Fabrication 2 engine/model/UI,
  and testing specifications with the final schema, topology rules, supported
  combinations, compatibility behavior, and limitations.
- Capture same-camera before/after evidence plus front, oblique, plan/section,
  and close-up views under
  `tests/artifacts/screens/ai540-embedded-balcony-loggia/`. Rendered building
  views must use an HDRI as both the visible background and the environment/
  reflection source. Keep all generated images and manifests gitignored.

## Reference images

- [Original Terra & Mar reference](../downloads/references_ideas/b8.png)
- [Preserved Terra & Mar reference copy](../tests/artifacts/screens/ai540-embedded-balcony-loggia/references/terra-mar-b8-reference.png)
- [Approved embedded-balcony multi-view concept](../tests/artifacts/screens/ai540-embedded-balcony-loggia/references/embedded-balcony-approved-concept.png)
- [Annotated Terra & Mar balcony/pillar reference](../tests/artifacts/screens/buildings/terramar/references/annotated-pillars-balconies.png)
- [Annotated Terra & Mar facade map](../tests/artifacts/screens/buildings/terramar/references/annotated-faces-penthouse.png)

## On completion

- Mark the AI document as DONE in the first line.
- Rename it in `prompts/` to
  `prompts/AI_DONE_buildings_540_BUILDINGS_embedded_balcony_loggia_front_treatments_and_connected_cavities_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Move it to `prompts/archive/` only when explicitly requested.
- Add a high-level one-line summary per completed change.
