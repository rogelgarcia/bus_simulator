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
- [x] 1 Sky: a clear deep-blue sky with a few thin wisps, its own sun disc standing where the lamp of item 9
      stands (the map turned to match, and the lamp's elevation matched to the map's sun). Sky candidates tested on
      2026-09-25 (2k copies in `tests/artifacts/blender/bradbury/hdri_candidates/`): `kloofendal_43d_clear_puresky`
      recommended, `qwantani_afternoon_puresky` a close second; every ground-level map fails like the current one.
      Decided 2026-09-26 (the user: "update the AI with those steps"): `kloofendal_43d_clear_puresky` is the sky,
      imported into the game -- the 2k `.hdr` in `assets/public/lighting/hdri/` with an `IBLCatalog.js` entry and
      a `source.json` beside it naming the download page, URL, license, author and date; a 4k copy beside it for
      the render's backdrop, since the reference stand sees 40 px per degree and a 2k map gives 6. The lamp stands
      on the photo's sun, the map turned so its own disc stands there, the lamp's elevation the map's own, and
      `hdri_sun_direction` reads the map with Cycles' real convention. The photo's sun, MEASURED while building
      this (not the -60 / "3rd Street the brighter" of the Problem section, which was a misreading): azimuth about
      +40, behind the camera's RIGHT shoulder -- the Broadway face is the sunlit one (hue-masked brick sRGB about
      (196, 147, 115)), 3rd Street's is in shade ((101, 66, 51)) with no fire-escape shadows, and the dark half of
      3rd Street's road is the block's own shadow, its edge running at azimuth -136 from the corner base; it is also
      the light the user kept on 2026-09-25 when the -60 lamp was reverted. `SUN_AZ_PHOTO` is 40. At strength 1 the pure sky reads
      paler than the photo's blue: the visible sky is graded on the camera-ray branch alone (Light Path) toward the
      photo's -- top-left of the frame sRGB about (129, 176, 224) against ours (147, 166, 186), the same brightness
      at half the blue -- so the lighting stays physical; a procedural Nishita sky is the fallback if no map reads
      blue enough. (The sun lamp itself was split off as item 9.)
- [x] 2 Ground to the horizon, with haze (narrowed 2026-09-26; what stands on it is items 28 and 29): a pure sky
      is flat grey below the horizon, so the ground must run out for kilometres before anything stands on it -- a
      dry vacant-lot ground of dirt and dry grass from the game's own sets beyond the streets, the far pavement
      blocks becoming sidewalk strips round dry lots as the photo has them (a vacant lot across 3rd Street),
      continuous to 3-4 km so the ground never ends in a visible seam, nothing from a street-level map standing
      above the horizon; and a shared haze that mixes every far material toward the horizon's colour by camera
      distance from about 150 m out, leaving the block untouched.
- [x] 3 Kerb corner: the kerb at the chamfer corner (and the far corners) is a rounded arc of about 5 m radius,
      its top edge rolled/beveled, the kerb face lighter than the road, with a dark gutter line along its foot.
- [x] 4 Sidewalk: large scored slabs with joints (a fan at the corner), dirt and stains, a grime line along the
      wall base, drain grates and vault covers near the kerb -- instead of one clean tiling texture.
- [x] 5 Asphalt: a lighter bleached grey with tone changes, cracks, patches and tire tracks, a slight crown; and
      the far side of both streets is road with its own kerb and pavement, not the concrete plaza it is now.
- [x] 6 Camera: a scene camera matched to the reference photo -- eye about 16 m up, the horizon a third from the
      top, the corner at 44% of the width, the block filling about 88% of a 3:2 frame, 35 mm -- so every later
      item is judged from the photo's own stand. Renders of it go beside the reference.
- [x] 7 Off-frame neighbour: a building's shadow crossing the road on the left, as in the photo, so the block
      reads as standing in a street rather than on an empty plain. Re-read with the measured sun (2026-09-26): the
      large shadow over 3rd Street's road is the block's OWN and comes with item 1; what remains is the second,
      parallel shadow edge crossing the frame's bottom 7-8 m south-east of it, thrown by another building to the
      north-east under the same sun (noted in `item1_sky/item1_numbers.md`) -- an off-frame neighbour on Broadway's
      far side, sized and placed so its edge lands where the photo's does.
- [x] 8 Street furniture at real scale: lamp posts, drains, a hydrant, placed as the photo has them -- the tall
      lamp posts at the far kerbs (one at the left edge beyond the west street, one at the right edge on Broadway's
      far side, a short black one on 3rd Street's far pavement), the vault covers on the pavement by the kerb and
      the storm drains at the kerb foot, built as geometry in the scene builder (the game's own street lamps are
      still a placeholder); a CC0 model may be downloaded for any of them, installed under `assets/props/<asset>/`
      with a `source.json` naming its download page, URL, license, author and date (2026-09-26).
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
- [x] 28 Near context as geometry (split from item 2, 2026-09-26): what stands 20-100 m behind the block on both
      sides, as the photo has it -- on the Broadway side a grey retaining wall with a chain-link fence along its top
      and a hedge at its foot, a tan blank wall behind, trees between; on the 3rd Street side a low wall bounding
      the vacant lot, dry grass tufts along it, a tan wall further off, trees behind the block's west end -- the
      trees 8-12 m, from the game's own models (`assets/trees/Models/Desktop/SM_H_Tree_*.FBX` with the Realistic9
      leaf and trunk textures) imported into the scene so they self-shadow and throw real shadows; bushes may be
      cards. Nothing at this distance is a flat card: under a hard sun a card reads flat and its shadow is a sliver.
