# Problem

Need an interactive 3D mesh system where AI instructions can drive mesh modeling.

# Request

Define and maintain requirements for an AI-instruction-driven interactive mesh modeling system, then implement in controlled passes only when requested.

## Requirements Checklist
### 1) Screen Shell and Entry
- [x] Add a new mesh-system screen that can open independently of gameplay.
- [x] Define this screen as the mesh fabrication screen (authoring-focused workflow and naming).
- [x] Provide a standalone HTML entry file so the screen can be opened directly.
- [x] Add a setup-menu shortcut entry that opens the mesh fabrication screen.
- [x] Build a layout with a 3D viewport area and a right-side configuration panel in a separate area (not overlayed on the viewport).
- [x] Use a standard 3D-tool style gray viewport environment with a subtle gradient background and ground plane baseline.
- [x] Add a top button panel with large square icon buttons for user mode and perspective setup.
- [x] Create meaningful custom icons for each top-panel button so each mode/layout is visually clear.
- [x] Add selectable top-bar view-mode buttons to switch between solid mesh view and wireframe view.
- [x] On mouse hover over any view tile, mark it as selected by changing its border color.
- [x] Replace redirect-style screen launcher with a true standalone HTML bootstrap that does not load `index.html` (and therefore does not execute core test bootstrap scripts).
- [x] Render each viewport tile with a distinct background color so view regions are visually differentiated.
- [x] Disable IBL/HDR scene background for mesh fabrication rendering so per-viewport clear colors remain visible and bounded to each tile.
- [x] Remove long mesh-path text from the Controls card to prevent horizontal scrolling in the right-panel widget.
- [x] Respect global GPU/perf bar top offset so mesh fabrication UI does not overlap with the status bar.
- [x] Remove the right-panel subtitle label text `Configuration panel`.
- [x] Clean the right configuration panel by removing all right-side widgets/cards.
- [x] After right-panel cleanup, keep only the main right-panel title visible.

### 2) Viewport Layout Presets
- [x] Add perspective-layout button preset 1: single angled 3D perspective view (default).
- [x] Add perspective-layout button preset 2: top row main 3D view; bottom row left + front + right views.
- [x] Add perspective-layout button preset 3: top row main 3D view; bottom row right + back + left views.
- [x] Add perspective-layout button preset 4: top row main 3D view; bottom row top + bottom views.
- [x] Add perspective-layout button preset 5: top row main 3D view; bottom row left + right views.
- [x] Replace individual layout preset buttons with a single combobox-style split button (main area + separator + down arrow), open a popup panel for layout choices, keep selected state in popup only, and keep extra spacing around separator/arrow affordances.
- [x] Remove `Layout N` textual labels from the views combobox UI and use descriptive preset naming/icons instead.
- [x] In the views popup, present layout choices as square buttons side-by-side using the same size as top-panel buttons.
- [x] Make views combobox and popup options fully icon-only (no visible text labels), preserving accessible aria labels.
- [x] Render the `3D only` layout icon as a single square full-viewport tile icon (not split top/bottom rows).
- [x] Reduce views combobox split-button down-arrow size and separator spacing.
- [x] Further reduce views combobox down-arrow size and internal padding for a tighter control footprint.
- [x] Set views combobox dropdown icon size to exactly `15px`.
- [x] Set views combobox split-button minimum width to `80px`.
- [x] Set top toolbar icon size to `15px` via `.mesh-fab-toolbar-btn .ui-icon`.
- [x] Scope `15px` icon sizing to the views combobox dropdown arrow only; keep general toolbar icon sizing unchanged.
- [x] Fix views combobox arrow-size override by using a selector more specific than `.mesh-fab-toolbar-btn .ui-icon`.

### 3) Camera Interaction Rules
- [x] Use default camera-control behavior baseline but map left mouse drag to 3D-view camera pointer/orbit interaction.
- [x] Restrict camera rotation/orbit interaction to the main 3D perspective view only.
- [x] In non-3D auxiliary views, allow zoom-only interaction (no orbit/pan rotation behavior).
- [x] Synchronize auxiliary-view zoom level so zooming in any one auxiliary view updates all other auxiliary views.
- [x] Fix first-pass viewport issues: recenter camera fit around preview object bounds, restore reliable left-drag orbit input, ensure front/back/top/bottom orthographic views frame the object, and normalize grid/floor presentation across views.
- [x] Fix second-pass viewport issues: render subviews before main 3D pass to prevent visual bleed, add middle-mouse pan in the main 3D view, and remove solid floor material so only grid remains visible.
- [x] Fix third-pass viewport bleed in RBTL-style layouts by clearing color/depth per tile and using pixel-quantized scissor/viewport bounds to prevent cross-tile carryover artifacts.
- [x] Fix secondary-view centering by using object-bounds-based orthographic framing per view orientation (front/back/left/right/top/bottom) instead of a shared generic span.
- [x] Fix fourth-pass viewport bleed by computing render-tile rectangles directly in framebuffer pixel space (not CSS-scaled tile bounds), and reduce default auxiliary-view zoom level for less aggressive framing.
- [x] Fix fifth-pass viewport-space drift by syncing renderer size to live viewport-stage bounds each frame and deriving tile partitioning from drawing-buffer dimensions.
- [x] Fix camera-coupling bug: panning/orbit in main 3D view must not move auxiliary-view framing; auxiliary views stay locked to model-center target while main view uses an independent camera target.
- [x] Fix sixth-pass viewport-dimension mismatch by deriving per-tile render rectangles from actual tile-frame DOM bounds (mapped to drawing-buffer coordinates) instead of inferred partition math.
- [x] Fix camera-pan Y-axis direction to match expected drag behavior in the main 3D view.
- [x] Fix follow-up camera-pan Y-axis inversion in main 3D view to align drag direction with user expectation.
- [x] Fix repeated pan Y inversion report by restoring main-view pan to negative Y drag mapping.
- [x] Fix latest pan Y inversion regression by restoring main-view pan to direct Y drag mapping.
- [x] Fix browser-zoom viewport-space mismatch so multiview tiles render/scissor correctly at zoom levels other than 50%.
- [x] Fix follow-up pan Y inversion by restoring main-view pan to negative Y drag mapping.
- [x] Fix additional pan Y inversion report by restoring main-view pan to direct Y drag mapping.
- [x] Fix 3D orbit drag Y inversion by switching main-view left-drag pitch mapping.
- [x] Fix browser-zoom viewport scaling bug by using CSS-pixel scissor/viewport coordinates (not drawing-buffer coordinates) in multiview rendering.
- [x] Fix viewport top/boundary gap by removing duplicate global top-offset from mesh-fabrication canvas sizing so render fills tile bounds exactly.
- [x] In `Select` user mode, left-drag from empty perspective-space (no selectable hit) must orbit/rotate camera as fallback.
- [x] Add a selectable top-bar `Orbit Camera` toggle button: when enabled, camera continuously auto-orbits around the current model target; when disabled, camera snaps back to the exact pose captured when toggle was enabled (no transition).
- [x] Preserve current camera pose when live mesh/object reloads; do not auto-refit/reset camera after initial mesh load.
- [ ] In non-3D auxiliary orthographic views (`left/right/front/back/top/bottom`), allow drag-panning within each view.
- [ ] Add a very small reset button at the top-right of the viewport area that resets camera position/pan offsets for every view.

### 4) Mesh Storage and Live Loading
- [x] Define a dedicated mesh handoff folder in the project where AI writes the mesh artifact and the viewer reads it.
- [x] Define the canonical mesh exchange format and filename contract used by AI output and viewer loading.
- [x] Load the viewer mesh from that shared handoff location (same source for write and read).
- [x] Add a mesh refresh check every 1 second in the viewer.
- [x] Add a Python mesh-serving endpoint with conditional requests (ETag/Last-Modified) so unchanged mesh checks return `304 Not Modified`.
- [x] Enforce conditional polling contract in the viewer using request validators (`If-None-Match`/`If-Modified-Since`) with 1-second cadence.
- [x] Use conditional polling in the viewer so unchanged checks do not re-download mesh payload.
- [x] Add a UI action to download the currently loaded live mesh as an `.obj` object file.
- [x] Ensure a bundled default mesh object is available and auto-loaded on screen startup so the page always opens with a visible mesh.
- [x] Add runtime fallback when `/api/mesh/current` returns `404` so polling switches to bundled static handoff file instead of failing live updates.
- [x] Remove `/api`-to-static fallback and use dedicated mesh API endpoint host by default so live updates work from standalone pages served from other origins.
- [x] Remove hardcoded live-update port; resolve mesh endpoint from current page origin by default.
- [x] Set default polling source to the canonical handoff file path on same origin so static-server setups (without `/api` routing) work out of the box.
- [x] Revert default polling back to Python API endpoint (`<origin>/api/mesh/current`) while keeping startup bootstrap from static handoff file.
- [x] Update Python mesh endpoint missing-file response to avoid `404`, returning `503 Service Unavailable` instead.
- [x] Keep Live Mesh `Sync` readout stable across polling cycles (no temporary `Checking` state text).
- [x] Provide a visibly different default handoff mesh revision so live polling updates are easy to verify in-scene.
- [x] Replace Live Mesh sync readout with a status button (icon + `ON/OFF` + indicator dot), pulse green for 5 seconds on updates, keep red on errors, and show status details in a hover output panel below the button.
- [x] Place the Live Mesh status button in the top panel bar (not in the right configuration card).
- [x] Clicking the Live status button toggles polling on/off; when off, no live mesh checks are performed.
- [x] When Live status is `OFF`, render the live button in non-selected/neutral visual style (no active-selected highlighting).
- [x] Apply an additional visible handoff mesh revision update for live polling verification.
- [x] Automate mesh handoff JSON formatting so small arrays are inlined consistently (for example `position`, `rotation`, `scale`, and other short primitive arrays).
- [x] Generate a new live handoff mesh that uses quad polygon faces in canonical v2 format.
- [x] Generate a single 6-face rectangular prism live mesh in canonical v2 format.
- [x] Support an empty live handoff mesh (`objects: []`) and load/render it without parser/runtime failure.
- [x] Replace empty live handoff with a visible box mesh revision for immediate viewport visualization.
- [x] Generate a tire experiment live mesh revision using canonical compiled topology (quad bands with stable hierarchical vertex/edge/face IDs).
- [x] Rebase tire experiment mesh so pivot follows bottom-center local-origin convention (`0,0,0`) with identity object transform.

