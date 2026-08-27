# Buildings — Balcony Spec

Status: **Implemented (AI 489)**
Scope: The bay balcony feature of the facade/bay building engine (engine 2): placement modes, adjacency-driven side covers, platform/railing/support kit, materials, presets.
Non-goals: Corner-wrap balconies that turn the building corner (the generator is per-face; future extension), custom railing panel meshes, physics/collision.

Implementation:
- Model + normalization + adjacency: `src/app/buildings/BayBalconyModel.js`
- Geometry: `BuildingFabricationGenerator.js` (balcony block after bay capitals)
- GUI: `BuildingFabrication2` bay editor (Balcony section, preset thumbnails)
- Showcases: `modern_residential_2` (projecting + recessed, ref 4), `stone_lowrise_2` (juliet balconets, ref 5)

---

## 1. One feature with modes

Balcony is a **per-bay facade feature** (`bay.balcony`, next to `bay.window` /
`bay.capital` / `bay.depth`), not a set of sibling balcony types. It rides the
bay through the solver, so repeat, group-repeat, face linking and mirroring
apply to it for free. Behavior varies by:

- `placement: 'projecting' | 'recessed'`
  - **projecting**: platform slab + railing kit outside the facade plane, plus
    a support mode.
  - **recessed**: the notch comes from the bay's own recession — the bay
    authors **negative depth** (facade depth sign convention: positive bulges
    outward, negative recesses inward). The balcony contributes the notch
    floor slab, the front railing near the nominal facade plane, and the notch
    ceiling soffit (for floors whose ceiling is not the next balcony's
    platform; the layer top is closed by the existing cap/ring band). The
    window/door and its interior parallax sit on the recessed plane via the
    normal bay-depth path.
- adjacency context (side covers, §3) rather than authored per-type variants.

The **juliet balconet** is a preset of the same feature: tiny depth,
opening-width platform, `grid` infill, front side forced on.

## 2. Config schema (normalized by `normalizeBalconyConfig`)

```js
balcony: {
  enabled: true,
  presetId: 'balcony.modern_glass_projecting' | 'balcony.modern_recessed' | 'balcony.juliet_iron' | null,
  placement: 'projecting' | 'recessed',
  platform: {
    depthMeters: number | null,     // null = auto (projecting 1.4, recessed = notch depth)
    thicknessMeters: 0.03..0.6,     // default 0.16
    widthMode: 'bay' | 'opening',   // whole bay, or one platform per opening repeat slot
    sideMarginMeters: 0..2,         // bay: inset from bay edges; opening: outset past opening
    elevationMeters: -1..1,         // vertical offset from floor level (opening mode: from sill)
    material: { kind: 'match_wall'|'texture'|'color'|'slot', id }
  },
  support: {                        // projecting only
    mode: 'cantilever' | 'corbel_brackets' | 'posts_to_below',
    bracketHeightMeters: 0.08..1.2,
    postSizeMeters: 0.04..0.4,
    material: { kind, id }
  },
  railing: {
    heightMeters: 0.3..1.8,         // default 1.05
    insetMeters: 0..0.5,            // railing footprint inset from platform edge
    infill: 'open' | 'solid_wall' | 'glass_panel' | 'grid',
    colorHex, roughness, metalness, // railing metal (frame/posts/top rail/bars)
    topRail: { enabled, widthMeters, heightMeters },
    posts: { enabled, widthMeters, maxSpacingMeters },
    grid: { pattern: 'vertical_bars'|'horizontal_bars', barWidthMeters, spacingMeters },
    solid: { thicknessMeters, material: { kind, id } },
    glass: { opacity, tintHex }
  },
  sides: { left: 'auto'|'always'|'never', front: ..., right: ... },
  floors: { start: 1, every: 1, end: 0 }   // 1-based floor selection; end 0 = all
}
```

- `presetId` provides the base config; explicit fields deep-merge on top, so
  authored configs stay tiny (`{ enabled: true, presetId: '...' }`).
- Wall-material specs use the **capital dialect** (`{kind, id}`); `slot` refs
  are rewritten by the material-slots pre-pass
  (`resolveBuildingConfigMaterials` walks `platform.material`,
  `support.material`, `railing.solid.material`).
