# Grass Engine Specification (Low-Cut, Auto-LOD, Authoring)

Status: Proposed (merged v2)  
Scope: Rendering engine + authoring contract for low-cut gameplay grass (`< 0.10 m`).

## 1. Goals

The system MUST:

- Render believable low-cut 3D grass while staying lightweight for a bus sim
- Support GPU-instanced rendering with chunk-tied lifecycle
- Use automatic LOD from distance and camera angle (with stable transitions)
- Expose high-level design controls (`bend`, `inclination`, `humidity`) for runtime
- Support tuft-based geometry near camera and billboard/cluster representations at distance
- Fade naturally from geometry to ground texture with no hard cutoff

## 2. Terminology

- Blade: Single grass leaf geometry.
- Tuft: Bundle of blades treated as one instance.
- Cluster billboard: One card representing multiple distant tufts.
- LOD ring: Distance band around camera using one representation tier.
- Auto LOD: Runtime tier selection from distance + angle + hysteresis.
- Humidity: High-level wetness control affecting color/material response.

## 3. Scope and Non-Goals

In scope:

- Geometry definitions and per-tier runtime rendering behavior
- LOD evaluation, transitions, and culling
- Per-area grass input model
- Debugger requirements for iteration
- Inspector export contract for high-level runtime controls

Out of scope:

- Tall vegetation/foliage
- Player/vehicle interaction deformation
- Seasonal simulation
- Wind simulation (v1)
- Grass shadow casting (v1)

## 4. System Architecture

| Component | Responsibility |
|---|---|
| Geometry Definitions | Shared blade/tuft/card geometries per tier |
| Grass Area Config | Density, color, height, LOD allowances per area |
| Instance Generator | Builds per-patch instance transforms/colors |
| LOD Evaluator | Tier selection from distance + angle + policy |
| Transition Handler | Hysteresis + fade/dither transitions |
| Chunk/Patch Manager | Binds grass creation/disposal to terrain lifecycle |
| Renderer | GPU-instanced draw calls and material/shader policy |
| Debugger | Presets, overlays, and iteration controls |

## 5. Authoring and Runtime Controls

### 5.1 Two-level controls

Tooling MUST separate:

- Low-level high-res mesh controls: curvature arc, segment distribution, cavity/profile shaping, etc.
- High-level runtime controls: bend, inclination, humidity, density, scale variation.

### 5.2 Export contract

Inspector output MUST be a versioned runtime profile.

```json
{
  "profileId": "grass.lowcut.default",
  "version": 1,
  "heightMeters": 0.065,
  "tuft": { "bladesPerTuft": 6, "radiusMeters": 0.028, "spread": 0.55 },
  "shape": { "bend": 0.45, "inclination": 0.3, "curvature": 0.5 },
  "appearance": {
    "baseColor": "#3A8E45",
    "humidity": 0.35,
    "variation": { "hueDeg": 6, "satMul": 0.08, "valueMul": 0.1 }
  },
  "lodBias": { "distanceMul": 1.0, "densityMul": 1.0 }
}
```

### 5.3 Humidity mapping

`humidity` `[0..1]` MUST be clamped and mapped deterministically:

- Dry (`0`): slightly brighter/desaturated, higher roughness, lower specular
- Wet (`1`): slightly darker/richer, lower roughness, stronger specular

## 6. Geometry and LOD Tiers

### 6.1 Source and derived meshes

- High-res blade/tuft mesh is authoring source only.
- Runtime meshes MUST be prederived (offline/precompute), not runtime decimation.
- Derived meshes MUST preserve silhouette and bend direction.

### 6.2 Tier definitions

| Tier | Alias | Representation | Intended use |
|---|---|---|---|
| LOD0 | master | Simplified true-geometry tuft | Very near / close inspection |
| LOD1 | near | Lower-poly tuft or star/cross hybrid | Primary near gameplay |
| LOD2 | mid | Sparse cross cards / mini clusters | Mid distance |
| LOD3 | far | Billboard clusters | Far distance |
| LOD4 | ground-only | No grass geometry | Texture-only beyond cutoff |

### 6.3 Single-sided optimization

- Single-sided blades/cards SHOULD be supported.
- Backface rendering MAY be disabled for LOD0/LOD1 when visual checks pass.
- Visible-face orientation bias toward camera must be clamped.

## 7. Grass Areas (Input Interface)

Grass engine receives area config from external systems.

Per-area properties:

- `density` (base tufts/m²)
- `color` (base + variation range)
- `height` range
- `lod` allow/force controls
- `profileId` (runtime-authoring profile)