### 5) Canonical Mesh Model and Topology IDs
- [x] Use a dual-format mesh pipeline with a canonical authoring format and a derived render format.
- [x] Use canonical v2 topology format only for the live parser (no legacy compatibility fallback).
- [x] Canonical authoring format must support polygon faces (quads and n-gons), not only triangles.
- [x] Include stable topology identifiers and topology metadata (for example topology version) in the canonical authoring format.
- [x] Require addressable and stable topology identifiers for faces, vertices, and edges so AI operations can reliably reference specific mesh elements.
- [x] Use hierarchical topology addressing with meaningful path segments (for example `part` -> `subpart` -> `element`) so IDs are human-readable and AI-referenceable.
- [x] Support hierarchical element-target addressing down to triangle/face, edge, and vertex index level within each part/subpart scope.
- [x] Ensure topology identifiers persist across non-topology-changing edits (for example transforms, material/UV updates, and camera/view operations).
- [x] Define ID lifecycle rule: non-topology-changing operations must preserve all existing face/edge/vertex IDs.
- [x] Define ID lifecycle rule: topology-changing operations must preserve unaffected IDs, assign new IDs to created elements, and never recycle removed IDs.

### 6) Rendering and Polygon Wire Visualization
- [x] Generate the viewport render mesh from the canonical authoring mesh rather than using the authoring file directly for rendering.
- [x] Triangulate polygon authoring data into a derived render mesh for Three.js/GPU rendering.
- [x] Maintain a stable mapping from canonical polygon face IDs to derived triangle IDs for traceability and selection interoperability.
- [x] In design mode, visually prioritize canonical polygon topology (quads/n-gons) instead of triangulation diagonals.
- [x] Support wireframe-over-mesh mode that renders shaded mesh plus polygon-boundary overlay lines.
- [x] Support wireframe-only mode that hides shaded surfaces and renders only polygon-boundary overlay lines.
- [x] Polygon wire overlay must be generated from canonical polygon edges and must not show triangulation diagonals.
- [x] Build polygon wire overlays as batched shared line geometry per viewport/mode, not per-quad/per-edge objects.
- [x] Add rendering performance guardrail: avoid per-face/per-quad draw-call scaling for polygon wire overlays.
- [x] Use workbench-style non-specular flat shading for mesh surfaces so viewport color does not shift with camera angle (avoid glossy/ice-like look during fabrication).
- [x] Replace display toggle buttons with a dropdown mode selector using industry-standard naming and include `Shaded`, `Shaded + Wireframe`, `Wireframe`, `Shaded + Vertices`, and `Vertices` modes.
- [x] In wireframe modes, render small face-center markers (quad/n-gon center dots) to improve polygon readability and face targeting.
- [x] Add display mode option `Shaded + Wireframe + Vertices` so users can view surfaces, polygon edges, and vertex points simultaneously.

### 7) AI Command and Audit Pipeline
- [x] Convert AI instruction input into a structured internal mesh-command schema before execution to keep execution deterministic.
- [x] Add an operation log format with stable operation IDs and per-operation metadata (timestamp, command, target IDs, output IDs, and status).

### 8) Product Definition and Safety
- [x] Define the end-to-end user workflow for turning AI instructions into mesh modeling actions.
- [x] Define V1 mesh operation scope (creation, transforms, extrusion/bevel, boolean, and material/UV hooks).
- [x] Define the interaction model (instruction entry, live preview behavior, accept/reject, undo/redo).
- [x] Define architecture boundaries (instruction parsing/planning, mesh operation execution, validation, scene integration).
- [x] Define quality/safety constraints (topology validity checks, perf guardrails, deterministic behavior where needed).

### 9) Derived Topology Authoring Model
- [x] Introduce a dual-layer mesh definition model: compact semantic authoring layer plus compiled explicit topology layer.
- [x] Keep mesh viewer/render/runtime execution bound to compiled topology while authoring input remains minimal and semantic.
- [x] Support semantic component authoring flow where users define named primitives (for example `box`) and then apply topology operations (for example `extrude`) on named targets.
- [x] Define deterministic primitive seed naming rules (for example box seed face IDs like `front/back/left/right/top/bottom`) so base topology IDs are stable without verbose manual per-vertex declarations.
- [x] Define deterministic lineage naming for topology created by operations, deriving child IDs from parent component path plus stable operation identifier.
- [x] Enforce topology ID lifecycle in derived mode: preserve unaffected IDs, deterministically continue affected IDs, assign new IDs only to created elements, and never recycle removed IDs.
- [x] Define deterministic fallback naming for ambiguous polygon loops (for example ring ordinals) so n-gon edge/vertex IDs remain stable across recompiles.
- [x] Define compiled-topology storage contract optimized for size/readability (array/index tables + ID maps) instead of requiring verbose per-element object payloads in authoring input.
- [x] Define and lock extrusion cap identity policy (reuse parent face ID vs always new derived cap ID) so downstream references stay predictable.
- [x] Add mesh-generation pivot convention: by default place generated part pivots at bottom-center local origin (`0,0,0`), with primitives seeded to sit on `Y=0` when explicit center is omitted.
- [x] Support deterministic primitive face aliases for both `box` and `cylinder`, allowing authored override labels while preserving canonical seed IDs and allowing operations to target either canonical or alias names.

### 10) View Gizmo Overlay Controls
- [x] Add a new dropdown-style button to the top bar immediately to the right of the current `Views` button.
- [x] Clicking this button must open an overlay options panel with one option per line.
- [x] The first overlay option must be a toggle to enable/disable axis arrows (view gizmo).
- [x] Axis arrows toggle default state must be ON when the mesh fabrication screen loads.
- [x] When enabled, render axis arrows in the main 3D view at the top-right corner (Blender-style placement).
- [x] When enabled, render axis arrows in each secondary/smaller view at the bottom-left corner.
- [x] Axis arrows must rotate to match current camera/view orientation as the main view is orbited.
- [x] Add visible `X`, `Y`, and `Z` labels to the axis arrows gizmo.
- [x] In secondary views, display only the two relevant axis labels for that view orientation.
- [x] Fix axis-label clipping/visibility by widening gizmo framing so labels remain visible in both primary and secondary views.
- [x] Increase axis-gizmo footprint and glyph size so arrows/labels are clearly visible in both primary and secondary views.
- [x] Use a unified switch-style ON/OFF toggle control in overlay options, applying the same switch component to `Axis Arrows` and `Wireframe Face Centers` (default ON for face centers).
- [x] Add overlay option `Hide Occluded Face Centers` (default ON) to depth-occlude face-center dots behind mesh surfaces when enabled.
- [x] When `Hide Occluded Face Centers` is ON, keep occlusion behavior active even when shaded mesh display is hidden (wireframe-only modes).
- [x] When `Wireframe Face Centers` is OFF, disable dependent face-center options (for example `Hide Occluded Face Centers`) and render them grayed out.
- [x] Keep `Hide Occluded Face Centers` scoped to face-center markers only; it must not hide/occlude polygon wires.
- [x] Add overlay option `Hide Occluded Wires` to control wire occlusion independently from face-center occlusion.
- [x] Add overlay-options toggle to enable/disable orange hover highlight tint for hovered topology elements.
- [x] Add overlay option `Pivot` (default OFF) that renders a checkered-ball pivot marker always on top (never occluded), and on hover shows pivot identity plus coordinates.
- [x] Rename pivot overlay option label to `Show pivot` and place this switch at the bottom of the overlay options list.
- [x] Resolve viewport pivot overlay marker from authored mesh/object origin (world-space transform origin) instead of mesh bounds center so pivot inspection reflects true generation pivot.

### 11) Generic Primitive Expansion (Cylinder)
- [x] Add semantic primitive support for `cylinder` in the semantic authoring compiler.
- [x] Support `cylinder` parameters: `radius` (uniform shortcut) or `radiusTop` + `radiusBottom`, `height`, and `radialSegments` (integer `3..256`).
- [x] Generate deterministic hierarchical seed IDs for cylinder topology (`top/bottom` caps, `side.sNNN` faces, ring/column edges, and top/bottom ring vertices).
- [x] Apply bottom-origin pivot convention to cylinder defaults: when `primitive.center` is omitted, seed center is `[0, height * 0.5, 0]`.
- [x] Keep topology-operation compatibility for cylinder seeded faces (for example `extrude_face` targeting `top`, `bottom`, or `side.sNNN`).
- [x] Generate a live tire mesh revision using semantic `cylinder` primitives in the `authoring` layer (outer body + inner bore component).
- [x] Orient the semantic-cylinder tire live mesh upright in the scene (wheel standing orientation) while preserving live-reload workflow.
- [x] Rotate the semantic-cylinder tire so its orientation reads as approaching from the Z axis in viewport framing.
- [x] Fix tire orientation so front orthographic view shows the slim/tread profile (not circular face) by adjusting semantic-cylinder transform rotation.
- [x] Fix deterministic cylinder face winding so generated normals are outward-facing (not inverted) for side/top/bottom seed faces.
- [x] Add deterministic cylinder cap-center fill options: keep n-gon center closure as default (`capCenterFill: ngon`) and add triangle-fan center closure (`capCenterFill: tri_fan`) with per-cap overrides (`topCapCenterFill`, `bottomCapCenterFill`) under `syncOppositeCap` validation.

