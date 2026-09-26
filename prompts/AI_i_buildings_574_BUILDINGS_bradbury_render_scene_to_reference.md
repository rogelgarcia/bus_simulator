# Problem

The Bradbury block has a Blender render scene of its own (`src/graphics/content3d/buildings/authoring/BradburyBlock/build_scene.py`
writes `tests/artifacts/blender/bradbury/portal_project/bradbury_scene.blend`, which links the worn block), but its
stills do not read like the reference the user supplied on 2026-09-25: an aerial three-quarter view of the corner on a
clear sunny afternoon, the block standing in a low-rise city (copy at
`tests/artifacts/screens/bradbury_scene/review_2026-09-25/reference_corner_aerial.png`). The review of that day
(`scene_review_reference_vs_ours.png` and `sky_candidates_sheet.png` in the same folder) found the gaps are in the
SCENE, not in the building: a street-level HDRI whose lamp posts and field tower over the block, flat hazy light from
the wrong side, a sharp clean mitred kerb, a spotless tiling ground, and a camera that looks down onto the roof.

# Request

Bring the render scene -- environment, light, ground, cameras -- to the reference's look, item by item, most impact
first. The building itself is left alone here and comes later in prompts of its own. The work stays in the scene
builder and the scene file (headless builds and renders; the GUI Blender is only refreshed with the result, never
while it holds unsaved changes), and every result is composed against the reference in one image under
`tests/artifacts/screens/bradbury_scene/<item>/` (gitignored). New HDRIs may be downloaded (Poly Haven, CC0) and
imported into the game's HDRI catalog (`assets/public/lighting/hdri/` + `IBLCatalog.js`).

Reference facts measured from the photo (1536x1024): horizon 32% from the top (eye about 16 m, the top of the 4th
floor); the corner at 44% of the width; the building fills 88% of the width; the sun stands high behind the camera's
left shoulder (about azimuth -60 in scene terms, 45-50 degrees up), so both faces are lit, 3rd Street the brighter,
and the fire escapes throw crisp shadows to the left; the kerb corner is a rounded arc of about 5 m radius; the
sidewalk is scored into large slabs; the asphalt is a pale bleached grey with cracks and patches.

## Requirements Checklist
- [ ] 1 Sky: a clear deep-blue sky with a few thin wisps, its own sun disc standing where the lamp of item 9
      stands (the map turned to match, and the lamp's elevation matched to the map's sun). Sky candidates tested on
      2026-09-25 (2k copies in `tests/artifacts/blender/bradbury/hdri_candidates/`): `kloofendal_43d_clear_puresky`
      recommended, `qwantani_afternoon_puresky` a close second; every ground-level map fails like the current one.
      The user picks the sky. At strength 1 the pure sky reads paler than the photo's blue: tune strength and
      exposure against the reference. If the sky is imported into the game, add the 2k `.hdr` to
      `assets/public/lighting/hdri/` and a catalog entry. (The sun lamp itself was split off as item 9.)
- [ ] 2 Background at true scale: the horizon must hold content at real distance, as the photo has it -- a low
      concrete retaining wall with trees on an embankment about 20 m behind the block on both sides, a vacant lot
      across 3rd Street, white low-rise warehouses and tree lines 200-500 m off, a hazy hill on the horizon -- built
      as geometry (or cards) in the scene, so nothing from a street-level map stands above the horizon and the
      ground plane never ends in a visible seam. Haze toward the horizon.
- [x] 3 Kerb corner: the kerb at the chamfer corner (and the far corners) is a rounded arc of about 5 m radius,
      its top edge rolled/beveled, the kerb face lighter than the road, with a dark gutter line along its foot.
- [ ] 4 Sidewalk: large scored slabs with joints (a fan at the corner), dirt and stains, a grime line along the
      wall base, drain grates and vault covers near the kerb -- instead of one clean tiling texture.
- [x] 5 Asphalt: a lighter bleached grey with tone changes, cracks, patches and tire tracks, a slight crown; and
      the far side of both streets is road with its own kerb and pavement, not the concrete plaza it is now.
- [x] 6 Camera: a scene camera matched to the reference photo -- eye about 16 m up, the horizon a third from the
      top, the corner at 44% of the width, the block filling about 88% of a 3:2 frame, 35 mm -- so every later
      item is judged from the photo's own stand. Renders of it go beside the reference.
- [ ] 7 Off-frame neighbour: a building's shadow crossing the road on the left, as in the photo, so the block
      reads as standing in a street rather than on an empty plain.
