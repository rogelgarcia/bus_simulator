# Grass Engine Specification

This document specifies the **Grass Engine** — a lightweight GPU-instanced grass rendering system for terrain surfaces. The engine handles geometry generation, LOD management, and rendering. Grass placement/area configuration is handled separately.

Status: **Proposed (draft)**
Scope: **Rendering engine only** (placement logic out of scope)

---

## 1. Goals

The system MUST:

- Render dense, low-to-ground 3D grass efficiently via GPU instancing
- Support multiple geometry types (blades, cross-billboard, star pattern)
- Implement a 4-tier LOD system based on camera distance and view angle
- Tie grass lifecycle to terrain chunks
- Accept area configuration (density, color) as input from an external system
- Minimize GPU overhead for real-time rendering

The system MUST NOT:

- Handle wind animation (grass is static)
- Determine where grass is placed (that's the placement system's job)
- Render tall foliage or vegetation (only low ground grass)

---

## 2. Geometry Types

Three geometry representations, selectable per LOD tier:

### 2.1 True 3D Blades

- Individual grass blade meshes (1-2 triangles per blade)
- Grouped into tufts (5-15 blades per tuft)
- Highest visual fidelity
- Reserved for Master LOD only

### 2.2 Star Pattern

- Three quads intersecting at 60° angles
- 6 triangles per tuft
- Good 3D appearance from any viewing angle
- Used for Near LOD

### 2.3 Cross-Billboard

- Two quads intersecting at 90°
- 4 triangles per tuft
- Acceptable appearance, very cheap
- Used for Mid and Far LOD

---

## 3. LOD System

### 3.1 LOD Tiers

| Tier | Use Case | Geometry | Density | Activation |
|------|----------|----------|---------|------------|
| **Master** | Close-ups only | True 3D blades | Maximum (50-100 tufts/m²) | Camera very close + special trigger |
| **Near** | Normal gameplay (close) | Star pattern | High (20-30 tufts/m²) | Default close range |
| **Mid** | Normal gameplay (medium) | Cross-billboard | Medium (8-12 tufts/m²) | Medium distance |
| **Far** | Distant | Cross-billboard | Sparse (2-4 tufts/m²) → None | Far distance, fades to ground |

Density values are indicative and configurable per area.

### 3.2 LOD Evaluation

LOD is calculated **per terrain chunk** using two factors:

1. **Distance**: Camera position to chunk center
2. **View Angle**: How parallel the camera is looking at the ground surface

#### View Angle Factor

- **Grazing angle** (looking nearly parallel to ground): Grass is highly visible, requires higher LOD
- **Top-down angle** (looking straight down): Grass less visible, can use lower LOD

The LOD evaluator combines these factors to determine the effective LOD tier per chunk.

### 3.3 LOD Transitions

Transitions between LOD tiers MUST be unnoticeable. Possible techniques (to be determined during implementation):

- Opacity fade between LODs
- Distance hysteresis (different thresholds for switching in vs out)
- Dithered/screen-door fade
- Scale-based grow/shrink

### 3.4 Master LOD Activation

The Master LOD is expensive and only activates when:

- Camera is within a close distance threshold, AND
- View angle is at grazing level (not top-down)

This prevents the Master LOD from rendering during normal gameplay when the camera is behind the bus.

---

## 4. Instance Data

Each grass tuft instance contains:

- **Position**: World-space XYZ
- **Rotation**: Y-axis rotation (random or terrain-aligned)
- **Scale**: Per-instance scale variation
- **Color tint**: Per-instance color variation (within area palette)

Instance data is generated per chunk and stored in GPU buffers for instanced rendering.

---

## 5. Grass Areas (Input Interface)

The grass engine receives area configuration as input. Areas define regional grass properties:

### 5.1 Area Properties

- **Density**: Base tufts per m² (scaled per LOD tier)
- **Color palette**: Base color + variation range (hue, saturation, brightness shifts)
- **Height range**: Min/max tuft height (for scale variation)
- **Type** (future): Different grass mesh types per area

### 5.2 Area Application

- Areas are defined externally (painted zones, terrain material mapping, procedural rules, etc.)
- The grass engine queries area configuration when generating instances for a chunk
- Multiple areas may influence a single chunk (blending at boundaries)

---

## 6. Terrain Integration

### 6.1 Chunk Binding

- Grass is tied to terrain chunk lifecycle
- When a terrain chunk loads, grass instances are generated for that chunk
- When a terrain chunk unloads, associated grass is disposed

### 6.2 Chunk Interface

The terrain chunk provides:

- Chunk bounds (for instance generation area)
- Surface height sampling (for placing grass on terrain)
- Surface normal sampling (optional, for grass orientation)
- Area configuration query (which grass areas apply to this chunk)

---

## 7. Culling

### 7.1 Frustum Culling

- Grass is culled per chunk based on camera frustum
- Chunks outside the view frustum are not rendered

### 7.2 Distance Culling

- Hard cutoff distance beyond which no grass renders
- Configurable per quality setting

### 7.3 Behind-Camera Culling

- Chunks behind the camera are not rendered (implied by frustum culling)

---

## 8. Rendering

### 8.1 GPU Instancing

- Single draw call per LOD tier per chunk (or batched across chunks)
- Instance buffer contains per-tuft transforms and colors
- Geometry buffer contains the shared mesh (blade, star, or cross)

### 8.2 Ground Texture Interaction

- The ground texture does heavy lifting at distance
- Sparse grass geometry at Far LOD blends with ground texture
- At the Far LOD cutoff, grass fades to ground-only rendering

---

## 9. Component Architecture

| Component | Responsibility |
|-----------|----------------|
| **Geometry Definitions** | Mesh data for blade, cross-billboard, star patterns |
| **Grass Area Config** | Density, color, variation settings per zone (input from external system) |
| **Instance Generator** | Produces instance data from terrain surface + area config |
| **LOD Evaluator** | Per-chunk LOD determination from camera angle + distance |
| **Transition Handler** | Smooth/unnoticeable LOD changes |
| **Chunk Manager** | Binds grass to terrain chunk lifecycle |
| **Renderer** | GPU instanced draw calls |

---

## 10. Configuration Parameters

### 10.1 Global Settings

- LOD distance thresholds (Near/Mid/Far boundaries)
- LOD angle thresholds (grazing/medium/top-down boundaries)
- Master LOD activation distance
- Far LOD cutoff distance
- Transition fade duration/style

### 10.2 Per-Area Settings

- Density multiplier
- Color palette (base + variation)
- Height range
- Grass type (future)

### 10.3 Quality Presets

Different quality levels may adjust:

- Density multipliers across all LOD tiers
- LOD distance thresholds
- Whether Master LOD is enabled at all
- Far cutoff distance

---

## 11. Out of Scope

The following are explicitly not part of the grass engine:

- **Wind animation**: Grass is static
- **Tall foliage/vegetation**: Only low ground grass
- **Placement logic**: Where grass appears is determined by external systems
- **Seasonal variation**: No autumn/winter grass states
- **Interactive grass**: No player/vehicle interaction deformation
- **Shadow casting**: Grass does not cast shadows (performance)

---

## 12. Open Questions

1. **Transition style**: Which fade technique works best (opacity, dithering, scale)?
2. **Area blending**: How to handle grass at area boundaries (hard edge vs gradient)?
3. **LOD formula**: Exact weighting between distance and angle factors?
4. **Chunk granularity**: Should grass use terrain chunks directly, or subdivide further?
5. **Memory budget**: Maximum instance count per chunk at each LOD tier?
