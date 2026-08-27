# DONE

# Problem

The entry portal still does not read right (user review of the AI 509 pass on
`bradbury_block`, vs `downloads/buildings_references/2.png` / `3.png`):

1. **Everything reruns the wall texture.** The archivolt bands, colonettes and
   frieze all default to (or are authored in) the same sandstone as the wall
   behind them, so the assembly reads as texture-on-texture mush instead of a
   composed stone/terracotta/joinery hierarchy. The zone material dialect
   allows overrides, but the parts were designed as wall-material decorations
   and there is no notion of a portal-level material set.
2. **The details are not right.** The portal is assembled from independent
   ad-hoc emitters (an `arched_band` window header + `portal.colonettes` +
   `portal.frieze` + steps), each placed by its own offsets. They do not
   compose into portal anatomy: orders do not turn down the jambs (the
   archivolt dies onto plain wall, the colonettes are separate sticks), the
   frieze is a floating plank, nothing lines through, and richer parts
   (keystones, carved spandrels, finials) have no home at all.

Small defects from the same review (user-annotated screenshot, 2026-08-26,
right springing of the bradbury entry arch):

- The nested rings' springing terminations stand as naked stepped cut faces —
  a wedge-shaped block juts out of the wall where the three ring ends at
  three depths stop on the springing line, floating above the colonette
  capital. Classically the orders land ON an impost/springer block (or die
  into their jamb legs); bare stepped end faces read as broken stone.
- A vertical line of z-fighting speckles runs up the wall beside the right
  arch shoulder. It predates AI 509 (visible in the before captures), so it
  is not the band depth fix regressing — find the coplanar surfaces at the
  entry bay boundary and separate them.
- The rings extrude with their back faces exactly on the wall plane, so ring
  silhouettes can sparkle against the wall at grazing angles — order backs
  must embed into the wall (>= 2cm) like the AI 503 bands do.

Doors and windows solved this class of problem with a dedicated fabrication
framework (catalog defs + layered settings + per-part materials in
`WindowMeshGenerator`). Portals deserve the same.

# Request

A dedicated **portal fabrication framework**, parallel to the window/door one
(ONE feature with layered parts — not more sibling emitters):

- **Portal defs in a catalog** (`PortalFabricationCatalog` beside
  `WindowFabricationCatalog`), referenced from an opening as `portal.defId`
  (building-level `portalDefinitions.items` overrides, like
  `windowDefinitions`). A portal def WRAPS a door: the door def stays a
  window-mesh asset mounted at the portal's innermost plane; the portal owns
  everything around it (recess, orders, surround, steps).
- **Composable arch orders**: N nested orders, each with its own radial
  height, depth step, profile (flat band | roll | cavetto is enough to start)
  and material. An order is a REAL order: its arch turns down the jambs to
  the base as one continuous run (arch + jamb legs), so orders read as nested
  frames around the opening, not as an arc floating over plain wall. Where an
  order does NOT continue down the jamb, it must terminate ON an
  impost/springer block part — never as a naked stepped cut face (the
  annotated wedge defect above).
- **Insets in the wall**: an order (or the whole portal) may be carved INTO
  the wall as a stepped inset instead of standing proud — extend the stepped
  reveal machinery (AI 507 shell rule, AI 509 `revealMaterialIndex`) so the
  wall cut itself steps: outer rect/arch to depth1, inner to depth2, ... with
  per-step materials. Proud and carved orders can mix.