- [ ] 8 Street furniture at real scale: lamp posts, drains, a hydrant, placed as the photo has them.
- [x] 9 Sun lamp (the sun half of item 1, split off 2026-09-25 when the user saw "a strange decal on the street"):
      the lamp stands where the photo's sun is -- high behind the reference camera's left shoulder -- independent of
      the map, so the block's shadow falls behind it and the road in front of the camera is lit end to end; and the
      builder reads the map's own sun with Cycles' real equirectangular convention.
- [x] 10 Revert item 9's lighting (user 2026-09-25, on seeing it: "revert the illumination"): the lamp back on the
      map's sun as the builder has read it since 2026-09-20, so the scene's light is what it was; the explicit
      `sun_az` / `sun_el` stay as an option for item 1, and the mirrored reading stays in place, documented, until
      the sky item replaces the map.
- [x] 11 Remove the gutter pan of item 3 (user 2026-09-25, pointing at the strip along the kerb foot: "decal"): the
      kerb ends at its foot on the asphalt; the rounded corner, the rolled edge and the grime at the foot stay. The
      photo's dark line along the kerb is dirt on the asphalt, which belongs to item 5.
- [x] 12 Camera, measured (user 2026-09-25: "the camera still need adjustments to match the reference"): the
      reference stand set so that the wall ends, the cornice top, the corner base and the corner column land where
      the photo has them, measured on both pictures rather than judged on an overlay.
- [x] 13 Randomise the road's cracks (user 2026-09-25: "cracks on the asphalt are good, but they read pattern"):
      nothing in the crack work repeats or lines up -- not the set's own cracks, not the network's cells.
- [x] 14 Tire wear (user 2026-09-25: "add the tire wear threads as well"): the wheel paths of every lane on every
      street, where the tires run, a shade darker and smoother than the field, stronger on some stretches.
- [x] 15 The curbs (user 2026-09-25: "implement the curbs"; read as: make the kerb read as the photo's concrete
      curb): poured in segments with a joint every 1.5 m, every segment its own tone, the face a shade greyer than
      the rolled top, the foot's grime kept. (If curb ramps or anything else was meant, that is a new item.)