Area application:

- Areas are external (painted/procedural/material-driven)
- Engine queries area config per patch/chunk
- Boundary blending policy is configurable

## 8. Terrain Integration

### 8.1 Lifecycle binding

- Grass data is tied to terrain chunk/patch lifecycle.
- On load: generate/upload instances.
- On unload: dispose buffers/resources.

### 8.2 Required terrain interface

- Bounds for generation domain
- Height sampling
- Optional normal sampling
- Area query hooks

## 9. LOD Evaluation Policy

### 9.1 Inputs

LOD selection MUST use:

- Ground-projected distance to patch center
- Camera elevation angle relative to ground
- Profile bias (`distanceMul`, `densityMul`)

### 9.2 Effective distance

Use angle-scaled distance:

`effectiveDistance = distanceMeters / angleScale`

Where:

- Grazing views increase detail range
- Top-down views reduce detail range
- `angleScale` is clamped

### 9.3 Master activation

Master tier activates only when:

- Distance is within close threshold
- Camera angle is sufficiently grazing

### 9.4 Stability

LOD switching MUST include:

- Enter/exit hysteresis (minimum 10% threshold gap)
- Per-patch cooldown (minimum 120 ms)
- Stable dither/noise to avoid visible ring lines

### 9.5 Coverage compensation

- Near tiers MAY slightly increase density for low camera heights
- Far tiers MUST reduce density aggressively before fade-out
- Compensation MUST be clamped

## 10. Culling

- Frustum culling at patch/chunk granularity
- Distance cutoff culling beyond far ring
- Behind-camera behavior naturally covered by frustum culling

## 11. Rendering and Transitions

### 11.1 Instancing

- Instanced draw per tier (batched where possible)
- Shared geometry per tier + per-instance data buffers

### 11.2 Fade to texture

Far transition MUST be smooth:

- Reduce geometric density first
- Apply dither/alpha transition second
- Hand off to ground texture coverage at cutoff

### 11.3 Billboard orientation

Billboards/clusters MUST support inward/camera-biased orientation:

- Partial yaw toward camera (not full billboard lock)
- Inward pitch bias to keep readability from top views
- Rotation clamps to avoid flips/artifacts

## 12. Performance and Quality Presets

Initial default targets (1080p gameplay camera):

- Grass GPU: `<= 1.5 ms` average
- Grass CPU update: `<= 0.6 ms` average
- Grass draw calls: `<= 12`
- Triangle pressure reduced aggressively in far tiers

Quality presets MAY adjust:

- Distance thresholds
- Density multipliers by tier
- Master tier enable/disable
- Far cutoff distance

## 13. Grass Debugger Requirements

Grass Debugger MUST be auto-LOD-first:

- Auto LOD enabled by default
- Manual force-tier remains debug-only

Required camera height presets:

- `0.5 m`, `1.0 m`, `1.5 m`, `2.0 m`, `3.0 m`, `5.0 m`

Each height MUST include angle presets:

- Grazing
- Medium
- Top-down

Required lighting presets:

- Noon clear
- Overcast soft
- Golden hour warm
- Night street-lit

Required overlays:

- Active tier/ring
- Instance counts by tier
- Estimated triangles by tier
- Draw calls
- Camera angle factor and effective distance

## 14. Integration Points

Primary integration modules:

- `src/graphics/engine3d/grass/GrassEngine.js`
- `src/graphics/engine3d/grass/GrassLodEvaluator.js`
- `src/graphics/engine3d/grass/GrassConfig.js`
- `src/graphics/gui/grass_debugger/view/GrassDebuggerView.js`
- `src/graphics/gui/grass_debugger/view/GrassDebuggerUI.js`

Compatibility with terrain debugger grass controls SHOULD be preserved.

## 15. Acceptance Criteria

A change is accepted when all are true:

- No obvious LOD popping during forward bus motion
- Near/top-down views maintain readable low-cut grass volume
- Far transition blends to texture without hard lines
- Default quality meets performance budgets in representative city scenes
- Debugger presets reproduce results consistently

## 16. Implementation Phasing

Recommended order:

1. Auto LOD core (distance + angle + hysteresis)
2. Ring defaults + fade-to-texture behavior
3. Tuft/cluster upgrades + billboard orientation rules
4. High-level profile export from inspector
5. Debugger presets + overlays + profiling pass

## 17. Open Questions

- Final numeric thresholds for each quality preset
- Preferred dither/fade function with least shimmer
- Whether single-sided mode is acceptable for all LOD0 paths
- Boundary blending policy between grass areas