- **Custom meshes**: a portal layer may reference a registered
  procedural/custom mesh part (keystone, carved spandrel panel, finial) with
  its own material and anchor (crown / springing left+right / jamb base), so
  richer sculpted parts have a home without new engine emitters each time.
  A test ornament exists: `assets/ornaments/foliate_capital.glb` (stylized
  Corinthian capital — bell, two acanthus rows, corner scroll volutes,
  abacus rosettes; 13.3k tris, 0.57x0.52x0.57m, origin at base center,
  Y-up; verified loading through the engine's GLTFLoader). Regenerate with
  `blender -b -P tools/ornaments/generate_foliate_capital_blender.py`
  (editable source `assets/ornaments/foliate_capital.blend`); load it the
  way the bus models do (`new URL('../../assets/...', import.meta.url)` +
  GLTFLoader, cached template + cloned materials).
- **Portal material set**: named part materials (order N, colonettes, frieze,
  recess, steps, custom parts) in the wall-material dialect with
  `slot:<name>` support, resolved in the AI 491 pre-pass. Parts must NOT
  silently fall back to the wall texture — an unset part material falls back
  to the portal def's own default palette (trim-like), and `match_wall` is an
  explicit author choice.
- **Migration**: the AI 509 ad-hoc `portal.colonettes` / `portal.frieze` /
  `portal.recessMaterial` config keeps working — either mapped onto framework
  parts or normalized into a generated def — and the AI 488 steps/recess
  behavior is absorbed unchanged. One merged mesh per material role,
  role-tagged (`portal_*`), in the building merge/shadow set, deterministic
  from settings.

## Delivery requirements
- Engine 2 only.
- Unit guards: a portal def resolves its layers; an order emits arch + jamb
  legs as one run with its own material; a carved order steps the wall cut
  (stepped reveal depths) and the AI 507 shell rule still clears the door;
  the legacy colonettes/frieze config still emits.
- Before/after of the `bradbury_block` entry vs the reference in ONE
  composite image (reference | before | after — see
  `ai509_compare_composites.pwtest.js`). Adoption of the def into the
  bradbury config lands in AI 513.

## Summary of changes (2026-08-26)

- **Framework**: `PortalFabricationCatalog.js` (defs: recess, orders,
  impost, colonettes, frieze, steps, custom parts, palette; one stock def
  `portal_classical_orders`), referenced via `portal.defId`;
  building-level `portalDefinitions.items` plumbed through CityMap, City,
  BuildingConfigExport, BF2 scene/thumbnail and the showcase scenario keys.
  Inline AI 488/509 portal config still works; explicit inline parts override
  the def, unset part materials fall back to the def palette (trim-like
  defaults - never the wall texture silently).
- **Orders**: `resolvePortalOrderGeometry` computes concentric ring
  contours (arch math identical to the wall builder, so the enlarged carved
  cut reproduces the exact concentric circle); run orders extrude arch +
  jamb legs as ONE closed ring, stop orders cut on the springing line and
  land on impost blocks; profiles band/roll/cavetto as prismatic sub-bands;
  carved orders must be innermost (stray carves clamp with a warning), line
  the single stepped void, and set `revealDepth` (visible reveal) +
  `shellRevealDepth` (true door plane for the AI 507 shell rule).
- **Custom parts**: `PortalOrnamentParts.js` registry + preload
  (bus-model GLB pattern); `assets/ornaments/foliate_capital.glb` is the
  first registered part, anchored springing/crown/jamb_base with scale and
  offsets. City kicks the preload; the showcase scenario awaits it
  (PBR-calibration cold-start contract). Un-preloaded parts warn and skip.
- Core tests (AI 510): concentric-cut circle identity + stray-carve clamp;
  full build emitting order runs (one mesh spanning legs + arch), imposts,
  ornament clones (injected template), own materials (not the wall instance),
  stepped front planes, enlarged wall cut, AI 507 shell clearance with the
  deep door, def-not-found warning; catalog normalization clamps.
- Captures: `ai510_portal_capture.pwtest.js` (before = committed bradbury
  entry, after = portal def via overrides with limestone orders / terracotta
  colonettes + foliate capitals / dark recess) and
  `ai510_compare_composites.pwtest.js` -> `ai510_portal_compare.png`
  (reference | before | after). Adoption in AI 513.
- Spec: BUILDING_2_SPEC_engine.md 6.2.6.

## Review fixes (2026-08-27)

User review of the first capture flagged: dark full-height slabs flanking the
arch (the door def's leftover `decoration.jambs` simple bands - the capture
patch had only disabled the header), the foliate capital not visible (the
springing anchor buried it inside those slabs + the impost blocks, z-fight
speckle), loose base blocks at the colonette feet, and a composition that did
not read like the reference. Fixes, decomposing the reference entry
(pilasters + big capitals / stepped flat archivolt on imposts / name band):

- Colonettes feature gains modes (one feature, not siblings): `shape:
  'round' | 'pilaster'` (pilaster = broad rectangular piers, `widthMeters` +
  `projectionMeters`) and `top: 'springing' | 'arch_crown'` (shaft assembly
  tops out at the springing line or the outermost order's crown).
- New ornament anchor `capital`: crowns each shaft cluster - the shafts
  shorten to leave room, the part's base lands on the shaft top centered on
  the cluster at the shaft's own out-of-wall stance. Warns + falls back to
  springing without colonettes. Stock def crowns its colonettes with it.
- Capture def rebuilt from the reference: white limestone throughout (user:
  "the white part looks better"), single broad pilaster per side crowned by
  the 0.56m foliate capital at the arch crown, two carved band steps + one
  wide proud flat archivolt stopping on moulded imposts, frieze band spanning
  pilaster-to-pilaster under the building's dentil belt, dark recess; the
  patch now disables BOTH leftover door decorations (header + jambs).
- New core test: pilaster shafts + capital anchor (capital base on shaft
  top, crown at the arch line, centered over the pier, box shafts proud of
  the wall); normalization coverage for the new fields.

## Rework (2026-08-27): the box + levels layer model

User review reframed the portal as LAYERS, not sibling parts: "imagine a box
whose walls are the portal structure; on it you can have insets, several
levels deep; the hole in the center is the door area; you can cut the arch;
decorations attach to the elements" - plus: use the reference's clay
material, the arch is a TRUE SEMICIRCLE (rise = half chord), the portal is
deep and the facade must open to accept it. Follow-ups: decorations must say
WHICH walls they apply to (the foot circulates the entire structure, the
impost band lives inside the void), the impost/base cross-sections are the
existing facade decorator profiles (wedge / skirt transversal cuts), and
ornaments mount like 3D decals on the wall, not free-standing pieces.

Reworked accordingly (orders/recess replaced; nothing external depended on
v1):

- Def = `box` (sideMargin/topMargin/projection - the facade opens to the
  box rectangle, clamped to the bay strip) + `levels[]` (outermost first:
  frameWidth + depth + arch flag + optional `ring` moulding with run/stop
  jambs) + `impost`/`base` (profiles `wedge`/`skirt`/flat/stepped/molded
  borrowed from the cornice section kit, `walls: outer|inner|both`) +
  `panels[]` (blind insets punched through the box face, mirrored) +
  `custom[]` (anchors + `face`, `mount: relief|proud`) + palette
  (box/level/ring/impost/panel/base/... keys).
- The door mounts at the last level's face plane (frame inset gains
  Sum(depth) - projection); each level ring's inner side wall IS the return
  to the next face; ring mouldings follow the hole contour (semicircular
  over an arch, rectangular otherwise); inner-wall bands run along the
  reveal jambs inside the void.
- Bradbury capture def rebuilt: monochrome pbr.terracotta_smooth (the
  reference clay), semicircular arch (heightRatio 0.5 patch), widened entry
  bay (the box replaces the two 1m wall piers), pier panels, wedge imposts
  on both wall sets, skirt foot, relief-mounted foliate capitals on the
  pier faces.
- Tests rewritten: level-geometry resolver (telescoping concentric holes,
  semicircle identity, rect/arch mixing, box cut), full build (box, levels,
  rings, swept imposts, panels + punched holes, base, mirrored face
  ornaments, box-rect wall opening, AI 507 shell), pilaster/capital def on
  levels, normalization (walls/mount/wedge/skirt defaults + clamps).