- [x] 29 Far context as cards and boxes (split from item 2, 2026-09-26): the white low-rise warehouses and the row
      of parked trailers a few hundred metres off as plain white boxes that take the sun and the haze, tree-line
      strip cards behind them (rendered from the game's trees, or CC0 cutouts with a `source.json`), a skyline
      strip card for the hazy far city and hill on the left horizon; every card faces the camera (a Track To on
      the reference camera) so the street-level views never see one edge-on.
- [x] 30 A flyover animation of the scene for a phone (user 2026-09-26: "create a flyover animation, vertical
      orientation for cellphone, fullHD; if possible, blur the background a bit like the reference. make sure no
      artifact that is only used for composing show up ugly in the rendering. export the video somewhere"; then
      "make poses that show the entire building, but also make some that show details, and one pose that shows
      bottom up; shows the facade looking at the sky"; "make one that shows the portal, in a way that we can see
      the door inside"): portrait 1080 x 1920, a sequence of slow moving shots -- the entire building from the
      air, a detail or two (the cornice and top band with the arched windows; the fire escapes), the facade from
      its foot looking up at the sky, the Broadway portal from the pavement close enough that the door inside
      the arch shows, and the whole block again to close -- with the far background softened a little as the
      photo's is (a depth-driven blur that leaves the block sharp), no composing-only geometry (the neighbour
      tower and wing, the far boxes, the library shelf, the catcher) reading as a plain box in any frame,
      rendered headless by a script beside the builder that never saves the scene, exported as an H.264 MP4
      under `tests/artifacts/` (gitignored) and handed to the user.
- [x] 31 The neighbour tower, its wing and the mid-distance boxes dressed as buildings (a fix to item 7's and
      item 29's plain boxes, needed by item 30's moving camera): storeys, window bays with dark glass, sills and
      a parapet from a procedural facade material or simple geometry, in the same sets, so they read as buildings
      from any stand; nothing changes where their shadows fall.
- [ ] 32 The flyover's timing (user 2026-09-27: "update the sequence so that on each pose it slows down towards
      the end, stretch the very end like 2 seconds almost stopped at the final position"; a change to item 30's
      motion): every shot eases in briefly and then decelerates long into its end so the camera nearly settles
      before the cut (the last fifth of a shot's time covering about a twentieth of its path), and the last shot
      runs 2 s longer, almost stopped at its final framing (a barely perceptible creep, not a frozen frame); and
      the video longer to give the deceleration room (user 2026-09-27: "extend the length of the video if needed
      (it is needed)"): about 5 s a shot, about 32 s in all; re-rendered and re-encoded at the same size and
      rate (fewer samples allowed if the render would otherwise run past about two and a half hours), the
      previous cut kept as `_v1`.
- [x] 33 The city filled in (user 2026-09-27, with a second aerial reference,
      `tests/artifacts/screens/bradbury_scene/review_2026-09-25/reference_city_aerial.png`: "interrompa a geracao
      atual e tente completar a cidade com mais conteudo para nao ficar um vazio atras; entao gere uma versao
      rapida (eevee is fine) para verificarmos"; "sao predios simples, caixas com janelas, e arvores"; "o primeiro
      quadro tambem precisa de conteudo no fundo; nas calcadas do lado esquerdo nao precisa, mas conserte a
      calcada, ela parece defeituosa"): item 32's Cycles render stopped at 211 frames; the blocks around the
      Bradbury filled as the new reference has them -- simple boxes with windows (the facade material) of one to
      four storeys on a grid of parcels with secondary streets, flat roofs, the game's plaster and brick sets, open
      parking lots here and there, trees along the streets and in the yards -- dense enough that no frame of the
      flyover, the high first frame of the approach included, shows an empty plain behind the block, the near
      and far context of items 28 and 29 and the tower of item 7 kept and built round; the open ground across 3rd
      Street (the frame's left) stays open but its surface fixed, since the lot set's tiles read as a repeating
      pattern from the air; then a quick Eevee preview of the whole flyover (`engine=eevee` in render_flyover.py,
      with item 32's timing) handed to the user to check before any Cycles render is restarted.
- [x] 34 The open block across 3rd Street furnished (user 2026-09-27, on the preview's first frame, the big open
      parcel at the bottom of the screen: "esse quarteirao embaixo da tela esta muito vazio. adicione um muro, com
      estacionamento e umas arvores. coisa baixa para nao afetar o predio"): the open parcels kept clear by item 33
      within `CITY_OPEN_S` of 3rd Street become walled parking lots -- a low plaster wall round each with gate
      openings on the street, asphalt with faint bay lines, low trees (about 5-7 m) in rows along the wall and in
      islands -- nothing tall: no shadow on the block, nothing in the reference stand's wedges, nothing under the
      flyover's path; the Eevee preview re-rendered for the user to check.
- [x] 35 The fire-escape shot exposed a stop up (user 2026-09-27: "quando for fazer a tomada na escada de
      incendio, aumente a exposicao em 1. renderize uma imagem para eu ver como ficou a escada"): render_flyover.py
      carries a per-shot exposure and the `escapes` shot renders at +1 over the scene's 0, every other shot as it
      was; one Cycles still of that shot at full size, at 0 and at +1, for the user to see the fire escape.
- [x] 36 The background blur removed (user 2026-09-27, on the quick Cycles cut: "i think the blur is giving the
      impression of a maquete; lets remove the blur and generate again, with same settings"): the depth-driven
      blur off by default (`blur=0`; `blur=7` keeps the earlier look on demand) and the quick half-size cut
      rendered again with everything else as it was.
- [x] 37 The city's buildings taller (user 2026-09-27, on the sharp quick cut: "the buildings in the background are
      disproportionally smaller; increase the height of them"; then "you need to just increase the height, not add
      more floors. it seems that the current floors are small"): the fill's boxes read too low beside the
      five-storey block because their storeys are 3.1-3.4 m where the block's floors are about 4 m, so the storey
      height rises to about 4-4.5 m in every recipe with the windows scaled to suit, the storey counts unchanged,
      the shadow test against the block's pavement still holding and the reference stand's wedges still clear;
      both scenes rebuilt, the approach's first frame and the pull-up's last rendered first for the user, then
      the quick cut again.

Rules:
- Do not edit text of completed items (`- [x]`).
- Add a new item for any fix/change to previously completed behavior.
- You may patch contradictory non-completed (`- [ ]`) items in place.

## Implementation Notes
- (plan, 2026-09-26) The background series, as the user asked ("update the AI with those steps. spawn in sequence,
  agents to implement each step, take a screenshot after each step; mark the progress in the AI file ... at the
  end, show a before and after with all steps implemented"): one agent per step, in this order -- item 1 (the sky
  and sun), item 2 (the ground to the horizon and haze), item 28 (the near context), item 29 (the far context),
  item 8 (street furniture), item 7 (the off-frame neighbour's shadow), item 4 (the sidewalk) -- each rebuilding
  the scene headless, rendering `ref_3q` at full size and shipping a reference | before | after composite
  (`review_2026-09-25/scripts/compose_ref.py`) under `tests/artifacts/screens/bradbury_scene/item<N>_<topic>/`,
  the item ticked here as it lands, and the whole series as one before | after in `ai574_background_final/`.
  Downloads are allowed (CC0), installed in the game's own folders under `assets/` (a shared, gitignored junction),
  each with a `source.json` beside it recording the download page, URL, license, author, date and files. The GUI
  Blender held unsaved changes when the series started, so it is not reloaded with the rebuilt scene.
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
- (cycle 18, 2026-09-26) Item 1, the sky and the sun (the first step of the background series; an agent per step,
  the orchestrator ticking). `kloofendal_43d_clear_puresky` imported into the game: the 2k `.hdr` and a 4k copy in
  `assets/public/lighting/hdri/` with one `kloofendal_43d_clear_puresky.source.json` beside them (Poly Haven, Greg
  Zaal, CC0 1.0, page and download URLs, md5s, date, usedBy), an `IBLCatalog.js` entry
  `KLOOFENDAL_43D_CLEAR_PURESKY_2K` (the default untouched; the assets test passes 2/2). `build_scene.py` takes the
  4k copy by default (`SKIES` names kloofendal / kloofendal_2k / german, or a path; `hdri=<number>` still the
  strength, `strength=` the plain key, `HDRI_STRENGTH` 1.0), reads the map in Cycles' real convention
  (`hdri_sun_direction` returns the map's own sun: azimuth -36.2, elevation 42.9; the mirrored reading is gone),
  turns it `rot=auto` so the disc stands at `sun_az` and puts the lamp (`sun` 8) on the disc (`sun_el=map`); the
  map's sun 6.1 W/m2 plus the lamp against a sky of 1.27 gives 7.6:1 on the ground, the photo's about 8:1. The
  camera's sky is graded on Light Path's Is Camera Ray alone (`SKY_GRADE`: `SKY_SAT` 1.55, `SKY_VAL` 2.4;
  saturation alone collapsed the red, value plus saturation lands the top-left at (132, 182, 222) against the
  photo's (130, 176, 225); a leak test shows the grade leaves the light untouched). Exposure stays 0: the sunlit
  brick is already at the photo's level, the slabs' shortfall (173 against 214) is albedo, item 4's. Measuring the
  photo showed its sun is NOT at -60 but at about +40, behind the camera's RIGHT shoulder: Broadway sunlit
  (196, 147, 115), 3rd Street shaded (101, 66, 51) with no fire-escape shadows, the block's own shadow across 3rd
  Street's road at azimuth -136 from the corner base; the -60 of the Problem section lit 3rd Street to
  (211, 168, 149). Decided the same day by the orchestrator (the measured sun is the reference, and it is the side
  the light came from in the scene the user kept at item 10): `SUN_AZ_PHOTO` 40.0 (rot -76.2), `sun_az=-60` kept
  on demand; the shipped render gives 3rd Street (101, 64, 50) and Broadway (194, 150, 131), the photo's faces
  within 2 levels, and the road's far half in the block's shadow (24, 30, 37) against the photo's (35, 39, 49).
  Left alone: the photo's stronger paling toward the right of the sky (the map's own at 9 degrees up; Nishita not
  needed); flat grey under the horizon beyond the real ground (item 2's); a second shadow edge parallel to the
  block's, 7-8 m further south-east, from another caster to the north-east (item 7's). Evidence
  `tests/artifacts/screens/bradbury_scene/item1_sky/` (`item1_reference_before_after.png`, `item1_sky_crop.png`,
  `ref_3q_after.png`, `ref_3q_after_sun-60_rejected.png`, `item1_sun_alternative.png` photo | rejected -60 |
  chosen +40, `item1_numbers.md`, `tune/`; the measuring scripts `sky_stats.py`, `sky_tune.py`, `measure_sky.py`,
  `brick_mean.py`, `shadow_edge.py`, `unproject_ground.py` beside the review's). README "The sky (AI 574 item 1,
  2026-09-26)". Scene rebuilt headless; the GUI Blender, holding unsaved changes, not reloaded.
- (cycle 19, 2026-09-26) Item 2, the ground to the horizon and the haze. `GND_FAR` 3500 replaces `GND_R` 150: the
  eight far blocks, their kerbs and the four streets' far road quads simply extend, at the same world-space tiling
  (a plain taking over past 150 m would have left kerb and strip ends as seams of their own). The far blocks are
  vacant lots: `kerbed_pavement(..., lot=(M_LOT, PAVE_W))` lays a 4.2 m sidewalk strip (a ring of quads) round an
  interior in `lot_material` -- two of the game's sets laid per random Voronoi cell (`LOT_TILE_M` 9) and traded over
  a `LOT_BLEND_M` 30 m noise (`LOT_BLEND` 0.44-0.56): `LOT_SETS` brown_mud (1.3 m tiles) and rock_ground (4 m),
  picked by each candidate's albedo as it would render beside the photo's slabs (brown_mud (176, 156, 128) nearest
  the photo's dirt (176, 164, 154) in tone, rock_ground nearest in greyness; gravelly_sand (244, 184, 129) far too
  bright; no grass set is dry, so the tufts wait for item 28's wall); no tint, no mottle; the lot renders
  (171, 164, 157) at the photo's spot. The haze: `scn_haze`, a node group made in the sky section (which now
  precedes the ground section) and wrapped round every ground material by `hazed(m)`: Camera Data View Distance
  mapped `HAZE_NEAR` 150 -> `HAZE_FAR` 3000, camera rays only, times Amount, mixing toward an Emission of the sky
  looked up in the ray's own azimuth at the horizon (Incoming flattened, `HAZE_TURN` = the world's turn, the same
  image, `HAZE_GRADE` = the camera grade) -- a constant colour was rejected because the horizon reads
  (185, 195, 209) on the left of the frame and (200, 205, 213) on the right; emission sampling off on hazed
  materials; the factor rendered as itself matches the design to three decimals and is 0 on the block. Found by
  ray-casting the rows: the first pass still showed sky between the plain and the horizon because every camera had
  Blender's default 1000 m clip, so `CAM_CLIP` = 2 x GND_FAR on every camera, and render_wear.py's `cam=` takes the
  scene's. Rows 418-460 now grade from the sky's own (184, 194, 208) into the plain with no step at either edge; sky
  and block ground points identical to step 1 within a level. For the record: the shaded 3rd Street face fell from
  (101, 64, 50) to (85, 53, 42) -- bounce, not haze: the lots' albedo gives 6 levels and the old catcher's default
  0.8-grey material (a bright plane beyond 150 m to every non-camera ray) the other 10 (`face_bounce.py`); item 4's
  albedo and items 28 / 29 will move it again. Evidence `tests/artifacts/screens/bradbury_scene/item2_ground_horizon/`
  (`item2_reference_before_after.png`, `item2_horizon_left.png`, `item2_horizon_right.png`,
  `item2_along_3rd_street.png` a standing eye on 3rd Street looking west, before | after, `ref_3q_after.png`,
  `item2_numbers.md`, `tune/`); scripts `lot_colours.py`, `debug_haze.py`, `probe_rows.py`, `face_bounce.py` beside
  the review's. README "The ground to the horizon, and the haze (AI 574 item 2, 2026-09-26)". Scene rebuilt
  headless; the GUI Blender not touched.
- (cycle 20, 2026-09-26) Item 28, the near context as geometry. The photo's elements were read by column
  (`column_edges.py`) and unprojected through the stand (`context_frame.py`): the right side lands -- the grey
  wall's base falls on the N lot's strip edge, and a 2 m wall there projects to 0.562-0.600 against the photo's
  0.565-0.61 -- the left cannot quite: the photo's low wall unprojects onto the block's own south pavement
  (82-94 m; the photo's Bradbury has its lot against its west end) and the scene's 13 m west street puts the
  nearest lot edge at 113 m, 0.02-0.06 higher in the frame (left as the streets give it: no scene dimension
  changes). The game's 15 trees are imported once by the new `build_context.py` into
  `tests/artifacts/blender/bradbury/portal_project/context_library.blend` (metres, z up, the trunk's foot on z 0,
  `height` / `crown_z` / `radius` on each mesh, `ctx_leaf` with the TGA alpha cut-out on both faces,
  `LEAF_TRANSLUCENT` 0.15 and a `LEAF_TINT` node, `ctx_trunk`; regenerate with `blender -b -P build_context.py --`,
  about 40 s, `sheet=1` renders the fifteen in a row); `build_scene.py` (`context=on|off`) links them and places
  29 from `TREES` as local objects sharing the linked meshes, with hazed local material copies as object slots
  (`LEAF_TINT` (0.50, 0.42, 0.42): the game's foliage rendered (163, 172, 111) sunlit against the photo's
  (110, 104, 63); now (116, 104, 72), the shaded side (59, 56, 24) against (52, 51, 31); translucency 0.30
  glowed and was rejected). Walls as boxes in the game's sets, chosen by measured render (a sunlit east face takes
  about 4.3x its albedo, a shaded south face about (0.28, 0.20, 0.16)x): the W lot ringed by `LOW_WALL_H` 1.2 dark
  plaster, the `CREAM_YARD` with 3.5 m walls 2 m behind it so the cream rises from the low wall's top as the
  photo's does (a 2.4 m wall 18 m in left a grey band under it, rejected), the N lot's `RET_WALL_H` 2.0 in
  plastered_wall_02 lifted (1.45, 1.6, 1.8) ((130, 109, 101) against (135, 119, 107); rough_concrete and an even
  lift rejected), `FENCE_H` 1.8 with posts, a rail and a procedural 6 cm diamond lattice card (12% veil),
  `SHED_N` a 6 m tan warehouse whose top lands at 0.440 as the photo's. The hedge is trees 4 / 1 / 3 scaled to
  `HEDGE_H` 1.3-1.7, sunk 0.3, every 0.5-0.7 m, `HEDGE_OFF` 2.1 inside the kerb (at the wall's foot it hid the
  wall; sparser and taller it read as saplings); the tufts are 6370 blades in one mesh along the low wall. Roads,
  pavements and sky identical to step 2 within a level: nothing new shadows the road or the block (every shadow
  runs west-south-west at 1.08 x height). Caveats: the hedge is a third the photo's height in the frame (the
  north street lies where the photo's hedge stands); the low wall's visible face is sunlit here where the photo's
  is shaded. Evidence `tests/artifacts/screens/bradbury_scene/item28_near_context/`
  (`item28_reference_before_after.png`, `item28_left.png`, `item28_right.png`, `item28_tree_closeup.png` a
  standing eye among the N lot's trees, `ref_3q_after.png`, `item28_numbers.md`, `tune/` with the library sheet
  and the wall-and-hedge close-up); scripts `context_frame.py`, `sample_points.py`, `probe_frame.py`,
  `column_edges.py` beside the review's. README "The near context: walls, hedges and the game's trees (AI 574
  item 28, 2026-09-26)". Scene rebuilt headless; the GUI Blender not touched.
- (cycle 21, 2026-09-26) Item 29, the far context. The photo's far background read by column and at 6x (new
  `zoom_crop.py`) and unprojected through the stand (`context_frame.py`): where an element's top and base both
  show they agree (the trailers 346-354 m, the second tan wall 226-236 m), the brick stands in front of the white
  (its foot hidden), and the "taller block" at x 0.01-0.03 has its top under the horizon, a 12 m block whose
  distance sets its tone. Built as geometry only, no cards and so no Track To: `FAR_BOXES` (the brick in
  `red_brick` tinted (0.45, 0.42, 0.42), the white in the plaster lifted (1.25, 1.27, 1.30), a cream one, a white
  10 m sliver at 1.1 km, `tan2` 5.2 m at 231 m shallow and unparapeted with its own lift (1.9, 1.3, 0.78), `tall` a
  matte near-black at 800 m), `TRAILERS` ten 2.5 x 12.5 x 2.6 m bodies on 1.3 m of wheels with east-west axes so
  the stand sees sunlit ends (north-south showed only shaded ends: grey), the seventh blue, `FAR_TREE_ROWS` 501
  instances in staggered pairs (`FAR_ROW_PAIR` 8) of models 1-10 with a darker leaf and bark (`FAR_LEAF_TINT`
  (0.28, 0.25, 0.22), `FAR_TRUNK_TINT` (0.40, 0.38, 0.36)) at 360 / 520 / 700 m, a far line at 1.3 km behind the
  skyline and two edge emergents at 600 m, scrub at 730-1030 m, and `SKYLINE_ROWS` 31 boxes at 1.2-2.1 km in
  `FAR_PLAIN` white / grey 0.12 / dark 0.03. Two findings: (1) `hazed()` wrapped the leaf's transparent branch,
  so every tree beyond 150 m rendered a pale ghost ((169, 169, 172) at 450 m) -- `hazed(at=)` now hazes inside
  `LEAF_CUTOUT` and `FENCE_WIRE`, the line then reading (138, 139, 130) as predicted; (2) the film is AgX Medium
  High Contrast, measured by the new `agx_curve.py` (0.2 -> 125, 0.5 -> 178, 1.0 -> 208, 2.0 -> 229), and a PNG's
  sRGB curve is not its inverse: with the table the haze's floor is (129, 140, 162) at 1.2 km and the photo's far
  hill (166, 175, 182) is 1.4-1.6 km of our haze, a sunlit east face takes 3.4 x albedo plus 0.06 of Principled
  sun sheen, so the tall block moved from 1.2 km to 800 m (`FAR_SPEC` cuts its sheen) and the far line to 1.3 km;
  the haze itself untouched. Item 28's W-wedge trees were re-graded to the photo's own rows (7.5-9 m at x
  0-0.035, two narrow 13.5-14 m crowns with trunks behind the block's edge) because its 13-14 m crowns hid every
  left box; nothing else of item 28 moved, and every road, pavement, block, sky and near-context point is
  identical to the level. Results: every layer on the photo's row within 0.005 on both sides; tall block
  (117, 130, 148) vs (111, 126, 138), white (225, 222, 218) vs (222, 218, 206), brick (171, 136, 122) vs
  (165, 130, 105), trailers (204, 205, 207) vs (208, 208, 206), warehouse (130, 107, 90) vs (137, 110, 92);
  residuals: the tree lines 20-35 levels paler than the photo's (the haze's floor at 360 m and 1.3 km), the
  white's east face where the photo has a bluish pale wing. Rejected: trailers with north-south axes, the tall
  block at 1.2 km, a 12 m white at 412 m, a 30 m deep warehouse, the 1.5 km tree row (pale pink bark), sparse
  emergents (lollipops), one-row lines (pale saplings), the warm plaster for the skyline (pink). Cost: the far
  section 0.03 s of a 7.6 s build, the full render 34 s. Evidence
  `tests/artifacts/screens/bradbury_scene/item29_far_context/` (`item29_reference_before_after.png`,
  `item29_left.png`, `item29_right.png`, `item29_horizon_band.png`, `ref_3q_after.png`, `item29_numbers.md`,
  `tune/`); scripts `zoom_crop.py`, `agx_curve.py` beside the review's. README "The far context: boxes, tree lines
  and the skyline (AI 574 item 29, 2026-09-26)". Scene rebuilt headless; the GUI Blender not touched.
- (cycle 22, 2026-09-26) Item 8, street furniture. The photo's furniture measured before anything was placed (new
  `pole_extent.py`, `find_covers.py`, `cover_size.py`, `post_height.py` beside the review's scripts;
  `item8_furniture/item8_numbers.md`), and two readings overturned: both tall posts' heads stand ABOVE the horizon
  (0.258 and 0.224 against 0.32), so they are higher than the eye whatever their distance -- high-mast lot lights
  whose height is what the head's ray gives at the foot -- and neither foot shows: the west pole shows against the
  sky, the white and brick boxes and through the crowns to 0.49 and never against the tan wall (so it stands
  between that wall and the trees: inside `CREAM_YARD`, 123 m, 18.4 m, pale grey), the north pole is dark
  ((43, 38, 39) across the trailers) and ends at the near warehouse's top with nothing against the tan wall below
  (behind `SHED_N`, 149 m, 22.1 m; the brief's "base 0.67" was the far pavement at 74 m, our north street's road).
  `LAMP_POSTS`, `tall_post` (a tapered 12-sided pole `POST_TALL_R` 0.11 -> 0.05 on a flange, `POST_BAR` 1.0 m
  crossbar with a `POST_LUM` luminaire straddling each end, turned broadside, `POST_PAINT` grey 0.22 / dark
  0.028 / head 0.03, matte). The black lantern post's foot unprojects into 3rd Street's roadway (the photo's far
  pavement is our road, and the S lot's strip never enters the frame), so it stands on the block's own south
  pavement on the same ray, 0.43 m inside the slabs, where the head's ray gives 3.96 m: Poly Haven's
  `street_lamp_01` (Josh Dean, CC0 1.0, the photo's silhouette at 4x) at its own 3.87 m, installed at 1k in
  `assets/props/street_lamp_01/` with `source.json` (page and download URLs, license, author, date, md5s, usedBy;
  gitignored: `.gitignore:2:/assets`), imported by `build_context.py` (`PROPS`, images referenced not packed,
  materials renamed `ctx_prop_*`, emission zeroed) and linked and placed by `build_scene.py` (`PROPS`,
  `place_prop`, hazed material copies as object slots; `furniture=on|off`). Four covers, not three, found by
  local contrast 0.06 lower than the brief's numbers and sized from their pixel boxes (0.7 x 0.5 to 0.9 x 0.6 m):
  `COVERS`, two boxes each (`COVER_RIM` frame 1 mm proud as the hairline recess, plate 3 mm proud, nothing cut,
  `COVER_GAP` 0.35 from the slabs' edge); Broadway's two unproject 1.7 / 3.3 m into the road (the photo's
  Broadway pavement is wider toward the right edge) and stand at the gap on the photo's frame x; the steel took
  three passes to a third of the pavement's albedo with the specular cut (`COVER_STEEL` (0.072, 0.055, 0.042),
  `COVER_STEEL_SPEC` 0.25): plates 0.72-0.79 of the slabs against the photo's 0.64-0.75. No storm drain and no
  hydrant: every kerb-foot mark zoomed and identified (kerb faces, gutter dirt, cracks, glass, plinths); none
  stands. Rendered: heads at 0.2605 / 0.2245 (photo 0.258 / 0.224), poles at x 0.0361 / 0.9777, the lantern at
  0.540 (0.5375); all 24 consistency points identical to the level; every shadow west-south-west onto the lots
  and strips or outside the frame, none on the block. Left: the first cover sunlit where the photo's sits in the
  block's shade (our shadow edge on the south pavement lies 1.2 m west of the photo's: the block's own geometry
  and item 1's +-4 degrees); the black post's foot 0.026 higher and in shade; Broadway's covers 0.04-0.05 higher
  (our kerb line against the photo's wider pavement). Evidence
  `tests/artifacts/screens/bradbury_scene/item8_furniture/` (`item8_reference_before_after.png`, `item8_left.png`,
  `item8_right.png`, `item8_pavement.png`, `item8_closeup.png` the lantern post from 8 m and a cover from 5 m,
  `ref_3q_after.png`, `item8_numbers.md`, `tune/`). README "Street furniture (AI 574 item 8, 2026-09-26)".
  Library and scene rebuilt headless; the GUI Blender not touched.
- (cycle 23, 2026-09-26) Item 7, the off-frame neighbour's shadow. The photo's second shadow measured before
  anything was placed (new `band_edge.py`, `ground_map.py`, `ground_intervals.py`, `fit_neighbour.py`,
  `overlay_frame.py` beside the review's scripts; `item7_neighbour_shadow/item7_numbers.md`): its west edge on 21
  columns (x 0.08-0.48) unprojects to one straight ground line from (22.4, -22) to (10.1, -30.5) at azimuth -144
  (a sun at 36; the block's own edge read -136 in item 1, the scene's +40 stands), 0.16 m of scatter -- a vertical
  edge's shadow, so another building's north-west corner north-east along the line, on the E lot across Broadway
  -- and the band has no other edge in the frame: it runs to the frame's bottom and left edges (item 1's "x 0.3 to
  0.75" was wrong: the left edge to x 0.52; the apparent south end at y -30.8 is the photo's far kerb of 3rd Street,
  its pale pavement (116, 121, 131) concrete in the same shade, where our 13 m roadway runs on). The scene's line,
  at the lamp's -140, slid across the points to the offset nearest the photo's edge on every column
  (`NEIGHBOUR_EDGE` (19.38, -23.89)). The caster: `NEIGHBOUR_X` 42.5 (at 41.6 the tower's south-west vertical edge
  passed through the frame's bottom-right corner; at 42.5 it clears it by 0.044 and all eight corners lie right of
  the frame at every height), the north face y -4.49 computed from the edge and the lamp's azimuth, `NEIGHBOUR_S`
  -17.0, `NEIGHBOUR_W` 26; the height is what carries the shadow to where the line leaves the frame's left edge,
  (10.8, -31.1), 41.4 m from the corner at 1.08 x height: `NEIGHBOUR_STOREYS` 12 x `NEIGHBOUR_STOREY_H` 3.3 =
  39.6 m, the class of building across Broadway from the real Bradbury (three to six storeys would have carried
  the edge 11-22 m, to the frame's bottom edge at most: no band). Sun rays from the block's corners reach the
  tower's west face 26-31 m up and north of its north face; the shadow's line passes 0.22 m south-east of the
  pavement's corner and 2.3 m clear of the curb return: apron, kerb, shopfronts and Broadway's face stay sunlit.
  Built by the far context's `building()` under `neighbour=on|off`: the tower in the cream plaster, a two-storey
  `NEIGHBOUR_WING` (0.25, 0.5, 20, 20, 7.5) along Broadway in the far brick (set back and overlapping so no faces
  coincide; its shadow ends on the E lot's strip 0.08 below the frame's corner); hazed; no camera sees either box
  (st_corner 50 degrees off axis against a half field of 32.7, hero_3q 29+ against 23). Rendered: the edge at
  -140.4 through the photo's centroid, within 0.005 of the photo's on x 0.18-0.36, 0.0125 at worst at x 0.08 (the
  four degrees); the band (31, 36, 43) against the block's shadow (19, 26, 34), 1.6x as the photo's is 1.4x; the
  block's own shadow unchanged; sky, horizons, north street, Broadway, walls, foliage, far context and the frame's
  bottom-right corner identical to the level. What moved is the crossing's light: the shaded 3rd Street face's
  brick mean (85, 53, 42) -> (79, 50, 40), the Broadway face (190, 147, 128) -> (189, 145, 126), the apron -2, the
  road in the block's shadow -4, the grey wall +4 (bounce off the tower's sunlit north face) -- two thirds of the
  asphalt that bounced into the shaded face is in the tower's shadow now, as in the photo, whose shaded face still
  reads (101, 66, 51): the scene's shade budget (items 1-2), not the tower's. st_corner stands 1.1 m outside the
  shadow and looks across a crossing whose south-east quarter is in shade. Evidence
  `tests/artifacts/screens/bradbury_scene/item7_neighbour_shadow/` (`item7_reference_before_after.png`,
  `item7_bottom_band.png`, `item7_from_above.png` with the stand's frame footprint drawn on, `ref_3q_after.png`,
  `item7_numbers.md`, `tune/`). README "The off-frame neighbour's shadow (AI 574 item 7, 2026-09-26)". Scene
  rebuilt headless; the GUI Blender not touched.
- (cycle 24, 2026-09-26) Item 4, the sidewalk (the last step of the background series). The photo laid back onto
  the slabs' plane through the stand as 3 cm top-down maps and profiled (new `pavement_map.py`,
  `pavement_profiles.py`, `wall_base_tone.py` beside the review's; `item4_sidewalk/item4_numbers.md`): the
  transverse pitch 2.0 m (Broadway's consecutive dips 1.95-2.0 apart; 3rd Street's strong dips about 4 m apart
  with fainter ones between, the same scoring with alternating strength), the longitudinal joint 1.1 m inside the
  kerb top (just inside cover C3), the fan five slabs to the quadrant with an arc joint continuing the
  longitudinal one, the photo's Broadway pavement about 6 m wide with a kerb course reading 0.62-0.78 of the
  slabs (nothing of the streets changed), the wall-base line 27-44 levels in its first decimetre and gone by
  0.4-0.5 m. `pavement_material` replaces `ground_material` on the pavement: `kerbed_pavement` writes each piece's
  kerb rectangle as the `pad_lo` / `pad_hi` object properties an Object Attribute node reads, and from world
  metres the shader lays transverse joints at `PAVE_PITCH` 2.0 fitted to each side's run (26 slabs of 1.98 on the
  block's south side, the returns' tangent lines being the first and last joints and the fans' first and last
  radials), the longitudinal joint `PAVE_LONG` 1.1, on every corner square `PAVE_FAN_N` 5 radials about the
  return's centre and the arc at `PAVE_ARC_R` 3.55, each joint a 12 mm groove (`PAVE_JOINT_W`, `PAVE_JOINT_DARK`
  0.55) with chamfered lips in the normal (`PAVE_JOINT_BEVEL` 6 x 3 mm) and dirt over 5 cm (`PAVE_JOINT_DIRT_M`,
  `PAVE_JOINT_DIRT` 0.35, roughness +0.2), the transverse and radial ones at their own strength
  (`PAVE_JOINT_VARY` 0.45-1 from a white noise of the index), the kerb top's step with the same dark line and 5 cm
  of dirt from the geometry, every slab its own tone (`PAVE_SLAB_VARY` 4% from a white noise of its indices), no
  mottle, nothing cut. The set changed: with the joints over the paver set its own 0.65 m pavers showed as a
  second grid (`debug_pave.py`, the albedo rendered as itself), so the slabs are `PAVE_SET` rough_concrete, the
  game's one plain poured concrete (`tune/concrete_sets_sheet.png`), its grain halved (`PAVE_GRAIN` 0.45) and
  normal at `PAVE_NORMAL` 0.35 (as it comes it read as stucco from 6 m); `PAVE_TINT` (0.96, 0.60, 0.41) by the AgX
  table (the photo's (215, 192, 169) over the paver set's (192, 183, 173) is (1.85, 1.21, 0.92) linear, tempered
  in red to keep the shaded slabs neutral, then (1.29, 1.26, 1.06) more after the set's packed AO rendered 9-12
  short); exposure 0. The grime line is an Ambient Occlusion read of the walls and plinths (`PAVE_GRIME_M` 0.7)
  mapped `PAVE_GRIME_OCC` 0.04-0.24 to `PAVE_GRIME` 0.6 toward `PAVE_GRIME_TINT` (0.50, 0.40, 0.31): the occlusion
  rendered as itself reads 0.27 at a pier's foot and 0.19 at a shopfront's (the AO rays pass through the glass to
  the recess floor), so the first mapping to 0.45 left 3 levels. Results: the apron's slabs (215-218, 190-195,
  170-175) against the photo's (212-219, 189-196, 166-174) at four pure-slab points (the old "(0.44, 0.92)" point
  is the kerb's rolled edge); the same profiles find our dips every 1.98 m at 3-11%, the fan search peaking at
  the return's centre; the wall-base line 19-20 levels over the first 0.25 m, gone by 0.5; the kerb-top joint 15
  levels within 5 cm; the shaded slabs (39, 34, 32) against the photo's (68, 71, 79), the scene's shade budget;
  sky, horizons, roads, cornice, walls, foliage and far context identical to the level, the faces +3-4 red and
  the N lot's grey wall +8 on the pavement's bounce. Left: the grime line is a plateau where the photo's is a
  ramp; the kerb's top course 0.86 of the slabs against the photo's 0.62-0.78; the photo's fan centre is at its
  chamfer foot where ours is the return's centre. Four passes (the second grid; stucco and 9-12 short; the grime
  at 3 levels; shipped). Evidence `tests/artifacts/screens/bradbury_scene/item4_sidewalk/`
  (`item4_reference_before_after.png`, `item4_pavement.png`, `item4_corner_zoom.png`, `item4_apron_closeup.png`
  from a 6 m stand before | after, `item4_wall_base.png`, `ref_3q_after.png`, `item4_numbers.md`, `tune/`); the
  step-6 scene kept as `bradbury_scene_pre_item4.blend`. README "The sidewalk: scored slabs, the fan and the
  grime line (AI 574 item 4, 2026-09-26)". Scene rebuilt headless; the GUI Blender not touched. The series'
  before | after with every step: `tests/artifacts/screens/bradbury_scene/ai574_background_final/`.
- (cycle 25, 2026-09-26) Item 31, the composing-only boxes dressed as buildings. `facade_material` in the far
  context section copies a hazed set material and cuts window bays into it in the shader: the box's Object metres
  and true normal give the coordinate along the face (x-faces along y, y-faces along x) about the face's centre
  and the height over the ground line, both read from the new `fac_lo` / `fac_hi` object properties `building()`
  writes (the pavement's pad_lo / pad_hi pattern); whole windows only, `FAC_PIER_MIN` 0.5 from the corners,
  nothing on a roof, a parapet or under the ground; dark bluish glass (`FAC_GLASS` (0.020, 0.032, 0.050),
  `FAC_GLASS_ROUGH` 0.12, its own BSDF before the haze group) inside a masonry reveal `FAC_REVEAL_W` 0.15 tilted
  in a Bump of `FAC_REVEAL_D` 0.12 under the set's normal map, sill and lintel bands `FAC_TRIM_H` 0.12 proud by
  `FAC_TRIM_PROUD` in `FAC_TRIM_TINT` (1.12, 1.10, 1.06), blinds on `FAC_BLIND_SHARE` 0.28 of the windows by a
  white noise of bay, storey and face; `FACADES` recipes `low` (3.0, 2.7, 1.3 x 1.5, 0.9) for the brick, white and
  cream boxes (a ninth `FAR_BOXES` field) and `warehouse` (clerestory lights) for tan2; `NEIGHBOUR_FACADE` (3.6 m
  bays, 1.6 x 1.7, the ground storey a lobby's 2.6 x 2.4 glazing) and `NEIGHBOUR_WING_FACADE` (a 3.6 m shop
  storey under sash windows) dress the tower and wing; geometry untouched, shadows unchanged. Rejected: 3.0 m bays
  (one column on an 8 m face), blinds at (0.30, 0.28, 0.25) (208 on the film against the plaster's 216, a boarded
  opening). Reference view: every item 4 consistency point identical to the level; only the boxes' own pixels
  moved (1383 of 2.46 M over 6 levels, the window rows at x < 0.08 and the clerestory row at x > 0.90). Evidence
  `tests/artifacts/screens/bradbury_scene/item31_dressed_boxes/` (`item31_reference_before_after.png`,
  `item31_left.png`, `item31_right.png`, `item31_tower_standing.png`, `item31_tower_60m.png`,
  `item31_far_boxes_standing.png`, `ref_3q_after.png`, `item31_numbers.md`, `tune/`). README "The flyover, and
  the boxes dressed (AI 574 items 30 and 31, 2026-09-26)". Scene rebuilt headless; the GUI Blender not touched.
- (cycle 26, 2026-09-26) Item 30, the flyover. New `render_flyover.py` beside the builder (render_wear.py's
  manner: opens the scene, adds the camera, the compositor and the output in memory, never saves): portrait
  1080 x 1920, 24 fps, six 3 s shots eased in and out and cut hard -- `air` (24 mm, from (36, -103, 60) down onto
  the reference stand's own framing: the one pose on that axis where the whole block fits and the tower clears
  the frame, checked by `check=1`'s `world_to_camera_view` projections), `cornice` (50 mm dolly at the crown's
  height 14 m off Broadway's face), `escapes` (40 mm rise on the shaded 3rd Street face), `up` (24 mm standing
  eye 3.8 m from the wall tilting 58 to 68 degrees), `portal` (35 mm push-in from the roadway 3.5 to 2.1 m north
  of the axis so all four leaves of the door show past the arch; from the south the near pilaster hid a leaf),
  `close` (a pull-up from the reference framing to 30 m, swinging south so the tower stays out). Background
  softened by a depth mask driving a Bokeh Blur (`BLUR_PX` 7, `BLUR_START_M` 2 past the block's farthest corner
  per frame, `BLUR_FULL_M` 400, `MASK_SOFT_PX` 2): the Mist pass was rejected by rendering it (`debug=mist`, it
  speckled on every pane, 98-117 of 255, throughput-weighted hits through the glass); the Depth pass reads 0 on
  every probed block point; film untouched. Artifacts checked at a quarter size in every shot's first, middle
  and last frame (`tune/pass1_*`, `pass2_*`): the approach's start moved from (30, -125, 75) to (36, -103, 60)
  (the tower's base corner at x 0.93-0.98, the block small), an end 30 m over the stand rejected (tower at 0.90),
  the pull-up capped at 30 m (the roof filled the frame at 40), the library shelf collection excluded on the view
  layer (no prototype at the origin in any frame), catcher / tufts / fence / lot edges / hedge fine. Rendered 432
  frames at 64 spp in 90.8 min (12.6 s a frame: 8-9 s on the wide shots, 13.5-16.5 s on the close-ups), encoded
  through a sequencer-only scene (`media_type` VIDEO, H.264 HIGH, no audio, Standard view transform) to
  `tests/artifacts/screens/bradbury_scene/flyover/bradbury_flyover_portrait_1080x1920.mp4`, 14.97 MB, 18.0 s;
  decoded frames within 1.6-1.8 levels of their PNGs. Left: hard cuts (no crossfades); the fire-escape shot dark
  by design (the shaded face); the approach's first frames show the lots' cell pattern and the block's flat white
  roof (the scene's own ground and the model's own roof). Evidence `flyover/` (`flyover_shots_sheet.png`,
  `frames/<shot>/`, `flyover_numbers.md`, `render_full.log`, `tune/` with the sheets, masks, door stands, 1:1
  checks, decoded frames); scripts `flyover_sheet.py`, `door_angle.py` beside the review's. README as item 31's.
  The scene never saved by the script; the GUI Blender not touched.
- (cycle 27, 2026-09-27) Item 33, the city filled in, the open ground fixed, the Eevee preview. `build_scene.py`
  gains a city section (`city=on|off`, the last thing built): secondary streets walked out from the main
  streets' interior edges (`CITY_PITCH` 80-120, `CITY_STREET_W` 12-14, to `CITY_EXTENT` (-1060, 700, -700, 950))
  as flat quads in the road material 5 mm over the lots (`CITY_ROAD_LIFT`; `ptone` 1, or they render black),
  snapping beside item 29's tree lines so they became tree-lined streets, segments crossing anything left out;
  155 parcels with `CITY_WALK` 3 m pavement bands, cut into lots of `CITY_LOT_MAX` 45 with `CITY_SETBACK` and
  `CITY_FOOT` 12-44, halved round obstacles; 1541 boxes by `city_building()` -- storeys by distance
  (`CITY_STOREYS`: 118 / 597 / 562 / 264 of one to four), `CITY_FACADES` recipes through `facade_material`'s
  new `tint_attr` (`city_tint`, `CITY_TINT` 0.85-1.15 per box), nine sets (`CITY_SETS`, four shared with the
  context), pale plain roofs (`CITY_ROOFS`) with bulkheads and plant boxes, parking lots with faint `CITY_BAY`
  lines, 35 facade materials; 4058 of the game's trees (along the streets every 10-15 m within 500 m, half as
  often beyond; on the main streets' strips beyond 150 m; in yards; no palms: Poly Haven's 521 CC0 models hold
  none). An occupancy list keeps everything of items 7, 8, 28 and 29 standing and untouched; the reference
  stand's two wedges (from its own frame, `REF_BLOCK_X`) stay clear of every new box and tree; the S / SE / SW
  parcels within `CITY_OPEN_S` 150 m stay open (the user: the left side's pavements need no content); every
  box's shadow polygon is tested against the block's pavement (the least 16.4 m off). The open ground:
  `lot_material` fades with camera distance over `LOT_FADE_M` 25-60 m to the sets' own measured means
  (`LOT_SET_MEANS`), AO 1, mean roughness, no normal: the S lot's 60 m luminance spread 8.4 -> 0.5 at the same
  tone (the tiles had read as a defective pavement from the air). Three passes (a suburb under 7-12 m trees;
  denser but the N lot's first parcels voided by one post; lots halved round obstacles, shipped: footprints
  59 / 51 / 59% of the parcels' ground by band). The reference view: every consistency point identical except
  the warehouse's clerestory row +11 red (bounce) and the shaded face +2; the wedges unchanged.
  `render_flyover.py` gains `engine=eevee` (`EEVEE_SAMPLES` 8, shadows 2 x 6 in a 1024 MB pool, screen-space ray
  tracing, the horizon scan, the world's sun extracted over `EEVEE_SUN_THRESHOLD` 10, cut-outs shadowing as
  cut-outs, the same compositor and film); the worn block's materials exceed Eevee's per-shader attribute limit
  and render magenta, so the preview opens the wear=off scene (`bradbury_scene_wear_off.blend`, built with
  `wear=off`, the same city) and shows the block clean; at full size 5.5-6.1 s a frame, so 50%: 768 frames in
  22.1 min (1.73 s a frame), `flyover/bradbury_flyover_eevee_preview.mp4` 7.2 MB, 32.0 s, `flyover_eevee_sheet.png`.
  Not to be judged on the preview: the wear, the haze and bounce (the shaded face near black), the grime lines,
  the glass, the translucency. Item 32's stale Cycles frames deleted; no Cycles run restarted (the user checks the
  preview first); item 32's timing kept in the script. Evidence `tests/artifacts/screens/bradbury_scene/item33_city_fill/`
  (`item33_reference_before_after.png`, `item33_left.png`, `item33_right.png`, `item33_city_reference.png`,
  `item33_open_ground_60m.png`, `item33_open_ground_air.png`, `item33_first_frame.png`, `ref_3q_after.png`,
  `item33_numbers.md`, `tune/`) and `flyover/` (the preview MP4, `frames_eevee/`, the sheet, `render_eevee.log`);
  scripts `census.py`, `set_means.py` beside the review's. README "The city filled in, and the Eevee preview
  (AI 574 item 33, 2026-09-27)" plus a paragraph in the flyover section. Scene rebuilt headless; the GUI Blender
  not touched.
- (cycle 28, 2026-09-27) Item 34, the open block furnished. The parcels item 33 kept open within `CITY_OPEN_S` of
  3rd Street (the first row south of it, thirteen across the fill, the S parcel under the approach's first frame
  and the SE parcel with the stands among them) are walled parking lots now, by `open_lot()` in the city section
  over the `open_cells` the parcel loop sets aside: a cream plaster wall `OPEN_WALL_H` 1.1 x `OPEN_WALL_T` 0.20
  under a pale `OPEN_WALL_CAP` (0.30, 0.05), `OPEN_WALL_IN` 0.30 inside the parcel's edge in item 28's ring manner,
  `OPEN_GATES` 2-3 gates of `OPEN_GATE_W` 6 m between `OPEN_GATE_POST` 0.35 x 1.5 posts; inside it an
  `OPEN_STRIP_W` 1.5 m planting strip of the lot's own ground, the asphalt with the city's `CITY_BAY` lines and
  `OPEN_ISLANDS` two islands a lot (four bays, two trees each); 591 trees of `OPEN_TREE_H` 5-7 m every
  `OPEN_TREE_STEP` 8-12 m, none within `OPEN_CLEAR_R` 35 m of the reference stand's foot (the approach and the
  pull-up settle there; st_corner now stands inside the SE lot's wall, its cap 18 degrees under that frame's
  bottom); the open ground's secondary streets laid (354 segments). 13 lots, 85 wall runs, 33 gates, 26 islands;
  the lots' shadows at least 17.8 m from the block's pavement and falling away from it (asserted with the
  city's); the stand's wedges point the other way, and every consistency point of the reference view is
  identical to the level (census 6,171 px, noise on the block's facades, mean 0.33); `check=1` unchanged; the
  quarter first / middle / last frames of `air` and `close` show the lot filling the first frame's lower left and
  only its corner wall and two or three low crowns at the bottom-left from frame 60 on. Both scenes rebuilt
  headless; the Eevee preview re-rendered from the wear=off scene (768 frames, 24.2 min, 1.89 s a frame,
  `bradbury_flyover_eevee_preview.mp4` 7.7 MB, 32.0 s; the previous kept as `_v1` with its sheet and log).
  Evidence `tests/artifacts/screens/bradbury_scene/item34_open_block/` (`item34_reference_before_after.png`,
  `item34_open_ground_60m.png`, `item34_open_ground_air.png`, `item34_first_frame.png` beside the user's marked
  frame, `item34_close_end.png`, `ref_3q_after.png`, `item34_numbers.md`, `tune/`) and `flyover/` (the MP4,
  `frames_eevee/`, `flyover_eevee_sheet.png`, `render_eevee.log`). README "The open block furnished (AI 574
  item 34, 2026-09-27)". The GUI Blender not touched; no Cycles flyover run.
- (cycle 29, 2026-09-27) Item 35, the fire-escape shot exposed a stop up. `render_flyover.py` carries
  `EXPOSURE_BY_SHOT` = {"escapes": 1.0} (`expo=<shot>:<stops>` overrides for a run): the value goes onto
  `scene.view_settings.exposure` over the scene's own 0 (`BASE_EXPOSURE`) for that shot's frames only and is put
  back before the next shot, in both engines, printed with the PROFILE and FRAME lines; the encode untouched. The
  user's still: frame 60 of `escapes` at 1080 x 1920 and 128 samples from the canonical worn scene (item 34's
  rebuild), at 0 and at +1 (`item35_escapes_exposure/escapes_060_exposure0.png`, `escapes_060_exposure1.png`, side
  by side `item35_escapes_0_vs_1.png`, 48 s a frame): the shaded brick beside the escape from 56 to 90 on the
  film (p50), the escape's iron from 13 to 27, the sunlit shopfront band at the foot 74 to 116, unclipped
  (`item35_numbers.md`). The Eevee preview re-rendered for item 34 carries the +1 on that shot. README: a
  paragraph "The fire-escape shot exposed a stop up (AI 574 item 35, 2026-09-27)" in the flyover section. No
  Cycles flyover run.
- (cycle 30, 2026-09-27) Item 36, the background blur removed. On the first quick Cycles cut (half size, 32
  samples, 26 min, `flyover/bradbury_flyover_quick_540x960_blur.mp4`) the user read the depth-driven softening as
  a scale model, so `render_flyover.py`'s `BLUR_PX` defaults to 0 (the compositor then stays off; `blur=7` gives
  the earlier look back) and the quick cut was rendered again with everything else as it was: 768 frames, 26 min,
  `flyover/bradbury_flyover_quick_540x960.mp4` 9.7 MB, 32.0 s, `flyover_quick_sheet.png`. The full-size Cycles
  cut of item 32 still waits on the user's word.
- (cycle 31, 2026-09-27) Item 37, the city's buildings taller -- by their storeys' height, not their count (the
  user: "you need to just increase the height, not add more floors. it seems that the current floors are small";
  the block's five floors are 20.5 m, 4.1 m each, and item 33's 3.1-3.4 m storeys made a four-storey box 13 m).
  `CITY_STOREYS` untouched (118 / 597 / 562 / 264 of one to four over the same 1541 boxes); `CITY_FACADES` lifted:
  flats 3.1 -> 4.0 m (1.4 x 2.0 windows on 1.0), offices 3.4 -> 4.4 (2.0 x 2.4 on 0.9), shops 3.3 -> 4.2 under a
  4.8 m shop storey of 2.8 x 3.6 openings, the shed 5.5 -> 6.5; a four-storey box 16.7-18.3 m to its parapet. New
  `CITY_SHADOW_MIN` 1.0: a box is lowered a storey at a time until its shadow clears the block's pavement by that
  much -- none needed it; the least clearance 14.5 m (city_bld_1009, NE lot, 11.1 m), the lots' 17.8 m, the wedges
  clear, items 7 / 28 / 29 / 34 untouched. A first pass that raised the storey counts (the orchestrator's brief
  before the user's correction) was reverted before any render. Both scenes rebuilt headless; the approach's
  first and the pull-up's last frames at half size before | after (`item37_air_1_before_after.png`,
  `item37_close_168_before_after.png`: the boxes behind the block rise by a third, the two-storey row across the
  north street to half the block, the three- and four-storey ones to its cornice line); the reference view for
  the record identical at every consistency point (census 13,130 px of pane noise, mean 0.35;
  `item37_reference_before_after.png`, `_left`, `_right`, `ref_3q_after.png`, `item37_numbers.md`); the quick cut
  rendered again as item 36's (768 frames, 29.2 min at 2.3 s, `flyover/bradbury_flyover_quick_540x960.mp4` 9.7 MB,
  32 s, the previous as `_v2` with its frames, sheet and log) and `flyover_quick_sheet.png` regenerated. The Eevee
  preview not re-rendered (it still shows item 34's storeys). README "The city's buildings taller (AI 574 item
  37, 2026-09-27)". No full-size Cycles cut; the GUI Blender not touched.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_i_DONE_buildings_574_BUILDINGS_bradbury_render_scene_to_reference_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested

## On `make final` without full completion
- If the user asks for `make final` while checklist items are still open, do not use `DONE` naming.
- Rename to regular mode naming (`AI_buildings_574_BUILDINGS_bradbury_render_scene_to_reference.md`) and keep all checklist items.
