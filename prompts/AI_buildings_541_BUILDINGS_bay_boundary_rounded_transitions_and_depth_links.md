# Problem

Building Fabrication 2 already lets each bay author independent left and right
depths. The resolved front of a bay can therefore slope, project, or recess,
but a depth or tangent difference at the boundary between two bays is currently
resolved as an immediate sharp return. Circular facade runs exist, and AI 539
proposes arbitrary path-aware facade splines, but neither gives authors a small,
local way to choose how two existing bay-front paths connect.

The missing intermediate feature is an opt-in boundary relationship: keep the
existing sharp join, or replace only the local boundary span with a rounded
transition that follows both incoming tangents. Authors also need to link the
two boundary depth values when desired and choose whether the transition is
centered automatically or meets at independently placed stations.

## Design references

These diagrams define the intended authoring relationships and visible
outcomes. They are conceptual rather than a required curve algorithm:

### Sharp versus rounded connection

![Sharp and rounded bay-boundary connection types](../tests/artifacts/screens/ai541-bay-boundary-curvature/design/01-connection-types.png)

### Rounded cross-face corner and boundary-depth links

![Cross-face tangent join with linked and independent depths](../tests/artifacts/screens/ai541-bay-boundary-curvature/design/02-rounded-corner-depth-links.png)

### Centered versus arbitrary transition stations

![Automatic and authored rounded-transition stations](../tests/artifacts/screens/ai541-bay-boundary-curvature/design/03-transition-stations.png)

An editable parameter explorer is preserved at
`tests/artifacts/screens/ai541-bay-boundary-curvature/bay-boundary-transition-designer.html`.

# Request

Add an opt-in Building Fabrication 2 bay-boundary connection feature that
supports the current sharp join and a tangent-continuous rounded join, without
requiring arbitrary whole-face splines and without changing existing building
output by default.

Tasks:
- Define one canonical schema, model, normalization, serialization, validation,
  and persistence contract for a relationship between two consecutive resolved
  bay-front endpoints. Support boundaries inside one logical face and physical
  corners between adjacent faces. The default or absent relationship must
  preserve the current sharp geometry exactly.
- Resolve relationships by stable physical face/bay endpoint identity rather
  than array position. Preserve meaning through fill-solver repeats, groups,
  master/slave bay linking, face linking, reverse-order faces, footprint
  reversal, mirroring, copied layers, import/export, undo/redo, and catalog
  round trips. Define left/right strictly from each resolved face's local `u`
  direction and report physical endpoint identities in diagnostics.
- Keep each bay's existing `depth.left`, `depth.right`, and within-bay `linked`
  behavior. Add an optional boundary-depth link between the left bay's resolved
  end depth and the right bay's resolved start depth. A linked boundary exposes
  one value and keeps both authored endpoints equal; an unlinked boundary keeps
  both values independently editable. Do not conflate the new cross-bay link
  with the existing within-bay left/right link.
- For `sharp`, retain the current immediate return or corner-resolution result.
  For `rounded`, trim the two bay-front paths at stations `P0` and `P1`, preserve
  their incoming/outgoing tangents, and connect them through a position- and
  tangent-continuous result. The rounded transition must have deterministic
  position, tangent, outward normal, arc-length, endpoint, and sampling behavior
  and must not introduce a new semantic bay or facade id.
- Provide an automatic centered mode with equal or linked runout distances and
  a centered meeting station. Also provide an authored mode with independent
  left/right runout distances measured in meters along the two resolved
  bay-front paths plus an authorable meeting station/bias. Moving the meeting
  station must alter the transition shape while keeping endpoint tangency.
- Support positive, zero, and negative bay depths; uniform and wedge-like bays;
  equal-depth tangent changes; unequal-depth steps; straight facade runs; and
  existing circular-arc facade runs. Cover both same-face boundaries and
  convex or valid concave cross-face corners. Keep the contract compatible with
  AI 539 so a future custom facade path can supply the same endpoint frames,
  but do not implement arbitrary whole-face splines in this task.
- Reserve the rounded transition span from ordinary bay content. Compute usable
  opening/feature clearance after `P0`/`P1` are resolved. Clamp only when the
  result remains deterministic and visibly faithful; otherwise block the join
  with an actionable warning. Never let the transition cut through a window,
  door, wall cut, pier, balcony endpoint, decoration target, or another reserved
  boundary span.
- Make the exterior wall, return/cap geometry, interior shell, floor/slab
  boundary, roof/parapet edge, belts, cornices, material regions, normals, and
  meter-based UV flow follow the same resolved local transition. Any registered
  consumer that cannot safely follow it must declare that limitation and block
  incompatible authoring; do not silently render a sharp, flat, chord, or
  midpoint approximation.
- Define interaction with AI 537 balcony continuity, edge bevels, corner
  treatments, face splits, and circular-run tessellation. Avoid duplicate
  corner patches, coplanar faces, internal caps, rail posts, or competing
  ownership of the same boundary. A rounded wall boundary does not implicitly
  join two balconies; each relationship remains explicit and independently
  validated.
- Add adaptive tessellation and stable seam rules with bounded geometric error,
  deterministic samples, smooth normals, consistent winding, and no topology
  flicker across LOD or repeat resolution. Validate excessive curvature,
  reversed tangents, loops, cusps, self-intersections, collapsed spans,
  overlapping transitions, impossible offsets, and degenerate corners.
- Add Building Fabrication 2 editor controls at a selected bay boundary or
  physical face corner: `Sharp | Rounded`, boundary-depth link, centered versus
  authored station mode, left/right runout distances, and meeting position.
  Show plan handles for `P0`, `J`, and `P1`, incoming/outgoing tangent guides,
  depth values, clearance limits, live validation, numeric editing, direct
  manipulation, Apply/Cancel, and undo/redo. Keep the existing bay depth editor
  available and make linked-value ownership unambiguous.
- Add a focused debug/showcase configuration containing: a same-face depth
  step, an equal-depth tangent kink, an asymmetric rounded step, and a rounded
  90-degree cross-face corner. Provide a sharp/rounded toggle or matched
  before/after variants so the local change can be compared without unrelated
  model differences.
- Add unit, generator, editor, persistence, and visual tests. Cover centered and
  asymmetric stations, linked and independent depths, positive/negative/mixed
  depths, wedge tangents, same-face and cross-face joins, convex/concave cases,
  circular faces, reversal/mirroring, repeated and linked bays, clearance
  rejection, invalid curves, UV continuity, normals/winding, deterministic
  tessellation, legacy configs, and exact round trips.
- Capture the design references, sharp/rounded before-and-after views, plan
  overlays, tangent/station close-ups, cross-face corner close-ups, invalid-state
  feedback, and the final showcase under
  `tests/artifacts/screens/ai541-bay-boundary-curvature/`. Keep all generated
  PNGs, SVGs, HTML previews, manifests, traces, logs, and reports gitignored.
- Update the canonical Building Fabrication 2 engine, model, UI, facade-layout,
  floorplan-topology, curved-run, balcony-continuity, schema, and testing
  specifications with the final relationship contract, capability limits,
  migration/default behavior, diagnostics, and acceptance evidence.

## On completion
- Mark the AI document as DONE in the first line.
- Rename it in `prompts/` to
  `prompts/AI_DONE_buildings_541_BUILDINGS_bay_boundary_rounded_transitions_and_depth_links_DONE.md`.
- Do not move it to `prompts/archive/` automatically; archive it only when
  explicitly requested.
- Add a high-level one-line summary per completed change.
