# Mesh Fabrication Live Mesh Handoff (Sections 4 + 5 + 9)

## Purpose

Define the handoff contract between AI mesh generation output and the mesh fabrication viewer for live reload, including derived-topology semantic authoring rules.

## Folder + File Contract

- Handoff folder: `assets/public/mesh_fabrication/handoff/`
- Canonical handoff file (current): `assets/public/mesh_fabrication/handoff/mesh.live.v1.json`

AI writers must update this file atomically (write temp file + rename) to avoid partial reads.

## Root Contract (V2)

JSON root:

```json
{
  "format": "mesh-fabrication-handoff.v2",
  "meshId": "string",
  "revision": "string|number",
  "topology": {
    "version": "string",
    "idLifecycle": {
      "nonTopologyChangePreserveIds": true,
      "topologyChangePolicy": "preserve_unaffected_create_new_never_recycle"
    }
  },
  "materials": {
    "material_id": {
      "color": "#RRGGBB|number",
      "roughness": 0.0,
      "metalness": 0.0
    }
  },
  "authoring": {},
  "ai": {
    "booleanKernel": "manifold-3d"
  },
  "compiled": {},
  "objects": []
}
```

Rules:
- `format` must be exactly `mesh-fabrication-handoff.v2`.
- Canonical topology is polygon-based (`faces` can be triangles, quads, or n-gons).
- ID lifecycle policy is explicit in `topology.idLifecycle`.
- Viewer rejects invalid documents (missing refs, bad indices, non-finite numbers).
- Runtime boolean kernel selection is explicit in `ai.booleanKernel` (default and only allowed runtime value: `manifold-3d`).

Runtime source resolution (in order):
1. `compiled` layer (if present)
2. compiled output derived from `authoring` layer (if `compiled` is missing)
3. legacy explicit `objects` layer (compatibility path)

## Section 9: Dual-Layer Derived Topology Model

### 1) Semantic Authoring Layer (`authoring`)

Version: `mesh-semantic-authoring.v1`

```json
{
  "authoring": {
    "version": "mesh-semantic-authoring.v1",
    "components": [
      {
        "path": "part.box.main",
        "material": "mat_box",
        "primitive": {
          "type": "box",
          "size": [2, 1, 2],
          "faceAliases": {
            "top": "roof"
          }
        },
        "operations": [
          {
            "opId": "ext001",
            "type": "extrude_face",
            "targetFace": "top",
            "distance": 0.4
          }
        ],
        "transform": {
          "position": [0, 0, 0],
          "rotation": [0, 0, 0],
          "scale": [1, 1, 1]
        }
      }
    ],
    "operations": [
      {
        "opId": "sub001",
        "type": "boolean_subtract",
        "targetObjectId": "part.box.main",
        "toolObjectId": "part.cutter.main",
        "subtractMode": "subtract_through",
        "outputPolicy": "replace_target"
      }
    ]
  }
}
```

Authoring rules:
- Components are semantic and compact; they do not need verbose per-element topology declarations.
- `authoring.operations` (optional) supports document-level boolean operations applied after component compilation:
  - `boolean_union`, `boolean_subtract`, `boolean_intersect`
  - `targetObjectId` + `toolObjectId` reference component/object paths
  - `boolean_subtract` modes: `subtract_through`, `subtract_clamped`
  - output policy: `replace_target` (default) or `new_object`
- Runtime boolean kernel contract:
  - location: `ai.booleanKernel`
  - default: `manifold-3d`
  - allowed values in this pass: `manifold-3d` only
  - fallback policy: none (kernel failures are explicit operation errors)
- `primitive.type = box` seeds deterministic stable face names:
  - `front`, `back`, `left`, `right`, `top`, `bottom`
- `primitive.type = cylinder` seeds deterministic stable topology names:
  - cap faces: `top`, `bottom`
  - side canonical labels: `side.s000..sNNN` when `vSegments=1`, or `side.vNNN.sNNN` when `vSegments>1`
  - vertex IDs: `...vertex.uNNN.vMMM`
  - edge IDs: `...edge.uNNN.vMMM.to.uNNN.vMMM`