- [x] 16 Tire wear as bands of use, not stripes (user 2026-09-26: "the tire wear looks like a pattern; it should
      look like bands of more usage, not a single tire thread. where the tires usually go it has a different
      texture"): per lane one broad worn zone with soft edges, wandering along the street, the outer lanes worn far
      less, whole stretches nearly unworn, and inside the zone a polished surface -- flatter, a shade lighter,
      smoother, its bumps worn down -- rather than a darker line.
- [x] 17 Street widths from the photo, and the wear per street (user 2026-09-26: "you didn't take into
      consideration the width of the street; there probably space for just one car there"): 3rd Street is one car
      wide (the photo's far kerb, unprojected through the measured camera, stands about 5.3 m from the block's),
      Broadway wide (its far kerb beyond the frame, at least 8 m); each street's wear comes from the lanes its width
      holds -- one worn zone on the narrow street, a zone each way between parking strips on the wide one.
- [x] 18 The bands stable (user 2026-09-26: "the tire wear also doesn't look like an S or as if the markings are
      dancing. They are more stable, with some parts maybe wider, but really smooth changes"): no wander; the bands
      run straight, only their width and their strength drift, slowly, along the street.
- [x] 19 The road as uneven geometry (user 2026-09-26: "the asphalt geometry is too flat; there should be small
      irregularities"): the road near the block is a real surface, not a plane -- undulation at several scales, a
      crown per street, ruts along the wheel paths, a dip toward the gutter, repair patches sitting proud or sunk
      where the colour patches are, settled utility trenches across the streets, and irregularity below the grid
      as shading -- and the surface reflects the sky enough for its waves to show.
- [x] 20 The wear as a field (user 2026-09-26: "the tire marks are still too abrupt, and are very bright. and i
      don't know about their size. and on the curved streets there should be curved markings, merging all of them
      in the center; the markings fade away more naturally in reality"): no edge anywhere -- each wheel path a
      Gaussian across, a lane's two meeting softly between them; the polish a shade darker, never brighter; at
      every crossing the paths coming in give way to one merged zone over its middle and turning paths run as arcs
      round each curb return; everything fades with the grid's edge.
- [x] 21 3rd Street back to 13 m (user 2026-09-26: "you also shrunk the street width; that was not the objective.
      make the side street larger"): item 17's narrowing undone; both streets 13 m with a lane each way between
      parking strips.
- [x] 22 The road graded like a road (user 2026-09-26: "the asphalt irregularities, based on the heat image, look
      like islands. that's not how it should work. the asphalt should be higher at the center, but also, at the
      corner it should wave, make bellies, very subtle and smooth"): the crown dominant, the two crowns of a
      crossing meeting in a smooth valley so the corners belly gently, broad low waves on top pinned to a fixed
      gutter line, and no fine noise or patch steps.
- [x] 23 The kerb taller (user 2026-09-26: "the height of the sidewalk is correct? it looks a little thin to me"):
      measured against the photo's kerb from the matched stand it read about half the photo's; the kerb is now
      28 cm with the gutter falling a further 2.5 cm into it, its blocks a metre long like the photo's.
- [x] 24 The crossing's wear as the traffic's movements (user 2026-09-26, on a sketch over the wear field: "all
      lanes should go in all possible other lanes, and the curves should continue from the straight line; the red
      lines show the bands' limits, the markings should mostly be inside them; make the fading wider, more subtle;
      at the center, all sorts of combinations"): every incoming lane's right and left turn as curves tangent to
      the straight wheel paths at both ends, the right turns inside the envelope, the left turns through the
      centre, everything fading wide and soft.
- [x] 25 The wear weaker with a narrow peak on wide skirts, and the asphalt rough (user 2026-09-26: "reduce the
      strength of the tire wear; make the fading wider, and the peak narrower; and make the asphalt more rough in
      general; it is too plastic right now"): the field at two thirds, each wheel path a narrow peak on long soft
      skirts, the polish milder; the roughness the set's own and a little more, the aggregate's grain stronger.
- [x] 26 The kerb as its own element (user 2026-09-26: "the kerb seems to be thin, I don't see its border at the
      top of the sidewalk"): a flat top 30 cm wide in the kerb's own stone tone, standing a few millimetres proud
      of the slabs with a joint line along them, its blocks' joints running across it, then the rolled edge and
      the face as before.
- [x] 27 The kerb weathered (user 2026-09-26: "make the kerbs dirty. water lines, dirt at the bottom, irregular
      shapes, edge wear"): a brown dirt band at the foot with a ragged top edge, tide lines from standing water
      that come and go along the kerb, a grime mottle over the face, rare drip streaks, the arris worn pale with
      the odd chip; everything varying along the kerb by noise so nothing repeats.

Rules:
- Do not edit text of completed items (`- [x]`).
- Add a new item for any fix/change to previously completed behavior.
- You may patch contradictory non-completed (`- [ ]`) items in place.

## Implementation Notes
- (cycle 1, 2026-09-25) Item 6, the camera. `build_scene.py` gains a sixth view, `ref_3q`, the photo's stand: eye
  16 m over the pavement at (48.74, -38.83), 40 m from the chamfer's midpoint at azimuth -34, 35 mm, aimed 3 m to the
  camera's right of the corner and down to z 11.4; `VIEWS` entries may now carry a fourth element, the view's frame
  (`(3, 2)` here), stored on the camera object as `frame`, and both `build_scene.py` and `render_wear.py` render such a
  view in it (the other five stay 16:10). Calibrated by blending the photo over renders at 38/40/42 m with the photo's
  cornice, base, horizon and corner column drawn as lines: at 40 m the cornice, the corner column, the base and both
  facade ends land on the photo's own. Evidence `tests/artifacts/screens/bradbury_scene/item6_camera/`
  (`item6_reference_vs_ref3q.png`: photo | ref_3q | 50% blend; the calibration overlays). The scene was rebuilt headless
  (`bradbury_scene.blend`, 6 cameras) and the GUI Blender reloaded with it (it held no unsaved changes). README:
  "The reference camera (AI 574, 2026-09-25)". Not touched: the sky, the sun and its mirrored azimuth (item 1).
- (cycle 2, 2026-09-25) Item 3, the kerb and the sidewalk corners (the user: "round the sidewalk"). The block's
  pavement is now its kerb lines' rectangle with every corner a curb return of `KERB_R` 5 m (`fillet`: an arc tangent
  to both edges); at the chamfer that is one arc tangent to both streets, so the corner apron is 5.9 m wide against
  4.2 along the faces, as the photo has it. The kerb is `KERB_PROFILE` swept round the kerb line (`kerbed_pavement`):
  a 5 cm rolled top edge shaded smooth, the face, and a 0.35 m gutter pan 2 mm over the road; a `grime` float
  attribute (0.6 at the foot, 0 at the seam and from 45% up the face) that `ground_material(grime=...)` multiplies
  into the base colour gives the dark line along the foot. The kerb wears `concrete_pavement` so its face stands
  lighter than the asphalt (the plain `concrete` set read as dark as the road in the first render), the pan the
  plain set. The far pavement is eight blocks with both streets running on, so their corners facing the crossings
  are curb returns too; `st_corner` still stands on the `se` block. Evidence
  `tests/artifacts/screens/bradbury_scene/item3_kerb/` (photo | before | after from ref_3q with the corner crops;
  standing-eye close-ups of the return and the profile, before | after); the pre-kerb scene is kept as
  `tests/artifacts/blender/bradbury/portal_project/bradbury_scene_pre_kerb.blend` for further before renders.
  README: "The kerb and the sidewalk corners (AI 574 item 3)". The GUI Blender was reloaded with the rebuilt scene.
- (cycle 3, 2026-09-25) Item 9, the sun lamp. The "decal on the street" was the block's own shadow: the lamp stood
  on what `hdri_sun_direction` read as the map's sun, 19 degrees up in the north-east, so the block threw a 60 m
  shadow across 3rd Street toward the camera, a hard-edged dark wedge on the road. `build_scene.py` now takes
  `sun_az` / `sun_el` (default -60 / 45, the photo's sun; `sun_az=map` for the map's own) and the lamp's direction is
  built from them; `hdri_sun_direction` reads u as Cycles does (0.5 - atan2(y, x) / 2pi) and turns by -rot, so the
  German map's sun reports 73.9 at rot 250, where the mirrored formula said 33.9. The sky is not turned to follow
  the lamp (through this map's haze its disc does not show; item 1 replaces the map). Evidence
  `tests/artifacts/screens/bradbury_scene/item9_sun/` (`ref_3q` photo | before | after, `st_corner` before | after):
  the wedge is gone, both faces lit from the camera's left, the fire escapes' shadows falling left as in the photo.
  README: "The sun lamp (AI 574 item 9)". The GUI Blender was reloaded with the rebuilt scene.
- (cycle 4, 2026-09-25) Items 10 and 11. The "decal" of the user's first message was the gutter pan of item 3, not
  the shadow: a 0.35 m concrete strip along the kerb foot reads as a light stripe painted on the road from the
  reference camera. `build_scene.py`: `sun_az` defaults to `map` again and `hdri_sun_direction` is back to the
  mirrored reading (kept on purpose, documented in place, so the light is exactly what it was: lamp at 33.9 / 18.7);
  `KERB_PROFILE` ends at the foot on the road plane, no gutter constants, materials or slots. Evidence
  `tests/artifacts/screens/bradbury_scene/item10_11_revert/` (`ref_3q` before | after, the kerb-foot crops, the
  profile close-up with and without the pan, and the user's marked crop). README: both sections amended.
- (cycle 5, 2026-09-25) Item 12, the camera measured. A hue mask of the brick read below the horizon in the photo
  and in the render gives five fractions of the frame (wall ends at the base, cornice top, corner base, corner
  column; photo 0.055 / 0.930 / 0.085 / 0.860 / 0.443). The item 6 stand was off by up to 0.066 (the block 6% too low,
  its right end 4% short): the horizon crosses the block at 14.4 m, not 16, and only a longer lens from further back
  lengthens both wall ends at once. Ten candidates rendered at 40% and measured; `ref_3q` is now the eye 14.4 m over
  the pavement at (54.12, -38.71), 44.5 m from the chamfer's midpoint at azimuth -30, 40 mm, aimed 3.8 m right of the
  corner and down to z 9.76; the full render matches within 0.008 on all five. Evidence
  `tests/artifacts/screens/bradbury_scene/item12_camera/` (photo | before | after and the 50% blends with the photo's
  lines; `measure_ours.py` in the review's `scripts/`). README: the camera section extended. Scene rebuilt, GUI reloaded.
- (cycle 6, 2026-09-25) Item 5, the asphalt (user: "make the asphalt look like asphalt as in the reference").
  `road_material` in build_scene.py, on the pale `asphalt_02` set (the only pale one of the four in the repo, with
  cracks of its own) instead of the dark even `clean_asphalt`: two samples of the set traded over a 9 m noise
  (no 4 m repeat), tinted and lifted to the photo's bleached warm grey (the road now reads 135-138 warm in the
  reference view where the photo has 127-150 and ours had 112 neutral), Manhattan-Voronoi repair patches of 9 m
  softened by a noise, an alligator network from two Voronoi scales (0.7 m and 1.2 m) on a warped input with
  gaps along the cracks and a pale rim beside them over 62% of the road, and the kerb's dirt line from an
  ambient-occlusion read of the kerb's own face (0.6 m, up to 0.50 dark at the foot) that follows every curb
  return by itself. Three passes: v1's patches read as painted rhombs and its cracks vanished, v2's cracks read as
  a honeycomb, v3 is what stands. Not done: tire tracks (faint in the photo), a crown, lane paint (none in view).
  Evidence `tests/artifacts/screens/bradbury_scene/item5_asphalt/` (photo | before | after from ref_3q, the three
  road regions of the photo beside ours at full size for v1-v3, a street-level view before | after). README: "The
  road (AI 574 item 5)". Scene rebuilt, GUI reloaded. Done so far: 3, 5, 6, 9-12; open: 1, 2, 4, 7, 8.
- (cycle 7, 2026-09-25) Item 13, the cracks randomised. Two things read as pattern: the asphalt_02 set's own long
  cracks repeating every 4 m tile in one direction, and the network's cells all one size. `road_material` now lays
  the set per random Voronoi cell of `ROAD_TILE_M` 7 m, each cell sampling the set turned about its own feature
  point by its own angle and slid by its own offset (two such layouts blended by the old 9 m noise, which also
  hides the seams); the two crack networks skip `ROAD_CRACK_SKIP` 22% of their cells, give every crack its own
  strength (`ROAD_CRACK_VARY` 0.6-1 over a 2.2 m noise), lie in regions ragged by a 5 m noise on top of the 16 m
  one, and a sparse third network of `ROAD_BLOCK_M` 3.5 m block cracks lies over everything; width 4.5 cm and
  darkening 0.55 put the visibility back at v3's. Five passes (v4-v8): a drift of the cells' size fed into the
  Voronoi's scale shredded the network into swirls 30 m from the origin (the scale multiplies world metres), found
  by rendering the crack factor top-down (`debug_cracks.py`) rather than guessing from crops. Evidence
  `tests/artifacts/screens/bradbury_scene/item13_cracks/` (ref_3q v3 | v8, the road band v3 | v8, the crops, the
  crack masks shredded and fixed). README: the road section amended. Scene rebuilt, GUI reloaded.
- (cycle 8, 2026-09-25) Items 14 and 15. `road_material` takes the streets' lane bands (`LANES`: axis, centre line,
  two kerb lines, for the four streets) and for each reads the offset from the nearest lane centre off the other
  coordinate (`ROAD_LANE_M` 3.25, four lanes in the 13 m), folds it about the track's half width (`ROAD_TRACK_M`
  1.8) into a soft band `ROAD_WEAR_W` 0.34 m wide on each wheel path, bounds it by the band's kerbs, takes the
  maximum over the streets (paths cross in the crossings) and lets an 8 m noise bring the wear and go; the paths
  darken the colour by `ROAD_WEAR_DARK` 0.16 and lower the roughness by `ROAD_WEAR_SMOOTH` 0.25 (0.12 / 0.18 first,
  too faint from the reference stand). `kerb_material` replaces the pavement set on the kerb: the same set tiled
  along the kerb line, a joint every `KERB_JOINT_M` 1.5 m (`KERB_JOINT_W` 2 cm, darkening 0.45, the distance to the
  nearest joint read off u wrapped to the segment), each segment's tone from a white noise of its index (+-7%),
  the face 0.90 of the top past the rolled edge, the foot's grime attribute as before. Evidence
  `tests/artifacts/screens/bradbury_scene/item14_tire_wear/` (ref_3q before | after, 3rd Street x2, street level)
  and `item15_curbs/` (the photo's kerb line beside ours, the kerb close-up before | after, the curb return).
  README: "Tire wear and the curbs (AI 574 items 14 and 15)". Scene rebuilt, GUI reloaded.
- (cycle 9, 2026-09-26) Item 16, the tire wear reworked. The bands are `ROAD_WEAR_W` 1.35 m wide with soft edges,
  so a lane's two paths nearly merge into one worn zone with a less-worn centre; the coordinate is pushed sideways
  by a 12 m noise (`ROAD_WEAR_WANDER` +-0.35 m) so the zones wander; the outer lanes get `ROAD_WEAR_OUTER` 0.4 of the
  inner lanes' use (the lane index from the offset to the centre line); a 20 m noise lets the use fall to 0.2 on
  some stretches. Inside the zone the colour is mixed `ROAD_POLISH_FLAT` 0.30 toward one flat tone and lightened
  `ROAD_POLISH_LIGHT` 1.05 (polished aggregate), the roughness drops by `ROAD_WEAR_SMOOTH` 0.35 and the normal map's
  strength by `ROAD_WEAR_FLATTEN` 0.60; the darkening of item 14 is gone. A first pass at 1.1 m, 1.08 lighter and
  no lane weighting still read as eight even stripes. Evidence `tests/artifacts/screens/bradbury_scene/
  item16_wear_bands/` (ref_3q stripes | bands, 3rd Street x2, street level, and a view from 6 m up along 3rd
  Street). README: the tire wear paragraph amended. Scene rebuilt, GUI reloaded.
- (cycle 10, 2026-09-26) Items 17 and 18. `ST_W` became `ST_W_EW` 6.0 m (3rd Street and its northern twin) and
  `ST_W_NS` 13.0 m (Broadway and its western twin); the far kerbs, the eight far blocks and the curb returns follow.
  `LANES` now carries per street its two kerb lines, its travel-lane count and its parking strip (`ROAD_PARK_M` 2.4
  on the wide streets, none on the narrow): 3rd Street one lane, Broadway two; the wear loop reads the offset from
  the nearest lane centre within the travel zone. The wander is gone; a 25 m noise of the along-street coordinate
  alone drifts each band's width +-25% (`ROAD_WEAR_WIDTH_M`, `ROAD_WEAR_WIDTH_VARY`) and a 30 m one its strength
  between 0.4 and 1 (`ROAD_WEAR_VARY_M`). In the reference view the far pavement of 3rd Street now shows at the
  bottom left as the photo has it. Evidence `tests/artifacts/screens/bradbury_scene/item17_18_streets_wear/`
  (photo | before | after, 3rd Street from 6 m up before | after, Broadway from 10 m up, street level). README:
  "Street widths from the photo, and the wear per street (AI 574 items 17 and 18)". Scene rebuilt, GUI reloaded.
- (cycle 11, 2026-09-26) Item 19, the road surface. `road_mesh` lays a 550x550 grid of `ROAD_GRID_M` 0.20 m cells
  over `ROAD_GRID_R` 55 m (every street in the reference view), every vertex at `road_height`: Perlin undulation at
  four scales (`ROAD_UNDULATE`: 18 m / 3 cm, 4 m / 2.2 cm, 1.5 m / 1.1 cm, 0.6 m / 4.5 mm), a parabolic crown per
  street (`ROAD_CROWN` 1.5 cm per metre of half width: 10 cm on Broadway, 4.5 on 3rd Street), ruts `ROAD_RUT` 1.2 cm
  along the wheel bands, a dip `ROAD_GUTTER_DIP` 1 cm over 0.7 m toward each kerb, repair patches from a Manhattan
  Voronoi of `ROAD_PATCH_M` 9 m cells whose darker fifth sit 8-15 mm sunk and palest fifth 5-10 mm proud with the
  step softening toward the cell edge, and three settled trenches per street (`ROAD_TRENCH_*`: 1 m wide, 1.6 cm
  down, darker fill; seeded positions 3rd Street x -16.6 / 4.3 / -35.1, Broadway y -7.2 / 18.1 / 29.3); the patch
  tone is computed with the geometry and handed to the material as the `ptone` attribute, so colour and step
  coincide (the shader's own Voronoi patches are gone); all of it fades to the plane over 10 m inside the grid's
  edge, and four flat quads carry the road on to the field. The kerb's foot is buried `KERB_BURY` 8 cm so the road
  may dip; the shadow catcher went to -12 cm. In the shader: `ROAD_BUMP` (1.5 mm over 25 cm, 0.6 mm over 8 cm) as
  a bump under the grid, and the set's roughness eased `ROAD_ROUGH_SCALE` 0.85 (mean 0.77 to 0.65) so the surface
  reflects the sky enough to show its waves. Three passes: 0.35 m cells and 2.5 / 0.8 / 0.3 cm read flat at street
  level; 0.2 m cells with patches and trenches showed the steps but the shading still hid the waves; the amplitudes
  up, the bump and the roughness made them read. The build takes about 20 s for the grid. Evidence
  `tests/artifacts/screens/bradbury_scene/item19_road_surface/` (ref_3q before | after, street level, grazing along
  3rd Street, a view toward the sun across the crossing flat | uneven where the sheen breaks into waves, the height
  above the plane rendered top-down with a contour per centimetre; `debug_height.py` in the review's `scripts/`).
  README: "The road surface (AI 574 item 19)". Scene rebuilt, GUI reloaded.
- (cycle 12, 2026-09-26) Items 20 and 21. The wear left the shader: `road_wear` computes it with the road's
  geometry per grid vertex and `road_mesh` stores it as the `wear` attribute the material reads (like `ptone`),
  which also lets the ruts follow it exactly. Straight paths: per travel lane two Gaussians `ROAD_WEAR_SIGMA` 0.55 m
  across, `ROAD_TRACK_M` 1.8 apart (half strength 0.65 m out, a quarter where a lane's two meet, the outer one's
  tail dying in the `ROAD_PARK_M` 2.2 m parking strip), strength 0.6-1 over 30 m and width +-25% over 25 m along
  the street. Crossings (`road_crossings`: every x-street with every y-street, four): a merged zone over the
  middle, a rounded square `ROAD_MERGE_IN` 0.25 to `ROAD_MERGE_OUT` 1.1 of the half width at `ROAD_MERGE_STRENGTH`
  0.6, the straight paths giving way to it by `ROAD_MERGE_FADE` 0.5; and round each of the four curb returns a right
  turn's two paths as arcs concentric with the kerb (`ROAD_TURN_IN` 0.9 m outside it and the track further out),
  over the kerb's quadrant fading `ROAD_TURN_FADE` 15 degrees past each end, at `ROAD_TURN_STRENGTH` 0.5. The
  polish: `ROAD_POLISH_LIGHT` 0.92 (darker; it had been 1.05), flattened 0.25 toward the mean, roughness -0.2,
  normal strength -0.5 at full wear. `ST_W_EW` back to 13.0, `LANES` two lanes plus parking on all four streets.
  First pass had a square merged zone (box metric) and a polish so faint it vanished from above; rounded (a cubic
  superellipse) and deepened. Evidence `tests/artifacts/screens/bradbury_scene/item20_21_wear_field/` (photo |
  before | after from ref_3q, Broadway from 10 m before | after, 3rd Street from 6 m, the SE crossing from above,
  street level, and the wear field rendered top-down over the crossing by `debug_wear.py`). README: "The wear as
  a field, and the street width restored (AI 574 items 20 and 21)". Scene rebuilt, GUI reloaded.
- (cycle 13, 2026-09-26) Items 22 and 23. `road_height`: the waves are `ROAD_UNDULATE` 18 m / 3 cm and 8 m /
  1.5 cm only (the 4, 1.5 and 0.6 m scales are gone), multiplied by a pin that rises from 0 at any kerb to 1 at
  `ROAD_PIN_M` 2 m (`_pad_dist`: the distance to the nearest pavement, every pad a rectangle with its corners
  rounded to KERB_R so the distance follows the curb returns; `PADS` lists the block's and the eight far blocks');
  the patch steps are 0 (`ROAD_PATCH_SUNK` / `PROUD`; the tone patches stay), the trenches 1.2 m wide and 1 cm
  deep, the ruts 1 cm; the crowns of the bands the point lies in are combined by a softmax with temperature
  `ROAD_CROWN_SMOOTH` 3 cm, so the crease a plain max left along a crossing's diagonals is a smooth valley -- the
  bellies at the corners; the gutter dip is `ROAD_GUTTER_DIP` 2.5 cm over `ROAD_GUTTER_M` 1 m from the same
  distance, so it runs round the returns too. `ROAD_Z` is -0.08: the block's base is fixed at 0.201, so the kerb
  is 28 cm (the photo's kerb face at the corner spans about three 5-px ticks against under two of ours from the
  matched stand, the photo's kerb a little further off: about twice ours; 28 keeps a tall downtown block kerb
  plausible), and `KERB_JOINT_M` 1.0. `debug_height.py` gained `plane=` for the moved plane. Evidence
  `tests/artifacts/screens/bradbury_scene/item22_23_grading_kerb/` (ref_3q before | after, the height map before
  | after, the view toward the sun, the kerb close-up before | after, the SE crossing from above before | after,
  street level; `kerb_height_check.png` in the scratchpad was the measurement). README: "The road graded, and
  the kerb raised (AI 574 items 22 and 23)". Scene rebuilt.
- (cycle 14, 2026-09-26) Item 24. `road_crossings` now writes each crossing's movements: with right-hand traffic
  (the south lane east, the north lane west, the east lane north, the west lane south) each of the four arms brings
  one lane in, and its right turn and left turn are fillet arcs between the incoming and the outgoing lane lines
  -- centre P - r d1 + r d2, a quarter circle from direction -d2 to d1 -- of `ROAD_TURN_R_RIGHT` 7 m and
  `ROAD_TURN_R_LEFT` 11 m, tangent at both ends so the turn's wheel paths leave the straight ones and rejoin the
  next street's without a break; `road_wear` lays each turn's two wheel paths (`ROAD_TRACK_M` apart) as Gaussians
  of `ROAD_TURN_SIGMA` 0.8 at `ROAD_TURN_RIGHT` 0.5 and `ROAD_TURN_LEFT` 0.4, only over the arc's quadrant (the
  straight parts are the lanes' own bands). The kerb-hugging arcs of item 20 are gone. Softer everywhere: the
  straight paths' `ROAD_WEAR_SIGMA` 0.65 (was 0.55), the wear's own edge fade `ROAD_WEAR_FADE_M` 20 m (the geometry
  keeps 10), the merged zone `ROAD_MERGE_STRENGTH` 0.45 from 0.2 to 1.2 of the half width with the straight paths
  giving way 0.35. Evidence `tests/artifacts/screens/bradbury_scene/item24_movements/` (the user's sketch, the
  wear field before | after, the reference stand before | after, the SE crossing from above before | after and
  from 22 m). README: "The crossing's wear as the traffic's movements (AI 574 item 24)". Scene rebuilt.
- (cycle 15, 2026-09-26) Item 25. `_path(d, sigma)` replaces the single Gaussian: `ROAD_WEAR_PEAK` 0.55 of a
  Gaussian of `ROAD_WEAR_CORE` 0.45 sigma (0.29 m: half strength 0.34 m out) plus the rest of one of
  `ROAD_WEAR_SKIRT` 2 sigma (1.3 m: a tenth 2.8 m out); a lane's two paths add (their skirts overlap between them),
  lanes and movements take the max, and the field is scaled by `ROAD_WEAR_GAIN` 0.65. The polish is milder:
  `ROAD_POLISH_FLAT` 0.15, `ROAD_POLISH_LIGHT` 0.95, `ROAD_WEAR_SMOOTH` 0.15, `ROAD_WEAR_FLATTEN` 0.3. The asphalt:
  `ROAD_ROUGH_SCALE` 1.10 (item 19's 0.85 had eased the set's 0.77 to 0.65 to show the waves in the sheen, and
  that sheen is the plastic look; the crown and the bellies of item 22 show without it), `ROAD_NORMAL_GAIN` 1.4 on
  the set's normal map, and `ROAD_BUMP` deeper with a 2.5 cm grain added (2.5 / 1.2 / 0.4 mm). Evidence
  `tests/artifacts/screens/bradbury_scene/item25_wear_profile_roughness/` (reference stand before | after, the
  wear field before | after, toward the sun before | after -- the glossy sheet against the matte grain -- street
  level, the crossing from 22 m). README: "The wear's profile, and the asphalt's roughness (AI 574 item 25)".
  Scene rebuilt.
- (cycle 16, 2026-09-26) Item 26. The kerb had only its 5 cm rolled edge between the slabs and the face, so from
  above it was a line. `KERB_PROFILE` now starts at the slabs' edge, steps up `KERB_TOP_PROUD` 8 mm, runs
  `KERB_TOP_W` 0.30 m across the flat top, then the rolled edge and the face as before (`KERB_ROUND_FIRST` 2 marks
  the round's quads for smooth shading); `kerbed_pavement` insets the slabs by the top's width plus the round.
  `kerb_material`: the whole kerb `KERB_TONE` 0.88 of the slabs' set (the photo's kerb is darker stone), a dark
  joint along the slabs (`sjoint`: the step's face and the first centimetre of the top), the face tone from
  `KERB_V_FACE` (past the top and the round); the metre joints of item 23 run across the top. Evidence
  `tests/artifacts/screens/bradbury_scene/item26_kerb_top/` (the photo's kerb beside ours before | after at the
  same crop, the reference stand, the kerb close-up before | after, the kerb from above, street level). README:
  "The kerb's top (AI 574 item 26)". Scene rebuilt.
- (cycle 17, 2026-09-26) Item 27. `kerb_material` gained a weathering chain in h (the height above the gutter's
  foot) and u (the run along the kerb): foot dirt up to `KERB_FOOT_H` 10 cm +-5 over 1.7 m with a finer 0.3 m
  raggedness, darkest at the foot (`KERB_FOOT_DARK` 0.5) and heavier on some stretches; two tide lines
  (`KERB_TIDE_H` 10 and 16 cm, wobbling +-3 cm, sharp above and fading down over 4 cm, darkening 0.5, on about two
  thirds of the length); a grime mottle over the face (`KERB_GRIME` 0.3, two noises, heavier low down); drip
  streaks on `KERB_STREAK_P` 15% of the blocks, each at its own place, broken along its length; the arris worn pale
  by `KERB_EDGE_WEAR` 0.25 where a 0.9 m noise says so, and chips (`KERB_CHIP_P` 10% of 0.25 m cells, 3 cm, ragged,
  paler 0.25). The foot dirt and the tide lines go `KERB_DIRT_AMT` 0.85 of the way to a warm brown
  (`KERB_DIRT_TINT`), not merely darker; the roughness rises with the dirt and drops on the worn arris. Five passes:
  the first read as nothing (the face height was measured from the wrong end, and a Perlin Fac threshold of 0.6 for
  "coverage" is almost never met -- its values live near 0.5), then too grey, then brown. `debug_kerb.py` (the
  review's `scripts/`) renders the weathering factor alone from any camera and can probe any node by location.
  Evidence `tests/artifacts/screens/bradbury_scene/item27_kerb_weathering/` (the kerb close-up and from above
  before | after, the face along Broadway, square-on and the foot close, the reference stand before | after).
  README: "The kerb weathered (AI 574 item 27)". Scene rebuilt.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_i_DONE_buildings_574_BUILDINGS_bradbury_render_scene_to_reference_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested

## On `make final` without full completion
- If the user asks for `make final` while checklist items are still open, do not use `DONE` naming.
- Rename to regular mode naming (`AI_buildings_574_BUILDINGS_bradbury_render_scene_to_reference.md`) and keep all checklist items.
