# Problem

Building Fabrication 2 already supports a roof layer between floor layers, floors above that roof, and an upper mass that acts as a keep-out on the exposed lower roof. However, this capability is awkward to author in the editor, intermediate and terminal roofs are not clearly distinguished, and the roof-prop system is limited to mechanical equipment. A set-back penthouse such as Terra & Mar therefore cannot be authored, understood, and populated as a deliberate rooftop terrace through a complete editor workflow.

# Request

Make intermediate rooftop terraces a first-class Building Fabrication 2 authoring concept and extend the unified roof-prop system with deterministic amenity and landscape population. Build on the existing intermediate-roof and upper-mass keep-out behavior from AI492/AI520; do not replace it with a second roof system or reimplement capability that already exists.

Tasks:
- Audit the implemented AI492/AI520 behavior and the canonical building, roof, editor, and serialization specifications before changing the model. Preserve existing configurations and terminal-roof behavior.
- Let an author insert a floor or roof directly above or below the selected layer, including an explicit workflow for adding one or more floors above a rooftop. Avoid making authors append layers and repeatedly move them into place.
- Clearly label intermediate rooftop layers and terminal roofs in the layer list and inspector. Preview their relationship to the floor groups below and above, and report invalid or ambiguous ordering without silently reordering valid arbitrary floor/roof sequences.
- Preserve arbitrary valid floor/roof ordering, stable layer identities, selections, and all new settings through edit, duplicate, import, export, save, reload, and catalog round trips.
- Define the exposed terrace surface from the lower roof footprint minus the actual projected footprint of every upper building mass, rather than from a coarse bounding box. Define the usable population region by additionally excluding upper-mass attachment envelopes, guarded-edge setbacks, configured circulation buffers, and author-defined keep-outs.
- Make the exposed, excluded, and usable regions inspectable in the editor so authors can understand why an object may or may not be placed.
- Provide intermediate-roof controls for roof finish, edge ring or parapet, and transparent guards. Support the relevant outer terrace boundary and upper-mass boundary conditions without producing duplicate, missing, intersecting, or free-floating guard segments.
- Extend the existing unified roof-prop model instead of creating a separate terrace-decoration subsystem. Add deterministic amenity and landscape choices for planters, small rooftop trees, dining groups, lounge seating, and pergolas or trellises while retaining existing mechanical roof props.
- Support both explicit placements and deterministic zone-based population. Give authors control over eligible zones, density or counts, orientation, spacing, and seed while keeping the same configuration visually stable across reloads and machines.
- Keep all roof props out of upper masses and their attachments, parapets and guards, edge setbacks, circulation routes, explicit exclusion zones, and one another. Invalid explicit placements must be visible and actionable in the editor rather than silently producing intersecting geometry.
- Ensure generated terrace surfaces, guards, amenities, landscaping, and existing mechanical props use the configured materials, cast and receive appropriate shadows, and remain correctly aligned on translated, rotated, or set-back floor silhouettes.
- Update the canonical Building Fabrication 2 schemas and specifications for layer insertion, intermediate-roof semantics, exposed and usable regions, guard controls, amenity prop types, zones, explicit placements, validation, and backward compatibility. Update any affected building-specific specification when the showcase configuration changes.
- Add focused unit, core, editor/UI, serialization round-trip, and generator tests. Cover multiple floor groups above and below roofs, terminal roofs, translated and non-rectangular upper silhouettes, attachment and circulation keep-outs, deterministic regeneration, explicit placements, guard boundaries, and legacy roof configurations. Retain regression coverage for the existing AI492/AI520 behavior.
- Use Terra & Mar as the deterministic end-to-end showcase: author its set-back penthouse as a separate floor layer above an intermediate roof and populate the exposed terrace around it with restrained landscaping, dining, lounge, and pergola elements matching the reference intent.
- Capture final UHD 4K evidence in an HDRI-backed showcase with the HDRI used for both the visible background and lighting/reflections. Include at least straight-on front, three-quarter, low-angle base-to-top, and terrace-focused views, together with the source references used for comparison. Save all generated evidence under `tests/artifacts/screens/ai538-bf2-intermediate-roof-terrace-authoring-and-amenity-population/`; do not place or commit generated captures beside source files or under `screens/`.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to `prompts/AI_DONE_buildings_538_BUILDINGS_bf2_intermediate_roof_terrace_authoring_and_amenity_population_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change