- `cylinder` supported semantic parameters:
  - `radius` (uniform shortcut) or `radiusTop` + `radiusBottom`
  - `height`
  - `uSegments` (integer `3..256`) and `vSegments` (integer `1..128`)
  - aliases: `radialSegments -> uSegments`, `axialSegments -> vSegments`
  - seam alias: `seamAngle -> uSeam`
  - capped extension: `capRings`, `syncOppositeCap`, optional `topCapRings` + `bottomCapRings`
- `primitive.type = tube` seeds deterministic stable topology names:
  - outer side canonical labels: `outer.s000..sNNN` when `vSegments=1`, or `outer.vNNN.sNNN` when `vSegments>1`
  - inner side canonical labels: `inner.s000..sNNN` when `vSegments=1`, or `inner.vNNN.sNNN` when `vSegments>1`
  - annulus canonical labels: `top_ring.s000..sNNN`, `bottom_ring.s000..sNNN`
  - vertex IDs: `...vertex.outer.uNNN.vMMM` and `...vertex.inner.uNNN.vMMM`
  - edge IDs: deterministic outer/inner grid edges plus bridge edges (`...edge.top_ring.uNNN.bridge`, `...edge.bottom_ring.uNNN.bridge`)
- `tube` supported semantic parameters:
  - per-side radii: `outerRadiusTop` + `outerRadiusBottom`, `innerRadiusTop` + `innerRadiusBottom`
  - uniform shortcuts: `outerRadius`, `innerRadius` (deterministically expanded to per-side radii before topology generation)
  - `height`
  - `uSegments` (integer `3..256`) and `vSegments` (integer `1..128`)
  - aliases: `radialSegments -> uSegments`, `axialSegments -> vSegments`
  - seam alias: `seamAngle -> uSeam`
  - validation: all radii must be positive and `innerRadiusTop < outerRadiusTop` + `innerRadiusBottom < outerRadiusBottom`
- Section 14 parametric-grid core contract:
  - contract version: `mesh-parametric-grid.v1`
  - index axes: `u` (circumference), `v` (top->bottom)
  - first-class controls: `uSegments`, `vSegments`, `uClosed`, `vClosed`, `uSeam`
  - deterministic index space for cylinder: `u_ccw_from_seam__v_top_to_bottom`
  - deterministic canonical ID derivation policy: `uv_index_path`
  - retessellation policy: `preserve_unaffected_create_new_never_recycle`
- Family adapters:
  - executable in this pass: `cylinder`, `tube`
  - declared (non-executable in this pass): `revolve`, `sweep`
- Cylinder tessellation layout rules:
  - side topology is generated as a deterministic `u x v` quad grid (`face.uNNN.vMMM` IDs).
  - `vSegments > 1` subdivides the side into deterministic axial bands.
  - cap tessellation uses deterministic concentric ring bands via `capRings`, preserving mirrored `u` partitioning when `syncOppositeCap = true`.
  - final top/bottom seed faces remain addressable as canonical `top` and `bottom` labels.
- Face-name overrides (authoring aliases) are supported:
  - location: `primitive.faceAliases` (or component-level `faceAliases`)
  - mapping shape: `{ "<canonicalFaceName>": "<authoredFaceName>" }`
  - canonical IDs remain unchanged; aliases only change authored face labels/targeting.
  - operations like `extrude_face.targetFace` may address either canonical face names or authored aliases.
- Pivot convention (rule of thumb): generated components should use a bottom-centered local pivot at `0,0,0`.
  - For `box`, when `primitive.center` is omitted, compiler default is `[0, sizeY * 0.5, 0]` so the bottom sits on `Y=0`.
  - For `cylinder`, when `primitive.center` is omitted, compiler default is `[0, height * 0.5, 0]` so the bottom cap sits on `Y=0`.
  - For `tube`, when `primitive.center` is omitted, compiler default is `[0, height * 0.5, 0]` so the bottom ring sits on `Y=0`.
  - Default component transform position is `[0,0,0]` unless explicitly authored.