### 12) Hover Topology Identification
- [x] Add hover identification for topology elements (faces, edges, vertices) and show the resolved element path at the bottom of the active viewport tile.
- [x] Use hover-hit priority `vertex > edge > face` so the most specific topology target is shown.
- [x] Render hierarchy labels as path text (for example `box > face_a > vertex_x`) and remove repeated parent-prefix segments.
- [x] Add right-click viewport context menu with `Copy Path` action that copies the hovered topology element address/path.
- [x] When `Hide Occluded Wires` is enabled, hovering must not pick occluded wires; hover path must fall back to the visible occluding face.
- [x] Add canonical stable topology ID support for hover/context menu: show canonical ID above authored hierarchy label in viewport status and add `Copy Canonical` in context menu.
- [x] When hovering a topology element (vertex/edge/face), tint the hovered element orange so hover targeting has immediate visual feedback in the viewport.
- [x] While topology context menu is open, moving pointer onto the context menu must not clear the current hover path/status; keep it until the menu is closed.
- [x] Fix wire-edge hover ID resolution so non-indexed line raycast indices map to the correct edge IDs (no repeated edge labels such as duplicate `...edge.8`, and highlight matches hovered edge).
- [x] Ensure canonical topology address paths include full object hierarchy segments (for example `part.box.main.edge.8`) to avoid canonical ID collisions across sibling subparts/components.
- [x] Fix face hover authored-path labeling so semantic face aliases (for example `bottom -> back`) are reflected in the authored path line instead of always showing canonical seed suffixes.

### 13) Boolean Operations Runtime
- [x] Add command-schema support for `boolean_union`, `boolean_subtract`, and `boolean_intersect` in the deterministic command pipeline (`mesh-command.v1`), including normalized args for `targetObjectId`, `toolObjectId`, and output identity policy.
- [x] Promote boolean family from hook-only to active execution in the V1 workflow scope, and update preview acceptance rules so valid boolean command windows can be accepted.
- [x] Implement deterministic boolean execution backend for canonical polygon topology (quads/n-gons) with robust mesh clipping and face reconstruction for union/subtract/intersect.
- [x] Specify boolean face-splitting as a geometry-agnostic algorithm (not primitive-specific): intersection-loop extraction, loop classification, and region partitioning must work for boxes, cylinders, and arbitrary polygonal meshes under the same deterministic rules.
- [x] Define explicit subtraction execution modes for deterministic behavior: `subtract_through` (can create tunnel/open cut-through) and `subtract_clamped` (pocket-style remove volume without through-hole openings).
- [x] Define topology-only cut operations as a separate non-boolean family (`imprint` / `slice`) that changes topology boundaries without removing volume, and keep these separate from volumetric `union/intersect/subtract` semantics.
- [x] Lock current face-hole policy for compiled v1: faces are single-ring only (no inner loops), so subtract results must represent openings by deterministic face splitting instead of polygon-hole face records.
- [x] Define and implement deterministic topology-ID remapping for boolean outputs: preserve unaffected IDs, deterministically generate new IDs for split/created elements, and never recycle removed IDs.
- [x] Preserve authored/canonical naming lineage through boolean results (component path, part/subpart hierarchy, face labels/aliases) and keep hover/status/context-menu addressability stable.
- [x] Define canonical naming for cutter-derived subtraction faces using operation lineage + cutter face lineage (for example `part.tire.outer.face.bool.sub001.inner.s005`), with optional authored alias display form that can omit operation token when needed.
- [x] Define deterministic one-to-many fragment suffix policy when one cutter face yields multiple result faces (for example `...inner.s005.f000`, `...inner.s005.f001`), preserving stable ordering across recompiles.
- [x] Define deterministic face-fragment ordering criteria for split outputs (for example canonical loop winding + stable start-vertex tie-breakers + area/centroid fallback) so generated face IDs are repeatable for identical inputs.
- [x] Recompute and validate compiled topology artifacts after booleans (`vertexIds`, `edgeIds`, `faceIds`, `faceEdgeIndices`, `face->triangle` mapping, topology index records).
- [x] Add geometry-validity guardrails for boolean outputs (manifold checks, degenerate-face rejection, winding/normal consistency, epsilon handling) with clear operation-log failure modes.
- [x] Add tests for boolean determinism and correctness (same inputs => identical IDs/topology output), including fixture coverage for tire-hole subtract and regression tests for hover picking and wire overlays.
- [x] Add a semantic-authoring operation path for booleans (document-level `authoring.operations` compiled/runtime path) so authored `outer minus inner` can produce a true hollow tire in compiled runtime.

### 14) Parametric Grid Authoring Contract (Generic + Family Adapters)
- [x] Define a core parametric surface grid contract with `u/v` domains as first-class topology axes and generic controls: `uSegments`, `vSegments`, `uClosed`, `vClosed`, and `uSeam`.
- [x] Define deterministic index-space rules (`uIndex`, `vIndex`, winding direction, seam ordering) so identical inputs always compile to identical topology ordering.
- [x] Define deterministic canonical ID rules derived from grid indices (for example `...vertex.uNNN.vMMM`, `...edge.uNNN.vMMM.to.uNNN.vMMM`, `...face.uNNN.vMMM`) so AI text references remain stable.
- [x] Define retessellation stability rules for segment-count changes: preserve unaffected IDs where mapping is deterministic, generate new IDs only for created topology, and never recycle removed IDs.
- [x] Define family adapters that map shape-specific controls into the core grid contract for at least `cylinder`, `revolve`, and `sweep` primitives.
- [x] For `cylinder` adapter, map aliases `radialSegments -> uSegments`, `axialSegments -> vSegments`, and `seamAngle -> uSeam`.
- [x] Define capped-solid extension parameters (`capRings`, `syncOppositeCap`) for applicable adapters, with deterministic mirrored `u` partitioning across opposite caps when enabled.
- [x] Define deterministic tessellation/face-layout rules so grid/cap loops produce predictable quad-band topology suitable for general curvature editing across supported parametric families.
- [x] Add a top-toolbar `Tessellation` button group in the mesh fabrication UI (same visual family as existing toolbar groups) dedicated to tessellation controls.
- [x] Add subcontrols within the `Tessellation` group to toggle tessellation preview/adjustment `On/Off` without altering canonical authored topology until explicitly committed.
- [x] Add tessellation adjustment subcontrols for deterministic density tuning (`uSegments`, `vSegments`, and adapter-mapped aliases such as radial/axial) with immediate preview updates.
- [x] Add documentation requirement: record the core grid contract, adapter mappings, extension parameters, and defaults in the mesh authoring document/spec (authoring-layer format contract).
- [x] Clarify section boundary: section 14 controls authoritative authoring tessellation inputs and canonical topology compilation behavior only.
- [x] In the tessellation popup UI, add an explicit visual separator and section grouping so section 14 controls are shown first and section 15 controls are rendered below them.

### 15) Visual Roundness Without Authoritative Topology Explosion
- [x] Clarify section boundary: section 15 controls are display-only post-compile rendering refinements and must never mutate canonical topology IDs/connectivity defined by section 14.
- [x] Introduce a dual-mesh rendering contract: authoritative canonical control cage plus derived display mesh.
- [x] Keep canonical topology IDs (`vertex`/`edge`/`face`) bound only to control-cage mesh; display mesh must never become authoritative topology state.
- [x] Add display smoothing modes: `Flat`, `Smooth Normals`, and `Subdivision Preview`.
- [x] Add non-destructive subdivision preview levels (`0/1/2`) applied only to display mesh.
- [x] Ensure side-silhouette smoothness is achieved by display-mesh density, never by mutating canonical topology IDs or canonical topology connectivity.
- [x] Add optional adaptive display tessellation based on screen-space silhouette error budget.
- [x] Keep selection/hover/context-menu operations mapped to canonical topology even when display mesh is subdivided.
- [x] Add deterministic mapping from display triangles back to canonical face IDs for picking, hover paths, and overlay rendering.
- [x] Add wireframe-source mode toggle: `Canonical Wire` vs `Display Wire` (default `Canonical Wire`).
- [x] Add display-LOD policy for derived mesh density (`near`/`medium`/`far`) with explicit performance budgets.
- [x] Define export policy: canonical mesh export is default; display mesh export is optional and non-default.
- [x] Document full dual-mesh + smoothing + LOD behavior contract in mesh authoring/workflow specs.
- [x] Add tests ensuring canonical topology IDs remain unchanged when smoothing/subdivision/LOD display settings change, and derived display regeneration remains deterministic for identical inputs.

