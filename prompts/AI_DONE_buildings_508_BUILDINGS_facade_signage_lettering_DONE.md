# DONE

# Problem

There is no way to put building name lettering on a facade. The Bradbury
reference (`downloads/buildings_references/2.png`, entrance close-up) carves
"BRADBURY" into the frieze band over the entry portal; storefront rows in the
same era carry raised metal or carved stone lettering on fascia bands.

Engine 2 has no signage/lettering feature: `bradbury_block` ships its portal
frieze blank (documented in `docs/bradbury_block_reference_notes.md`).

# Request

A minimal facade lettering feature:

- Authored per building as a decoration item: text string, target (a bay ref
  or an opening's header/frieze zone, plus an optional y-offset), height in
  meters, letter style (raised block letters is enough for a first pass),
  material (the capital wall-material dialect with `slot:<name>` support).
- Geometry: extruded block glyphs (a simple built-in sans/serif outline set is
  fine; no font file pipeline needed) merged into one mesh per sign, role
  tagged (`facade_lettering`) and part of the building merge/shadow set.
- Deterministic placement: centered on the target span, clamped so it never
  overflows the band it sits on (warn when the text cannot fit).

## Delivery requirements
- Engine 2 only.
- Unit guard: a lettering item emits one role-tagged mesh centered on its
  target span, and an overflowing text warns and clamps.
- Screenshot of "BRADBURY" on the `bradbury_block` portal frieze (adopted in
  AI 513 (the adoption pass; renumbered 2026-08-26)).

## Summary of changes (2026-08-26)

- New module `FacadeLetteringGeometry.js`: built-in stroke font (A-Z, 0-9,
  space, hyphen, period — thick centerline segments in a unit em box, so no
  font-file pipeline) with `layoutFacadeLetteringText` (advance + exact INK
  bounds; diagonal butt ends overshoot the em box like type overshoot, and
  fitting/centering must use ink, not advance) and
  `buildFacadeLetteringGeometry` (one merged BufferGeometry per sign: extruded
  quad prisms, meter UVs, slight wall embed so the seam stays closed).
- Authoring: `wallDecorations.lettering[]` items — `{ id, text, target:
  { layerId, bayRef: "<face>:<bay>", zone: 'bay'|'opening_header', floor,
  yOffsetMeters }, heightMeters, depthMeters, letterSpacingRatio, style:
  'raised_block', material }`. Riding the wallDecorations root means CityMap /
  City / config export / BF2 round-trip need no new plumbing (all treat the
  root opaquely — verified).
- Generator emission (BuildingFabricationGenerator, after the fire-escape
  block): resolves the target strip (sourceBayId||id; rhythm-expanded bays
  pick the instance nearest the face middle), derives the band ('bay' = floor
  wall segment; 'opening_header' = opening head incl. top opening and portal
  step rise -> floor top via `resolveBayOpeningPlacementInSegment`), centers
  by ink, clamps scale to the band with a warning, and emits ONE mesh per
  sign: role `facade_lettering`, belts group, cast/receive shadow. Warns and
  skips on missing bay/floor/opening; warns on wedge fronts and unsupported
  characters.
- Materials: the capital wall-material dialect with `slot:<name>` support —
  lettering site added to `resolveBuildingConfigMaterials`
  (BuildingMaterialSlots.js).
- Core tests (AI 508): font layout determinism + ink==rendered-bounds guard;
  full-build guard (one role-tagged mesh centered on the bay span, in the
  opening_header band, no spurious warnings); overflow guard (long text warns
  "does not fit" and the rendered width stays inside the bay); normalization
  guards (missing target / unknown zone / empty text warn).
- Capture `ai508_lettering_capture.pwtest.js`: "BRADBURY" as raised sandstone
  block letters in the bradbury_block portal frieze (slot 'base', above the
  archivolt, under the dentil band), close-up + entry context, in
  `tests/artifacts/screens/buildings/ai508_bradbury_*_after.png`. Config
  adoption stays with AI 513 (the adoption pass; renumbered 2026-08-26) as planned.
- Spec: BUILDING_2_SPEC_engine.md §6.2.4.
