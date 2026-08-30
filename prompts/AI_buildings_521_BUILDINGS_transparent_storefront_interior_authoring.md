# Problem

Building Fabrication 2 can place a parallax interior panel behind a window or
generate a minimal physical interior shell, but neither path can author the
kind of transparent multi-storey storefront visible in architectural
references. Parallax panels are convincing at distance but remain flat and
opaque behind otherwise clear glass. The physical shell is an empty unlit room
with hard-coded plaster on its walls, floor, ceiling, and exposed slab edge; it
has no partitions, fixtures, furniture, people silhouettes, lighting, or
per-layer material controls. Through clear glazing it can therefore read as a
black void, a hollow tube, or a pale horizontal cement band at the floor line.

The system also needs to remain correct for curved logical faces. Curved shell
walls and opening cuts now follow authored arc-length coordinates, so interior
authoring must build on that geometry rather than flattening the facade or
placing one flat room panel across several curved bays.

# Request

Add an extensible, performant physical-interior authoring system for transparent
storefront and office floors in Building Fabrication 2.

Tasks:

- Add a per-floor-layer interior mode with explicit choices for `none`,
  `parallax`, `physical`, and a documented hybrid/LOD mode. Existing configs
  must preserve their current behavior.
- Let physical interiors author wall, floor, ceiling, exposed slab-edge, and
  column materials independently through material slots/PBR specifications.
  Provide control of slab thickness, facade-edge setback, edge concealment, and
  a dark curtain-wall shadow-gap treatment so a real floor plate does not look
  like an unintended exterior cement belt.
- Add deterministic room-layout primitives: perimeter shell, optional opaque
  core, partitions, corridors, storefront vestibules, mezzanine/open-to-below
  zones, and per-opening sightline intent. Opposite clear openings may remain
  genuinely aligned, but ordinary views must not read as an accidental hollow
  glass tube.
- Add low-cost authored prop zones for retail displays, shelving, desks,
  counters, seating, planters, and human silhouettes. Zones use seeded catalog
  variants and collision-aware placement rather than baking individual prop
  transforms into every window.
- Add interior illumination authoring with emissive ceiling strips/spots,
  localized light probes or another bounded-cost solution, separate day/night
  intensity, and exposure-safe defaults under HDRI lighting. Clear glass must
  show readable depth without washing the room white or turning it black.
- Support transparent-glass composition deliberately: reflection/transmission
  balance, ordering with interior props and parallax fallback, depth/shadow
  behavior, and physically plausible blue-accent exterior reflections without
  hiding the room on transparent lower storeys.
- Preserve curved faces end to end. Partition boundaries, slab edges, interior
  walls, prop zones, and opening sightlines on an arc must use the face's
  authored `u`/local normal and sampled curve rather than a chord or start
  tangent.
- Add distance/quality LOD rules that can replace a physical room with a
  matching parallax representation without a visible pop. Define draw-call,
  triangle, light, and texture budgets per visible floor and for a full city
  block.
- Add Building Fabrication 2 UI for choosing the interior mode, editing room
  zones in plan, selecting materials/lighting/prop density, previewing the
  interior from street height, and warning when clear glass has no readable
  interior treatment.
- Persist the complete model through config normalization, cloning,
  import/export, catalog registration, BF2 reload, city placement, and runtime
  generation without losing stable layer/face ids or curved-face coordinates.
- Update the Building v2 engine/model/UI specifications and add unit tests for
  normalization, curved-room projection, slab-edge controls, deterministic prop
  placement, material/lighting persistence, and LOD selection. Add browser
  captures of a two-storey curved storefront in HDRI and neutral lighting from
  the exact same camera, plus a gameplay-like performance comparison after
  warm-up.

## On completion

- Mark the AI document as DONE in the first line.
- Rename in `prompts/` to:
  - `prompts/AI_DONE_521_BUILDINGS_transparent_storefront_interior_authoring_DONE.md` on `main`
  - `prompts/AI_DONE_buildings_521_BUILDINGS_transparent_storefront_interior_authoring_DONE.md` on the `buildings` branch
- Do not move to `prompts/archive/` automatically.
- Move to `prompts/archive/` only when explicitly requested.
- Add a high-level one-line summary per completed change.
- Because this prompt includes performance budgets and LOD optimization, include a same-condition before/after performance table in the completion summary for representative storefront and city-block views. Report frame time/FPS, whole-frame and storefront draw calls and triangles, CPU/GPU time, and relevant light/texture memory; state the hardware, resolution, graphics settings, visible-floor/interior configuration, workload/camera, warm-up, sample count, and statistic. Mark unavailable metrics as `not measured` with a reason rather than substituting projections.