- Operations must include stable `opId` values and are applied in-order.
- Topology IDs generated by operations derive from component path + operation lineage.
- Current boolean pass constraint: target/tool transforms must match (same position/rotation/scale) for deterministic execution.
- Boolean naming/remap rules for runtime outputs:
  - unchanged target faces keep original IDs when their reconstructed vertex-ring signature is unchanged.
  - new/split target faces use `...face.bool.<opId>.target.<seed>[.fNNN]`.
  - subtraction faces derived from cutter lineage use `...face.bool.<opId>.<toolFaceTag>[.fNNN]` (for example `part.tire.outer.face.bool.sub001.inner.s005`).
  - if one source cutter face produces multiple output fragments, deterministic suffixes apply (`.f000`, `.f001`, ...).
  - runtime polygon ordering for fragment suffixing uses deterministic provenance/coplanarity/connectivity ordering so same inputs produce same IDs.
  - deterministic fallback-merge pass attempts to merge eligible adjacent fallback triangle pairs into convex quads before suffix assignment.
  - manifold adapter carries per-triangle provenance (`sourceRole`, `sourceObjectId`, `sourceFaceId`) into operation-log metadata.
  - compiled-v1 single-ring policy remains explicit: openings are represented as deterministic face splits (no inner-loop face records yet).

Tire-style modeling example without boolean subtraction:

```json
{
  "path": "part.tire.main",
  "material": "mat_tire",
  "primitive": {
    "type": "tube",
    "outerRadius": 1.0,
    "innerRadius": 0.55,
    "height": 0.42,
    "radialSegments": 48,
    "axialSegments": 2
  },
  "transform": {
    "position": [0, 0, 0],
    "rotation": [0, 0, 0],
    "scale": [1, 1, 1]
  }
}
```

### 2) Compiled Topology Layer (`compiled`)

Version: `mesh-fabrication-compiled.v1`

```json
{
  "compiled": {
    "version": "mesh-fabrication-compiled.v1",
    "idPolicy": {
      "topologyChangePolicy": "preserve_unaffected_create_new_never_recycle",
      "extrusionCapIdentity": "always_new_derived_cap_id",
      "ambiguousLoopFallback": "ring_ordinal",
      "parametricGridContract": "mesh-parametric-grid.v1",
      "parametricCanonicalDerivation": "uv_index_path",
      "parametricIndexSpace": "u_ccw_from_seam__v_top_to_bottom",
      "retessellationPolicy": "preserve_unaffected_create_new_never_recycle"
    },
    "objects": [
      {
        "objectId": "part.box.main",
        "material": "mat_box",
        "vertexIds": ["..."],
        "vertices": [[x, y, z], "..."],
        "edgeIds": ["..."],
        "edges": [[vIndexA, vIndexB], "..."],
        "faceIds": ["..."],
        "faces": [[vIndex0, vIndex1, vIndex2, "..."], "..."],
        "faceEdgeIndices": [[eIndex0, eIndex1, eIndex2, "..."], "..."],
        "parametric": {
          "contractVersion": "mesh-parametric-grid.v1",
          "family": "cylinder",
          "grid": { "uSegments": 24, "vSegments": 1, "uClosed": true, "vClosed": false, "uSeam": 0 }
        },
        "transform": {
          "position": [x, y, z],
          "rotation": [rx, ry, rz],
          "scale": [sx, sy, sz]
        }
      }
    ]
  }
}
```

Compiled rules:
- Runtime viewport/rendering executes only on compiled topology data.
- Compiled storage uses array/index tables + ID arrays for compactness and deterministic parsing.
- IDs must be hierarchical and stable for vertices, edges, faces, and derived triangles.
- Non-topology edits preserve all IDs.
- Topology edits preserve unaffected IDs, generate deterministic new IDs for created elements, and never recycle removed IDs.
- Ambiguous polygon-loop naming fallback is locked to ring ordinals (`ring_ordinal`).
- Extrusion cap identity policy is locked to `always_new_derived_cap_id`.
- After runtime boolean execution, topology artifacts are rebuilt from output topology:
  - `vertexIds`, `edgeIds`, `faceIds`
  - `faceEdgeIndices`
  - triangulated render topology and `face -> triangle[]` traceability map
  - topology index records used by hover/context-menu resolution
  - operation-log metadata records kernel marker + provenance/regrouping summaries for traceability