### 16) Boolean Engine Migration (`manifold-3d` Authoritative)
- [x] Import `manifold-3d` into mesh-fabrication runtime plumbing and add a readiness/probe integration test (this task only).
- [x] Switch browser runtime manifold import-map resolution to CDN (`jsdelivr`) so mesh fabrication runtime does not require local `node_modules` path resolution.
- [x] Pin manifold integration to `3.3.2` for both runtime CDN and local install, and use package-root import (`manifold-3d`) to match v3 export rules.
- [x] Adopt `manifold-3d` as the authoritative boolean kernel for mesh fabrication runtime booleans (`union`, `subtract`, `intersect`) while keeping local custom logic disconnected from runtime execution/fallback paths.
- [x] Add a dedicated boolean-kernel adapter layer that converts compiled canonical topology to manifold input buffers and converts manifold output triangles back into canonical runtime topology artifacts.
- [x] Carry deterministic source-face provenance through the adapter (`originalId`/`faceId`/run mapping equivalents) and persist it into operation-log metadata for traceability.
- [x] Implement deterministic triangle regrouping post-pass (triangle -> canonical polygon face reconstruction) using provenance + coplanarity + connectivity, with stable fallback ordering when provenance is ambiguous.
- [x] Preserve canonical topology ID lifecycle through manifold outputs: keep unaffected IDs, deterministically suffix split fragments, assign new IDs only to created topology, and never recycle removed IDs.
- [x] Keep compiled v1 single-ring face policy explicit during manifold adoption: represent openings through deterministic face splits until hole-loop face records are formally introduced.
- [x] Add runtime kernel selection contract (`booleanKernel`) in workflow/handoff/specs with explicit values/defaults where fabrication runtime executes only `manifold-3d` (local custom remains non-runtime/disconnected).
- [x] Add hard-failure behavior: when manifold adapter execution fails, do not fall back to local custom; fail the operation explicitly, show a user-visible error in the fabrication UI, and emit operation-log error markers.
- [x] Add memory lifecycle safeguards for manifold WASM objects (no leaked allocations across repeated live-edit sessions).
- [x] Expand boolean regression corpus for manifold migration: stacked determinism runs, provenance assertions (`outer - inner` cases), coplanar/near-tangent/small-feature edge cases, and hover/wire mapping stability.
- [x] Document engine migration contract and rollout policy in specs (authoritative kernel choice, strict no-fallback runtime policy, provenance requirements, deterministic regrouping, and rollback thresholds).
- [x] Add a second deterministic regrouping pass that merges eligible fallback triangle-pairs into convex quads (same provenance/coplanarity + shared edge), while keeping stable deterministic ordering/IDs and retaining triangle fallback for non-mergeable cases.
- [x] Add a deterministic post-build merge pass in boolean face assembly to collapse eligible tool-sourced triangle pairs from the same source face into convex quads (shared-edge), so mixed tri/quad inner bands are normalized to quads when geometrically valid.
- [x] Refactor shared deterministic triangle-pair/convex-quad merge math into a common module and make stage execution explicit in code (`stage1` adapter regrouping, `stage2` face-assembly normalization).
- [x] In tessellation preview controls, normalize closed-cylinder `uSegments` to an even count after multiplier scaling (nearest valid even within limits) to reduce residual inner-hole triangle fragments at high U multipliers (for example `4.4x`).
- [x] Extend stage-2 triangle-pair merge to handle near-duplicate vertex index splits from manifold output (epsilon weld by quantized coordinate key for candidate building), and rebuild merged quad triangulation deterministically from merged loop indices.

### 17) Overlay Rulers and Measurements
- [x] Add a `Rulers` toggle in the overlay options panel.
- [x] In side orthographic views, render rulers at the bottom and at the left side of the viewport.
- [x] Ruler span must cover the full object extent for the corresponding axis in that view.
- [x] Add a distinct world-origin marker (`0`) on each ruler axis.
- [x] When hovering a ruler, render a thin guide line crossing the object at the hovered coordinate.
- [x] Show hovered-coordinate measurement on the corresponding axis, using meters only (no centimeter conversion).

### 18) Primitive Expansion (Tube / Hollow Cylinder)
- [x] Add semantic primitive support for `tube` (hollow cylinder) in the semantic authoring compiler.
- [x] Support `tube` parameters with per-side radii: `outerRadiusTop` + `outerRadiusBottom` and `innerRadiusTop` + `innerRadiusBottom`, plus uniform shortcuts `outerRadius`/`innerRadius`, `height`, `radialSegments`, and `axialSegments` (`vSegments`).
- [x] Add deterministic tube parameter validation: each side must satisfy `innerRadiusSide < outerRadiusSide`, all radii must be positive, and shortcut expansion must resolve deterministically to per-side values before topology generation.
- [x] Generate deterministic seed topology and canonical naming for tube surfaces: `outer`, `inner`, `top_ring`, and `bottom_ring` with stable per-segment face IDs.
- [x] Keep deterministic hierarchical vertex/edge IDs for inner/outer rings and bridge loops so hover/select/context-menu paths remain stable.
- [x] Apply bottom-origin pivot convention to `tube` defaults (if center omitted, sit on `Y=0` with pivot at local origin baseline).
- [x] Preserve operation compatibility (`extrude_face`, boolean targeting, etc.) for tube-generated faces using canonical and authored alias labels.
- [x] Add adapter/contract documentation updates for `tube` in mesh authoring specs and include examples for tire-style modeling without boolean subtraction.
- [x] Add unit coverage for deterministic tube compilation (ID stability, face naming, and retessellation behavior).

### 19) Architecture Reorganization (UI / Primitives / IO)
- [x] Split mesh-fabrication UI into `src/graphics/gui/mesh_fabrication/ui/` with one module per top-bar control/button (for example orbit, select, display mode, views combo, overlays combo, live toggle, tessellation, reset view), plus a toolbar composition module.
- [x] Move non-UI view orchestration from `MeshFabricationView` into dedicated services/modules (camera controller, viewport layout manager, hover/picking service, overlay render manager, context-menu/status service) and keep `MeshFabricationView` as composition shell.
- [x] Create `src/graphics/gui/mesh_fabrication/primitives/` with one compiler module per primitive (`box`, `cylinder`, `tube`) and shared helper modules for deterministic IDs, parametric indexing, face-label/alias resolution, vector math, and validation.
- [x] Add a primitive registry/dispatcher so semantic compiler routing is data-driven (`primitive.type -> module`) instead of large conditional blocks.
- [x] Split operation math into dedicated modules (`operations/extrude`, boolean adapter stages, future bevel/imprint) with explicit stage pipeline interfaces.
- [x] Reorganize live mesh loading into a dedicated loader subfolder `src/graphics/gui/mesh_fabrication/file_loader/` (no `io/` nesting).
- [x] In `file_loader/`, split responsibilities into explicit modules: `meshSourceResolver`, `meshFetchTransport` (ETag/Last-Modified contract), `meshPollScheduler`, `meshPayloadParserValidator`, and `meshSyncStateStore`, with a small facade export for `MeshFabricationView`.
- [x] Keep loader transport decoupled from UI state so live polling and mesh parsing can run headless in tests without `MeshFabricationView`.
- [x] Split runtime state into dedicated domains (`mesh_state/` for canonical/topology/runtime mesh data and `view_state/` for camera/layout/hover/UI selections) with explicit synchronization boundaries.
- [x] Extract rendering into pass modules (`surface`, `wire`, `vertices`, `gizmos`, `rulers`, `highlights`) orchestrated by a small render-pass scheduler.
- [x] Move picking/selection into a dedicated pipeline module (`raycast`, hit ranking, canonical path resolution, hover/click dispatch) decoupled from render code.
- [x] Centralize deterministic ID/topology lifecycle policy in dedicated modules (`id_policy/`) shared by primitives, operations, boolean remapping, and hover path resolution.
- [x] Split command pipeline internals into explicit stage modules (`parse`, `normalize`, `execute`, `audit_log`) with stable input/output contracts.
- [x] Decompose boolean adapter flow into explicit stage modules (input conversion, manifold kernel invocation, regrouping, deterministic remap, topology validation).
- [x] Consolidate authoring/compiled/live payload validators into `validators/` with reusable schema and deterministic error formatting.
- [x] Extract shared geometry/math helpers into `math/` modules (vector/plane/polygon ops, epsilon/quantization utilities) and remove duplicated math logic.
- [x] Introduce structured error taxonomy modules (`errors/`) with stable error codes and UI-facing message mapping, avoiding raw engine errors in UI components.
- [x] Add deterministic fixture/golden regression assets for mesh fabrication (`tests/fixtures/mesh_fabrication/`) and snapshot tests for topology IDs + canonical mapping stability.
- [x] Split mesh fabrication stylesheet into subfiles by concern (`styles/toolbar.css`, `styles/viewport.css`, `styles/overlay.css`, `styles/panel.css`) while preserving current visual output.
- [x] Add architecture/module-boundary documentation for mesh fabrication (`specs/graphics/mesh_fabrication_architecture.md`) defining dependency direction rules and ownership per folder.
- [x] Add folder-level unit tests/contract tests for each reorganized layer (UI wiring smoke tests, primitive compiler tests, file-loader polling/parser tests, stage-pipeline determinism tests).
- [x] Execute reorganization as a no-behavior-change refactor first (same runtime output/topology IDs), then add feature changes in follow-up items.

### 20) Phase 1: Face Slot Cuts + Opposite-Face Pairing
- [x] Add active command-schema support for `cut_face_slot` in the deterministic command pipeline (`mesh-command.v1`) with normalized args (target object/face, slot dimensions, orientation, and cut mode).
- [x] Support `cut_face_slot.targetFace` resolution via stable face ID, canonical label, or authored alias with deterministic tie-break behavior.
- [x] Support slot parameterization for straight cuts: deterministic local placement (`center`), `width`, `depth`, span/extent along face, and `cutMode` (`through` / `clamped`).
- [x] Add tube-aware local face-frame mapping so radial cuts on `top_ring.sNNN` / `bottom_ring.sNNN` and across-surface cuts on `outer.*` / `inner.*` resolve predictably.
- [x] Add optional opposite-face propagation modifier `oppositeFaceMode` with values `none`, `paired_same_index`, and `paired_mirrored_index`.
- [x] Define and implement paired-face mapping for tube surfaces: `top_ring <-> bottom_ring` and `outer <-> inner`, including deterministic same-index and mirrored-index rules.
- [x] Emit deterministic topology ID lineage and operation-log metadata for both primary and propagated opposite-face cuts in a single operation group.
- [x] Add regression coverage for slot cuts on `top_ring` / `bottom_ring` / `outer`, including opposite-face modes and determinism checks across repeated runs.