- Railing metal is a direct color/roughness/metalness material (painted
  steel), not a wall material.
- Glass panels use the window-glass material family (`MeshPhysicalMaterial`,
  `depthWrite:false`, polygon offset, `userData.windowGlass`), so transparency
  sorting and geometry merging treat them like window glass.

## 3. Adjacency-driven side covers (`resolveBalconySideCoverage`)

For each side (`left` = lower-u, `front`, `right` = higher-u): the side gets
railing/infill only when it faces **open air**; a side that abuts wall gets
nothing (the wall does the job). Overrides `always`/`never` win.

Rule: a side abuts wall when the same-face neighbor strip's front plane sits
at (or in front of) the balcony's **platform front plane**
(`strip.depth + platformDepth` on the facade depth axis); no strip at the
edge = plain wall at depth 0.

At a face END no wall ever abuts (AI 505): the corner mitre intersects the two
faces' offset lines, so a recessed corner bay cuts the corner mass through and
the adjacent face's wall starts at the recessed mitre point — it never spans
the notch side. A face-end side therefore always faces air and gets its
configured infill.

Consequences (the modes fall out of one rule):
- mid-facade recessed balcony → both sides abut the notch's return walls → no
  side covers;
- recessed balcony at a face end → the corner side faces air (the side street)
  → it carries the side infill; two notches pairing around a corner (the
  ref-4 massing notch) resolve identically — each keeps exactly its
  corner-side cover, railed but open to the other;
- projecting balcony → all sides face air → all covered;
- a projecting balcony beside a deeper proud bay → that side abuts the proud
  wall → no cover there.

## 4. Geometry kit

- **Platform slab**: bay-width (minus `sideMarginMeters`) × `depthMeters`,
  embedded 0.04 m into the wall; top at floor level + `elevationMeters`
  (opening mode: at the opening sill). Soffit is the slab underside.
- **Railing frame** (metal): corner/end posts (skipped at wall-anchored ends)
  + intermediates by `maxSpacingMeters`; top rail cap along each covered side.
- **Infill** per covered side: `glass_panel` (thin panel between posts),
  `solid_wall` (masonry strip, own material), `grid` (vertical bars + bottom
  tie rail, or horizontal bars), `open` (nothing).
- **Supports** (projecting): `cantilever` (clean slab), `corbel_brackets`
  (right-triangle knee braces under the slab, count scales with width),
  `posts_to_below` (front-corner posts dropping to the balcony below when the
  floor below is selected, or to grade on the first floor).
- **Recessed soffit**: notch ceiling panel emitted when the floor above is not
  selected (otherwise the platform above is the ceiling).
- Projecting platform depth counts toward the outward footprint reserve
  (`estimateBalconyOutwardReserveMeters`).
- All parts are per-balcony merged (one mesh per role) and roles are tagged in
  `userData.buildingFab2Role`: `balcony_platform`, `balcony_railing`,
  `balcony_infill_glass`, `balcony_infill_solid`, `balcony_support`.

## 5. Presets

- `balcony.modern_glass_projecting` — projecting 1.5 m cantilever slab, glass
  panels, dark aluminum frame (ref 4 projecting units).
- `balcony.modern_recessed` — recessed, platform fills the notch, glass front
  rail near the nominal plane (ref 4 notch units).
- `balcony.juliet_iron` — projecting 0.12 m shelf, opening-width platform
  (one balconet per opening repeat), wrought-iron vertical-bar grid, front
  forced on (ref 5 balconets on every window).

## 6. Balcony door

`door_balcony_glide` (windows catalog): full-height glazed slider — thin dark
metal frame, double-door glazing, residential parallax interior. Pair with
`heightMode: 'full'` for the floor-to-ceiling glazing the references show.

## 7. Open questions / future extensions

- Corner-wrap balconies turning the building corner (per-face generator today).
- Custom railing panel meshes (`grid.panelMeshId`) and ornamental profiles
  (classical balustrade infill would slot into `railing.infill`).
- Cable/X-pattern grid variants (additional `grid.pattern` values).
- Continuous multi-bay balcony bands sharing one slab (today: one balcony per
  bay; a full-width recessed bay approximates the loggia band).