## Section 15: Dual-Mesh Display Contract (Canonical Cage + Derived Display Mesh)

Display-render contract:
- Canonical compiled topology remains authoritative for IDs and addressing (`vertex` / `edge` / `face`).
- Viewer builds a derived display mesh from canonical topology for visualization controls; this derived mesh is non-authoritative.
- Viewer keeps a canonical control-cage mesh and a derived display mesh in runtime; only the derived display mesh is shown by default.

Display controls:
- `smoothingMode`: `flat` | `smooth_normals` | `subdivision_preview`
- `subdivisionLevel`: `0..2` (display-only)
- `adaptiveSubdivisionEnabled`: `true|false` (display-only)
- `adaptiveErrorBudgetPx`: positive number (smaller values increase derived display density)
- `wireSource`: `canonical` | `display` (default `canonical`)
- `lodPolicy`: `near` | `medium` | `far`

LOD triangle budgets (derived display mesh):
- `near`: `220000`
- `medium`: `140000`
- `far`: `80000`

Deterministic mapping + picking rules:
- Every derived display triangle carries deterministic `triangle -> canonical faceId` mapping.
- Hover/picking/context-menu resolution remains canonical even when derived display subdivision is enabled.
- `wireSource = canonical` uses canonical edge IDs.
- `wireSource = display` uses derived display wire segments mapped deterministically back to canonical face IDs.

Export policy:
- Canonical export is default (`meshKind = canonical`).
- Derived display export is optional and non-default (`meshKind = display`).

## Legacy Explicit Objects Layer (`objects`)

Legacy explicit topology payload remains supported for compatibility:

```json
{
  "objects": [
    {
      "id": "hierarchical.part.subpart",
      "material": "material_id",
      "vertices": [{ "id": "hierarchical.vertex.id", "position": [x, y, z] }],
      "edges": [{ "id": "hierarchical.edge.id", "vertexIds": ["vertex_id_a", "vertex_id_b"] }],
      "faces": [{ "id": "hierarchical.face.id", "vertexIds": ["..."], "edgeIds": ["..."] }],
      "transform": { "position": [x, y, z], "rotation": [rx, ry, rz], "scale": [sx, sy, sz] }
    }
  ]
}
```

Viewer triangulates polygon faces for GPU rendering (fan triangulation per face) and preserves face-to-triangle mapping for traceability.

## Live Loading Contract

- Viewer bootstraps from bundled handoff file on startup so a mesh is visible immediately:
  - `assets/public/mesh_fabrication/handoff/mesh.live.v1.json`
- Viewer polls every `1000 ms`.
- Viewer endpoint:
  - Default: `<origin>/api/mesh/current`
  - Optional override query param: `?meshEndpoint=<absolute-url>`
    - Example override: `?meshEndpoint=http://localhost:8765/api/mesh/current`
- Viewer request validators:
  - `If-None-Match` (from last `ETag`)
  - `If-Modified-Since` (from last `Last-Modified`)

## Endpoint Contract

- `GET /api/mesh/current`
  - `200 OK` + mesh payload if changed.
  - `304 Not Modified` when validators match.
- Required response headers:
  - `ETag`
  - `Last-Modified`
  - `Cache-Control: no-cache, no-store, must-revalidate`

## Section 16 Rollout Notes (Boolean Engine Migration)

- Authoritative runtime kernel is `manifold-3d`; local custom boolean logic remains disconnected from runtime paths.
- Boolean operation failures are hard failures with no fallback and must be surfaced in UI + operation log.
- Rollout threshold: any boolean command error in the active preview/apply window blocks acceptance.
- Rollback threshold: manifold adapter/kernel errors abort the operation immediately; runtime never reroutes to local custom kernel.
- Runtime operation log markers:
  - success: `boolean_kernel_applied`
  - failure: `boolean_kernel_error`, `no_fallback`

## Reference Server

- Tool: `tools/mesh_fabrication_live_server/run.py`
- Serves:
  - static files from repo root (so mesh screen can be opened directly from same host)
  - API route `/api/mesh/current` with conditional response support