### 21) Phase 2: Path-Based Face Cuts
- [ ] Add active command-schema support for `cut_face_path` for non-straight cuts constrained to a target face.
- [ ] Support deterministic path input in face-local coordinates (polyline path with stable vertex ordering), plus profile params (`width`, `depth`, `cutMode`).
- [ ] Reuse face targeting + alias resolution semantics from phase 1 so path cuts work on stable IDs/canonical labels/authored aliases.
- [ ] Support optional `oppositeFaceMode` propagation for path cuts with the same paired-face mapping contract defined in phase 1.
- [ ] Define deterministic clipping/partitioning rules for path cuts under compiled-v1 single-ring face policy (no inner-loop face records).
- [ ] Add deterministic remap rules and tests for path-cut outputs (stable unaffected IDs, deterministic split IDs, repeatable ordering).

### 22) Phase 3: Polar/Pattern Cut Replication
- [ ] Add active command-schema support for `cut_pattern_polar` that replicates a base cut operation around tube/cylindrical index space.
- [ ] Support deterministic pattern controls: `count` or `step`, optional start phase offset, direction, and bounded segment range.
- [ ] Support base-operation templates for pattern replication using phase-1/phase-2 cut descriptors (`cut_face_slot` and `cut_face_path`).
- [ ] Ensure pattern replication supports `oppositeFaceMode` so mirrored/paired cuts are applied consistently across mapped faces.
- [ ] Define deterministic overlap/collision policy when repeated cuts intersect (ordering, merge/split policy, and stable ID suffix behavior).
- [ ] Add regression coverage for polar-pattern determinism, opposite-face propagation correctness, and topology validity under dense repeat counts.

### 23) Radial Topology Edit (Non-Primitive Meshes)
- [ ] Add active command-schema support for radial topology editing on non-primitive meshes with canonical operation IDs (for example `offset_faces_radial` and/or `set_face_radius`).
- [ ] Support target selection for radial edits via stable face ID, canonical label, or authored alias, including multi-face selection sets for contiguous bands.
- [ ] Define deterministic radial reference frame resolution (explicit axis preferred; otherwise deterministic fitted axis with stable tie-breaks) so repeated runs produce the same result.
- [ ] Support signed radial adjustments (`deltaRadius`) and absolute-radius assignment (`targetRadius`) with deterministic precedence and validation rules.
- [ ] Ensure radial topology edits remain executable after primitive lineage is lost (post-boolean/post-extrude arbitrary polygon meshes) without requiring primitive recreation.
- [ ] Preserve topology-ID lifecycle guarantees for radial edits (unaffected IDs preserved, deterministic IDs for split/created elements, no ID recycling).
- [ ] Emit operation-log metadata for resolved axis/frame, target-set membership, and effective per-face/vertex radial deltas.
- [ ] Add regression coverage for non-primitive radial edits (inner/outer bands, mixed-face selections, stacked edits) with determinism and validity checks.

### 24) Radial Link Modifier (Inner/Outer Coupling)
- [ ] Add optional `linkMode` modifier for radial-edit operations with values `none`, `pair_inner_outer_keep_thickness`, and `pair_inner_outer_same_delta`.
- [ ] Ensure link-mode behavior is deterministic so editing `inner` can optionally update `outer` (and editing `outer` can optionally update `inner`) through stable paired-face mapping.
- [ ] Define `pair_inner_outer_keep_thickness` behavior so paired-side updates preserve local wall thickness deterministically.
- [ ] Define `pair_inner_outer_same_delta` behavior so paired-side updates apply the same signed radial delta deterministically.
- [ ] Emit operation-log metadata for resolved `linkMode`, paired target resolution, and applied delta values for traceability.
- [ ] Add regression coverage for bidirectional inner/outer edits under all `linkMode` values, including determinism checks across repeated runs.

### 25) Command Modules: One Command Per File
- [x] Refactor command-specific normalization/execution logic out of `meshCommandPipeline.js` into dedicated command modules under `src/graphics/gui/mesh_fabrication/command_pipeline/commands/`.
- [x] Create one file per command id (`translate_object`, `set_object_transform`, `set_object_material`, `cut_face_slot`, `boolean_union`, `boolean_subtract`, `boolean_intersect`, `imprint_topology`, `slice_topology`, `needs_clarification`).
- [x] Define a command-module contract with explicit handlers (`normalizeArgs`, `execute`) and deterministic validation error formatting.
- [x] Add a command registry/dispatcher (`command type -> module`) so `meshCommandPipeline.js` remains an orchestration shell for parse/normalize/execute/audit stages.
- [x] Move shared command math/helpers into dedicated internal modules to avoid cross-command coupling.
- [x] Preserve runtime behavior, topology IDs, and operation-log schema as a no-behavior-change refactor pass.
- [x] Add regression tests that verify modular command dispatch determinism and behavior parity with the existing pipeline.

Rules:
- Do not edit text of completed items (`- [x]`).
- Add a new item for any fix/change to previously completed behavior.
- You may patch contradictory non-completed (`- [ ]`) items in place.

## Implementation Notes
- Interactive AI started on 2026-03-02 for AI-instruction-driven mesh system planning.
- Added standalone screen, direct HTML entry, viewport/right-panel separation, gray-tool viewport styling, top icon button panel, and 5 perspective layout preset requirements on 2026-03-02.
- Clarified perspective-layout preset 3 bottom row to `right + back + left` on 2026-03-02.
- Added camera-control interaction requirements: left-mouse 3D control, 3D-only orbit, aux-view zoom-only with shared zoom sync, and hover-selected border highlight on 2026-03-02.
- Added top-bar selectable view-mode requirement for solid mesh vs wireframe on 2026-03-02.
- Added mesh handoff/storage and live-refresh requirements: shared folder + format contract, 1s polling, and Python conditional endpoint with `304 Not Modified` support on 2026-03-02.
- Added stable addressable topology requirement (faces/vertices/edges) for deterministic AI mesh targeting on 2026-03-02.
- Added topology-ID persistence requirement across non-topology-changing edits on 2026-03-02.
- Added production-grade architecture requirements on 2026-03-02: dual-format mesh contract, operation-log schema, explicit ID lifecycle rules, strict conditional polling contract, and structured-command execution path.
- Added hierarchical topology-ID requirement on 2026-03-02: meaningful part/subpart addressing with triangle/edge/vertex-level targeting.
- Added polygon-authoring and wire-visualization requirements on 2026-03-02: canonical quads/n-gons, derived triangulation with polygon-to-triangle mapping, polygon-boundary wire modes, and batched overlay rendering constraints.
- Reorganized requirements by subject and execution order on 2026-03-02, starting with screen shell and ending with product/safety definition.
- Added fabrication-screen identity and setup-menu shortcut requirements on 2026-03-02.
- Implemented sections 1-3 on 2026-03-02: created Mesh Fabrication screen/state/stylesheet, added standalone launcher and setup-menu shortcut, implemented top-bar modes and perspective presets, and wired 3D-only orbit with shared auxiliary zoom and hover-selected view borders.
- Implemented follow-up viewport-fix pass on 2026-03-02: object-bounds camera fit/centering, orthographic framing fixes (front/back/top/bottom), bottom-view floor visibility correction, denser-grid reduction, tile split/render cleanup, and pointer-hit reliability updates.
- Implemented second viewport-fix pass on 2026-03-02: subview bleed mitigation (main view rendered last), middle-mouse pan support, and grid-only ground presentation (floor material removed).
- Implemented section 7 on 2026-03-02: added deterministic AI command normalization (`mesh-command.v1`), command execution overrides, and operation audit logging (`mesh-operation-log.v1`) with stable IDs + metadata persisted on parsed mesh runtime data.
- Implemented section 8 on 2026-03-02: added AI workflow/safety module (`mesh-ai-workflow.v1`), implemented right-panel AI instruction interaction (`Preview`/`Accept`/`Reject`/`Undo`/`Redo`) with non-destructive preview + batch history, and documented workflow/scope/boundaries/constraints in `specs/graphics/mesh_fabrication_ai_workflow.md`.
- Added section 9 requirement set on 2026-03-03: compact semantic authoring layer with deterministic compiled topology derivation, lineage-based stable naming, ID lifecycle constraints, and explicit extrusion cap identity policy decision.
- Added section 10 requirement set on 2026-03-03: top-bar dropdown overlay-controls button plus per-view axis-gizmo toggle/placement and orientation-follow behavior.
- Added section 10 follow-up requirement on 2026-03-03: axis-arrows default state set to ON at screen load.
- Implemented right-panel cleanup follow-up on 2026-03-03: removed all widgets/cards from the configuration sidebar, leaving a clean empty panel area.
- Implemented right-panel title follow-up on 2026-03-03: restored only the `Mesh Fabrication` title while keeping all other right-panel widgets removed.
- Implemented section 10 on 2026-03-03: added overlay-options dropdown button (to the right of `Views`), vertical overlay options panel, default-ON axis-arrows toggle, and per-viewport axis gizmo rendering (main top-right, secondary bottom-left) with camera-orientation-follow rotation.
- Implemented section 10 follow-up on 2026-03-03: added `X/Y/Z` labels to the axis gizmo arrows.
- Implemented section 10 follow-up on 2026-03-03: secondary orthographic views now show only two axis labels (hiding the view-normal axis label).
- Implemented section 10 follow-up on 2026-03-03: adjusted gizmo camera FOV/distance and gizmo sizing so axis labels are not clipped and remain visible in primary/secondary views.
- Implemented section 10 follow-up on 2026-03-03: enlarged gizmo viewport share, axis geometry, and label scale so arrows/labels are substantially easier to read.
- Implemented standalone-entry fix on 2026-03-02: `screens/mesh_fabrication.html` now directly boots a dedicated mesh-fabrication module and no longer redirects through `index.html`.
- Implemented third viewport-fix pass on 2026-03-02: per-tile color+depth clears and pixel-quantized viewport/scissor bounds to eliminate subview-to-main bleed artifacts.
- Implemented fourth viewport-fix pass on 2026-03-02: auxiliary orthographic views now use orientation-specific object-bounds fit calculations for consistent centering across all secondary views.
- Implemented fifth viewport-fix pass on 2026-03-02: switched multiview render tiling to framebuffer-space partitioning and reduced default aux zoom to avoid over-zoomed secondary framing.
- Implemented sixth viewport-fix pass on 2026-03-02: added live renderer-to-stage size synchronization and drawing-buffer-based tile partitioning to eliminate viewport-space mismatch/leak artifacts.
- Implemented seventh viewport-fix pass on 2026-03-02: decoupled main-view pan/orbit target from auxiliary-view target so only the main 3D camera moves on pan.
- Implemented eighth viewport-fix pass on 2026-03-02: per-tile viewport/scissor now follows real on-screen tile-frame bounds (DOMRect -> drawing buffer), removing inferred-size drift.
- Implemented ninth viewport-fix pass on 2026-03-02: corrected inverted Y direction in main-view pan.
- Implemented visual differentiation update on 2026-03-02: each viewport tile now uses a unique clear/background color.
- Implemented tenth viewport-fix pass on 2026-03-02: adjusted main-view pan Y direction again per user validation feedback.
- Implemented viewport-gap follow-up on 2026-03-03: removed duplicated `--global-top-bar-height` canvas offset in mesh fabrication mode (`top:0`, `height:100%`) so multiview rendering uses full tile space without top/boundary gaps.
- Implemented eleventh viewport-fix pass on 2026-03-02: disabled IBL background (state + standalone + render-time safeguard) so viewport tile colors/scissor regions render correctly.
- Implemented twelfth viewport-fix pass on 2026-03-02: restored main-view pan Y mapping to negative drag per latest user validation.
- Implemented thirteenth viewport-fix pass on 2026-03-02: changed main-view pan Y back to direct drag mapping after renewed inversion report.
- Implemented fourteenth viewport-fix pass on 2026-03-02: normalized tile scissor/viewport mapping to stage-space coordinates and aligned renderer resize checks to stage client size for browser-zoom stability.
- Implemented fifteenth viewport-fix pass on 2026-03-02: restored main-view pan Y mapping to negative drag after additional inversion report.
- Implemented sixteenth viewport-fix pass on 2026-03-02: switched main-view pan Y back to direct drag mapping after latest inversion report.
- Implemented seventeenth viewport-fix pass on 2026-03-02: inverted main-view orbit pitch Y mapping so left-drag up/down aligns with user-expected direction.
- Implemented eighteenth viewport-fix pass on 2026-03-02: switched multiview viewport/scissor math to CSS-pixel stage space and forced resize resync on devicePixelRatio changes to stabilize browser-zoom behavior.
- Implemented section 4 on 2026-03-02: added shared handoff file `assets/public/mesh_fabrication/handoff/mesh.live.v1.json`, defined and enforced `mesh-fabrication-handoff.v1` contract, wired 1-second conditional polling in mesh fabrication view, and added Python endpoint `/api/mesh/current` with `ETag` / `Last-Modified` returning `304 Not Modified` for unchanged mesh.
- Implemented section 4 follow-up on 2026-03-02: added right-panel `Download OBJ` action that exports the currently loaded live mesh document as a Wavefront `.obj` file.
- Implemented section 4 bootstrap follow-up on 2026-03-02: viewer now attempts to load bundled handoff file `assets/public/mesh_fabrication/handoff/mesh.live.v1.json` at startup, then continues 1-second conditional API polling for live updates.
- Implemented section 4 fallback follow-up on 2026-03-02: when `/api/mesh/current` responds `404`, viewer now auto-switches polling source to bundled static handoff file URL.
- Implemented section 4 endpoint follow-up on 2026-03-02: removed runtime 404 fallback and set default live polling endpoint to dedicated mesh server `http://127.0.0.1:8765/api/mesh/current` unless overridden by `?meshEndpoint=`.
- Implemented section 4 endpoint-origin follow-up on 2026-03-02: removed hardcoded endpoint port and restored default live polling endpoint resolution to `<origin>/api/mesh/current` (override via `?meshEndpoint=` remains).
- Implemented section 4 endpoint-default follow-up on 2026-03-02: changed default live polling source to `<origin>/assets/public/mesh_fabrication/handoff/mesh.live.v1.json` so existing static servers load live mesh without requiring `/api` endpoint wiring.
- Implemented section 4 endpoint-revert follow-up on 2026-03-02: restored default polling endpoint to `<origin>/api/mesh/current` and improved 404 error labeling while retaining startup static bootstrap mesh load.
- Implemented section 4 server-code follow-up on 2026-03-02: changed Python endpoint `/api/mesh/current` missing-file response from `404` to `503 Service Unavailable`.
- Implemented UI overflow follow-up on 2026-03-02: removed the mesh-path line from the Controls hint list to avoid right-panel horizontal scrolling.
- Implemented section 4 readout follow-up on 2026-03-02: removed per-poll `Checking` Sync label update so the Live Mesh sync status no longer blinks between checks.
- Implemented top-offset follow-up on 2026-03-02: mesh fabrication canvas/root now honors `--global-top-bar-height` to keep workspace content below the GPU/perf status bar.
- Implemented layout-control UX follow-up on 2026-03-02: replaced top-bar layout preset buttons with a split-combobox control and popup selector, moved selected highlighting into popup options only, and increased separator/arrow spacing in the combo affordance.
- Implemented layout-label follow-up on 2026-03-02: removed `Layout N` text from the views combobox summary/options and switched to descriptive preset labels plus icons.
- Implemented layout-popup sizing follow-up on 2026-03-02: converted popup options to side-by-side square buttons matching top-panel button size.
- Implemented icon-only layout-controls follow-up on 2026-03-02: removed all visible text from views combo/popup options and kept only layout icons with aria labeling.
- Implemented right-panel label follow-up on 2026-03-02: removed `Configuration panel` subtitle text from the configuration sidebar header.
- Implemented single-view icon follow-up on 2026-03-02: changed `3D only` layout icon rendering to a single square tile representation.
- Implemented combo-affordance sizing follow-up on 2026-03-02: reduced views combobox down-arrow size and tightened separator spacing.
- Implemented combo-density follow-up on 2026-03-02: further reduced views combobox arrow icon size and internal padding.
- Implemented combo-icon-size follow-up on 2026-03-02: set views combobox dropdown arrow icon size to `15px`.
- Implemented combo-width follow-up on 2026-03-02: set views combobox split-button minimum width to `80px`.
- Implemented toolbar-icon-size follow-up on 2026-03-02: set `.mesh-fab-toolbar-btn .ui-icon` size to `15px`.
- Implemented combo-only-icon-size follow-up on 2026-03-02: reverted `.mesh-fab-toolbar-btn .ui-icon` to `30px` and kept `15px` only on `.mesh-fab-layout-combo-arrow`.
- Implemented combo-arrow-specificity follow-up on 2026-03-02: changed the arrow rule selector to `.mesh-fab-toolbar-btn .mesh-fab-layout-combo-arrow` so `15px` overrides the generic toolbar icon size.
- Implemented live-mesh-visibility follow-up on 2026-03-02: updated handoff mesh to revision `rev-0003` with a clear accent color and top-part transform change so 1s polling updates are visually obvious.
- Implemented live-mesh-status-button follow-up on 2026-03-02: replaced Live Mesh sync readout with an `ON/OFF` status button and state dot, added 5-second green pulse on updates, persistent red error state, and hover output panel with current status text.
- Implemented live-mesh-topbar-placement follow-up on 2026-03-02: moved the Live Mesh status button/control from the right card to the top panel bar and kept the hover output anchored below it.
- Implemented live-mesh-toggle follow-up on 2026-03-02: wired Live status button click to enable/disable polling, including request gating when disabled.
- Implemented live-mesh-revision follow-up on 2026-03-02: updated handoff mesh to revision `rev-0004` with additional transform/material changes for a clearly visible live update.
- Implemented section 5 on 2026-03-02: replaced handoff parsing with canonical-only `mesh-fabrication-handoff.v2` (no legacy fallback), added mandatory topology metadata + lifecycle contract validation, added stable hierarchical IDs for vertices/edges/faces with topology index maps, added derived render-triangle generation from polygon faces, and updated default live handoff mesh to canonical polygon topology with explicit IDs.
- Implemented quad-mesh follow-up on 2026-03-02: replaced live handoff content with a new canonical v2 quad-only mesh (`demo.mesh_fabrication.quad_arch`, revision `rev-0006`).
- Implemented section 6 on 2026-03-02: rendered shaded meshes from canonical-v2 derived triangles, added stable `face -> triangle[]` mapping export, replaced triangle-wireframe display with batched canonical-edge line overlays (no triangulation diagonals), and added both `wire over mesh` and `wire only` display modes (wire button cycles overlay/only).
- Implemented rectangular-prism follow-up on 2026-03-02: replaced live handoff with a single rectangular block mesh (`demo.mesh_fabrication.rect6`, revision `rev-0007`) using exactly 6 quad faces.
- Implemented empty-mesh follow-up on 2026-03-03: updated parser/runtime to accept canonical `objects: []` and replaced live handoff with empty mesh revision `rev-0008`.
- Implemented box-restore follow-up on 2026-03-03: replaced empty handoff with canonical box mesh (`demo.mesh_fabrication.box`, revision `rev-0009`) for immediate visible loading.
- Implemented tire-experiment follow-up on 2026-03-03: replaced live handoff with a quad-band tire mesh (`demo.mesh_fabrication.tire`, revision `rev-0012`) using stable hierarchical IDs in compiled topology payload.
- Implemented section 9 on 2026-03-03: added semantic-authoring compiler (`mesh-semantic-authoring.v1`) and compact compiled topology contract (`mesh-fabrication-compiled.v1`), wired runtime to compiled-layer execution (including authoring->compiled derivation path), added deterministic box seed face naming + lineage-derived operation IDs (`extrude_face`), locked derived ID policies (`preserve_unaffected_create_new_never_recycle`, `always_new_derived_cap_id`, `ring_ordinal`), updated live handoff to dual-layer payload (`authoring` + `compiled`, revision `rev-0010`), and documented section-9 contract updates in graphics specs.
- Implemented rendering follow-up on 2026-03-03: switched fabrication surface material from PBR (`MeshStandardMaterial`) to flat-shaded diffuse workbench material (`MeshLambertMaterial` with `flatShading: true`) to remove camera-dependent specular color shifts and glossy/ice-like appearance.
- Implemented display-mode UX follow-up on 2026-03-03: replaced top-bar display buttons with a dropdown selector, standardized mode names to `Shaded`, `Shaded + Wireframe`, `Wireframe`, `Shaded + Vertices`, and `Vertices`, and added batched vertex overlay rendering for vertex-inclusive modes.
- Implemented overlay/face-centers follow-up on 2026-03-03: added batched face-center dot overlay for polygon faces (shown in wireframe modes), introduced `Wireframe Face Centers` overlay option toggle (default ON), and converted overlay toggles to unified switch-style ON/OFF controls for both `Axis Arrows` and `Wireframe Face Centers`.
- Implemented select-mode navigation follow-up on 2026-03-03: added perspective-tile ray hit check for selectable mesh surfaces and enabled orbit fallback when left-drag starts on empty space in `Select` mode.
- Added camera-interaction requirements follow-up on 2026-03-03: auxiliary orthographic drag-pan support and a tiny top-right global view-position reset button.
- Implemented display-mode follow-up on 2026-03-03: added `Shaded + Wireframe + Vertices` option and scene-visibility wiring so shaded surface, polygon wire overlay, and vertex overlay render together.
- Implemented overlay-options follow-up on 2026-03-03: added `Hide Occluded Face Centers` toggle (default ON) and wired face-center point depth-testing so occluded markers are hidden behind mesh when enabled.
- Implemented overlay-options follow-up on 2026-03-03: in wireframe-only modes, surface meshes now render as depth-only occluders (no color output) while `Hide Occluded Face Centers` is ON so hidden centers remain occluded without showing shaded surfaces.
- Implemented overlay-options follow-up on 2026-03-03: dependent face-center overlay controls now disable and gray out when `Wireframe Face Centers` is OFF.
- Implemented overlay-options follow-up on 2026-03-03: split occlusion controls so face-center occlusion no longer affects wires, and added independent `Hide Occluded Wires` toggle with its own depth-test control path.
- Implemented overlay-options hover-highlight toggle follow-up on 2026-03-03: added `Hover Highlight` switch in overlay options to enable/disable orange hovered-topology tint in real time.
- Implemented overlay-options pivot-marker follow-up on 2026-03-03: added default-OFF `Pivot` switch, checkered-ball pivot overlay rendered unoccluded above scene geometry, and hover readout showing `Pivot` with world-space coordinates.
- Implemented overlay-options pivot-label-order follow-up on 2026-03-03: moved pivot toggle row to the bottom of overlay options and renamed label to `Show pivot`.
- Implemented hover-topology follow-up on 2026-03-03: added per-viewport bottom hover status labels with hierarchical path formatting, plus raycast-based vertex/edge/face identification using overlay topology-id maps and priority `vertex > edge > face`.
- Implemented hover-topology follow-up on 2026-03-03: added viewport right-click context menu with `Copy Path`, copying the hovered topology element ID/path from the active view.
- Implemented hover-topology follow-up on 2026-03-03: occlusion-aware hover picking now ignores wire/face-center hits behind the nearest visible surface when occlusion toggles are enabled, and face fallback includes depth-only occluder surfaces.
- Implemented hover-topology canonical-ID follow-up on 2026-03-03: hover status now renders canonical stable topology ID (top line) plus authored hierarchy path (bottom line), right-click menu includes `Copy Canonical`, and canonical IDs resolve from `topologyIndex.*.address.path` mappings.
- Implemented hover-topology visual feedback follow-up on 2026-03-03: hovered vertex/edge/face now receives an orange in-scene highlight overlay tied to the active hover hit.
- Implemented hover-topology context-menu persistence follow-up on 2026-03-03: hover status/highlight clearing is suppressed while context menu is open so moving onto the menu preserves the current path display.
- Implemented hover-topology edge-index fix follow-up on 2026-03-03: corrected non-indexed wire `LineSegments` raycast index mapping (`0,2,4,... -> 0,1,2,...`) so hovered edge IDs and orange edge highlights consistently match the actual hovered wire.
- Implemented topology-address uniqueness follow-up on 2026-03-03: canonical `topologyIndex.*.address.path` now uses full object hierarchy (`objectId + element + index`) instead of only first two path segments, eliminating canonical path collisions for multi-subpart meshes.
- Implemented generation-rules pivot follow-up on 2026-03-03: updated mesh generation/spec conventions to default pivots to bottom-center local origin (`0,0,0`), including default semantic `box` seeding on `Y=0` and default transform position `[0,0,0]`.
- Implemented tire-pivot follow-up on 2026-03-03: updated live handoff tire mesh to revision `rev-0013`, rebased geometry for bottom-origin pivot, and set transform to identity (`position/rotation = [0,0,0]`).
- Implemented pivot-overlay-origin follow-up on 2026-03-03: pivot marker now resolves from authored object world origin rather than mesh bounds center, so pivot visualization matches mesh generation data.
- Implemented orbit-camera toggle follow-up on 2026-03-03: added selectable top-bar `Orbit Camera` button for continuous auto-orbit around model target and instant restoration to captured pre-toggle camera pose when turned off.
- Implemented live-button style follow-up on 2026-03-03: live status button now uses explicit ON/OFF visual states, with OFF rendered as neutral/non-selected style.
- Implemented section 11 on 2026-03-03: extended semantic compiler primitive support with deterministic `cylinder` seed topology (stable hierarchical IDs for cap/side faces, ring/column edges, and ring vertices), parameterized by `radius`/`radiusTop`/`radiusBottom`, `height`, and `radialSegments`.
- Implemented section 11 pivot/defaults follow-up on 2026-03-03: cylinder semantic defaults follow bottom-origin convention (`center` omitted => bottom cap at `Y=0`) and updated section-9 specs to document supported cylinder authoring contract.
- Implemented section 11 live-mesh follow-up on 2026-03-03: replaced handoff payload with `authoring`-driven tire using semantic `cylinder` primitives (`part.tire.outer` + `part.tire.inner`) and bumped revision to `rev-0014`.
- Implemented section 11 orientation follow-up on 2026-03-03: rotated the semantic-cylinder tire mesh to upright wheel orientation and bumped live handoff revision to `rev-0015`.
- Implemented section 11 Z-axis orientation follow-up on 2026-03-03: adjusted semantic-cylinder tire rotation for Z-axis approach framing (`rotation: [1.570796, 1.570796, 0]`) and bumped live handoff revision to `rev-0016`.
- Implemented section 11 front-view profile follow-up on 2026-03-03: corrected semantic-cylinder tire rotation to show slim/tread profile in front orthographic view (`rotation: [0, 0, 1.570796]`) and bumped live handoff revision to `rev-0017`.
- Implemented section 11 normals follow-up on 2026-03-03: corrected semantic-cylinder seed face winding order (side/top/bottom) to enforce deterministic outward normals and bumped live handoff revision to `rev-0018`.
- Implemented section 4 formatting-automation follow-up on 2026-03-03: added handoff JSON formatter tool (`tools/mesh_fabrication_live_server/format_handoff_json.mjs`) that inlines small primitive arrays deterministically, documented usage in the mesh live-server README, and registered the tool in `PROJECT_TOOLS.md`.
- Implemented face-alias override follow-up on 2026-03-03: semantic compiler now accepts `faceAliases` on component and primitive for `box`/`cylinder`, stores authored `label` plus stable `canonicalLabel`, resolves operation face targets by ID/alias/canonical label, and updated live handoff + specs with `top -> front`, `bottom -> back` examples.
- Implemented camera-preservation follow-up on 2026-03-03: live mesh reload/rerender now preserves active camera pose after first load by updating bounds/pivot state without running camera refit logic on subsequent object updates.
- Implemented face-hover alias-label follow-up on 2026-03-03: compiled topology now carries `faceLabels`/`faceCanonicalLabels`, runtime topology index preserves face `label` metadata, and viewport hover authored path rendering uses face alias labels when present (for example seed face ID suffix `bottom` displays authored label `back`).
- Added section 13 requirement set on 2026-03-03: boolean runtime execution scope covering command-schema support, workflow activation, deterministic topology/ID remapping, validity guardrails, semantic-operation integration, and regression tests.
- Added section 13 subtraction/naming follow-up requirements on 2026-03-03: specified subtract mode semantics (`through` vs `clamped`), separated topology-only cut operations from volumetric booleans, locked single-ring face-hole policy for compiled v1, and defined cutter-face-derived canonical naming + fragment suffix rules.
- Added section 13 generic-splitting follow-up requirements on 2026-03-03: clarified boolean partitioning must be geometry-agnostic (not cylinder-specific) and added explicit deterministic ordering/tie-break rules for split face fragment identity.
- Implemented section 13 on 2026-03-03: added active boolean command execution (`union/subtract/intersect`) with deterministic schema normalization, workflow scope activation, and topology-cut hook separation (`imprint_topology`/`slice_topology` remain non-executable hooks).
- Implemented section 13 deterministic-ID follow-up on 2026-03-03: fixed target-face preservation bug in boolean remap path so unchanged faces retain canonical seed IDs; kept deterministic cutter-lineage naming (`...face.bool.<opId>.<toolFaceTag>[.fNNN]`) and stable fragment suffix ordering.
- Implemented section 13 guardrail follow-up on 2026-03-03: added boolean topology validation checks (duplicate/missing refs, degenerate faces/triangles, non-manifold edge fan-out, winding consistency on shared edges) with explicit operation-log error propagation.
- Implemented section 13 test follow-up on 2026-03-03: expanded boolean unit coverage with deterministic repeatability checks, topology-cut non-executable hook assertions, and face->triangle traceability assertions used by hover/wire overlay systems.
- Added section 14 requirement set on 2026-03-03: deterministic parametric-surface grid authoring parameters for generic cylindrical/revolved topology (`u/v` indexing, mirrored cap partitions, stable ID derivation) and explicit note to document this contract in the mesh authoring spec.
- Rewrote section 14 requirements on 2026-03-03 into a generic core `u/v` parametric-grid contract plus adapter mappings (`cylinder`, `revolve`, `sweep`) and capped-solid extensions (`capRings`, `syncOppositeCap`).
- Implemented section 14 on 2026-03-03: added `mesh-parametric-grid.v1` contract fields to semantic compilation/id-policy, implemented executable cylinder `u/v` tessellation adapter (`radial->u`, `axial->v`, `seamAngle->uSeam`) with deterministic side/cap grid layout + cap ring extensions, added declared non-executable adapter mappings for `revolve`/`sweep`, wired top-bar Tessellation controls (`On/Off`, `U`, `V`) as non-destructive preview overrides, and updated mesh fabrication specs with the full contract documentation.
- Added section 15 requirement set on 2026-03-03: dual-mesh visual-roundness contract (canonical control cage + derived display mesh), display smoothing/subdivision/LOD controls, canonical-ID safety rules, and deterministic mapping/testing/documentation requirements.
- Implemented section 14/15 clarification follow-up on 2026-03-03: added explicit checklist boundary rules (section 14 authoritative authoring tessellation vs section 15 display-only refinements) and updated tessellation popup UI with a visual section separator so section 15 controls are grouped below section 14 controls.
- Implemented section 15 on 2026-03-03: added dual-mesh runtime contract (hidden canonical control cage + derived display mesh), section-15 tessellation popup controls (`Flat`/`Smooth Normals`/`Subdivision Preview`, subdivision levels `0..2`, adaptive error-budget toggle, canonical/display wire source, near/medium/far LOD budgets), deterministic display-triangle-to-canonical-face mapping for picking/hover, display OBJ optional export path (`meshKind=display`) with canonical as default, updated mesh fabrication specs with full section-15 contract, and added deterministic node unit coverage in `tests/node/unit/mesh_fabrication_display_mesh_contract.test.js`.
- Added section 16 requirement set on 2026-03-03: manifold-led boolean engine migration plan (authoritative `manifold-3d` kernel, adapter/provenance mapping, deterministic regrouping + ID lifecycle preservation, runtime kernel selection with strict no-fallback execution, WASM lifecycle safety, expanded regression corpus, and rollout documentation).
- Updated section 16 wording on 2026-03-03: local custom boolean logic stays in-repo but is explicitly disconnected from runtime execution (strict no-fallback policy).
- Implemented section 16 integration slice on 2026-03-03: installed/imported `manifold-3d`, wired a manifold readiness check into the boolean runtime path, added import-map entries for browser screens, and added unit coverage in `tests/node/unit/mesh_fabrication_manifold_kernel_integration.test.js`.
- Implemented section 16 CDN follow-up on 2026-03-03: updated browser import maps (`index.html`, `screens/mesh_fabrication.html`) to resolve `manifold-3d/manifold.js` from `https://cdn.jsdelivr.net/npm/manifold-3d@2.5.0/manifold.js`.
- Implemented section 16 version-alignment follow-up on 2026-03-03: aligned manifold runtime + local install to `3.3.2`, updated import maps to bare specifier key `manifold-3d`, and switched runtime import to package root so Node/tests respect package `exports`.
- Implemented section 16 runtime migration on 2026-03-03: added dedicated manifold adapter layer (`meshBooleanKernelAdapterManifold.js`) that converts canonical topology to manifold mesh buffers (`triVerts`/`faceID`/`runOriginalID`) and converts manifold output back to canonical runtime artifacts with deterministic provenance-aware regrouping.
- Implemented section 16 no-fallback kernel contract on 2026-03-03: boolean runtime now executes through `manifold-3d` only, introduced explicit `ai.booleanKernel` contract (`manifold-3d` default/only runtime value), and added hard-failure operation-log markers (`boolean_kernel_error`, `no_fallback`) plus kernel metadata.
- Implemented section 16 deterministic topology + UI/error follow-up on 2026-03-03: preserved canonical ID lifecycle reuse/suffix rules across manifold outputs, enforced compiled-v1 single-ring face policy via deterministic split fallback for multi-loop regions, and surfaced boolean runtime errors in fabrication UI live status.
- Implemented section 16 safety/test/spec follow-up on 2026-03-03: added explicit manifold WASM object cleanup safeguards (`delete()` in adapter finally paths), expanded boolean regression coverage (stacked determinism/provenance/edge-case/mapping stability), and documented the authoritative manifold migration + rollout/no-fallback policy in mesh workflow/handoff specs.
- Implemented section 16 deterministic regrouping enhancement on 2026-03-03: added second-pass fallback merge that deterministically combines eligible adjacent fallback triangles into convex quads (same provenance/plane + shared edge), preserving stable ordering while keeping triangle fallback for non-mergeable fragments.
- Implemented section 16 triangle-normalization follow-up on 2026-03-03: added deterministic boolean face-plan post-processing that merges eligible tool-side triangle pairs from the same source face into convex quads before ID emission, eliminating mixed inner tri/quad bands where a valid quad exists.
- Implemented section 16 staged-refactor follow-up on 2026-03-03: extracted shared deterministic triangle-pair/convex-quad merge helpers into `meshBooleanDeterministicQuadMerge.js` and updated both passes to explicit staged flow naming (`stage1_adapter_regrouping`, `stage2_face_assembly_normalization`).
- Implemented section 16 tessellation-preview stability follow-up on 2026-03-03: closed-cylinder tessellation preview now snaps scaled `uSegments` to even counts (`nearest valid even`) before compile/runtime boolean execution to reduce high-multiplier residual triangle pairs (example: `4.4x` -> `212` instead of `211`).
- Implemented section 16 stage-2 weld merge follow-up on 2026-03-03: added relaxed candidate construction for stage-2 triangle-pair merges using quantized coordinate welding (for near-identical split vertices), then rebuilt merged quad render triangles from merged loop indices; verified elimination of residual inner triangles for high-radial subtract cases (`u=150`, `u=211`) and added regression coverage.
- Implemented section 17 on 2026-03-04: added overlay `Rulers` toggle, bottom/left rulers for orthographic views, world-origin (`0`) ruler markers, and ruler-hover guide lines with axis-coordinate meter readouts.
- Implemented section 18 on 2026-03-04: added executable semantic `tube` primitive compilation with deterministic per-side radius expansion/validation, stable inner/outer/top_ring/bottom_ring topology IDs + canonical labels, bottom-origin center defaults, tessellation-preview support for tube components, updated mesh authoring specs with tube contract + tire-style no-boolean example, and added deterministic tube unit coverage (naming, ID stability, retessellation, canonical/alias operation targeting).
- Added section 19 requirement set on 2026-03-04: architecture reorganization plan for UI modularization, primitive compiler decomposition, IO/loader separation, stage-based operation modules, and no-behavior-change refactor sequencing.
- Updated section 19 loader scope on 2026-03-04: made file-loader refactor explicit with dedicated subfolder `io/file_loader/` and concrete module split for resolver/transport/scheduler/parser-state responsibilities.
- Updated section 19 loader path on 2026-03-04: changed loader target to direct `file_loader/` (removed `io/` nesting) while keeping the same module split.
- Expanded section 19 on 2026-03-04 with additional architecture tasks: state-domain split, render-pass modularization, picking pipeline isolation, centralized ID policy/validators/errors/math, boolean+command staged decomposition, fixture/snapshot strategy, CSS concern split, and architecture boundary documentation.
- Implemented section 19 on 2026-03-04: introduced folderized architecture (`ui/`, `file_loader/`, `primitives/`, `operations/`, `command_pipeline/stages/`, `render_passes/`, `picking/`, `mesh_state/`, `view_state/`, `id_policy/`, `validators/`, `math/`, `errors/`, `services/`), rewired `MeshFabricationView` to compose new toolbar/file-loader/render/picking/state services, converted semantic primitive routing to registry dispatch, added explicit command/boolean stage APIs, split mesh-fabrication CSS into concern files, added architecture boundary spec doc, and added deterministic fixture/golden + layer contract tests.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_i_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_i_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested

## On `make final` without full completion
- If the user asks for `make final` while checklist items are still open, do not use `DONE` naming.
- Rename to regular mode naming (`AI_...`) and keep all checklist items.
