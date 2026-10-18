# Terra & Mar in the city

Since 2026-10-17 (AI 651), Terra & Mar renders from its CITY COMPOSITION, `terramar_city_composition.blend`, which
`build_composition.py` writes. The composition links the reusable city (`../../city/`: sky, haze, streets, kerbs,
context, neighbour tower, city fill and the modelled front-line neighbours, with the site left empty) and instances the
Terra & Mar part files. It then finishes the block (`city/block_kit.lotted_block`: the sidewalk and worn kerb round the
rear parking lot) and sets Terra & Mar's light units and wear switch. A rebuilt city or a rebuilt part needs no rerun.

Until then the city was a copy of the Bradbury's render scene (`build_city_scene.py` ->
`terramar_city_scene.blend`). That copy is the legacy path, kept until the user retires it.

| Script | What it does |
| --- | --- |
| `city_common.py` | paths (`CITY_BLEND` = the composition, `LEGACY_CITY_BLEND` = the copy), the placement (`to_world`), the light scale |
| `build_composition.py` | links the city and the parts, lays the block with its lot, checks the site props, sets the light units and the wear switch, saves the composition; `furniture=1` also links the Bradbury's vault covers and lantern post |
| `composition_wear.py` | the Terra & Mar wear switch in the composition: `rebuild/wear/controls` plus one instance per `TM_WEAR_<feature>` collection, shown only while that feature is on |
| `render_city_shots.py` | repeatable UHD stills from a table of views at the Bradbury's corner stands (opens the composition; `scene=` for another) |
| `render_flyover.py` | the portrait 1080 x 1920 flyover (frames + H.264 MP4), on the composition |
| `front_line.py` | legacy: the city's copy (`../../validation/front_line.py hero=terramar`) measures on the composition |
| `city_neighbours.py`, `city_ground.py` | legacy: moved into the city (`../../city/city_neighbours.py`, `block_kit.py`) |
| `build_city_scene.py` | legacy: the copy of the Bradbury's scene, now written to `LEGACY_CITY_BLEND` |

## Commands

```
blender -b --factory-startup -P ../../city/build_city.py --              # the city (shared with the Bradbury)
blender -b --factory-startup -P build_composition.py --                  # the composition (seconds)
blender -b -P render_city_shots.py -- check=1                            # framing + what each view's centre ray hits
blender -b -P render_city_shots.py -- pct=25 samples=32 out=<dir>        # quick preview set
blender -b -P render_city_shots.py --                                    # the UHD set: 3840 x 2160, 128 spp
blender -b -P render_city_shots.py -- views=hero_3q,roof wear=debug      # any wear state (composition_wear.switch)
blender -b -P render_flyover.py -- check=1                               # every shot's first/mid/last framing
blender -b -P render_flyover.py --                                       # all frames, then the MP4
blender -b blender_files/terramar/terramar_city_composition.blend -P ../../validation/front_line.py -- hero=terramar
```

Outputs (gitignored): stills in `tests/artifacts/screens/buildings/terramar_recessed/city/shots/`, flyover frames and
`terramar_city_flyover_portrait_1080x1920.mp4` in `.../city/flyover/`.

## Placement

Terra & Mar stands on the Bradbury's own block, at its Broadway / 3rd Street corner, the corner every Bradbury corner
shot (`ref_3q`, `hero_3q`, `st_corner`, `st_along`) looks at. Its plan is a chamfered octagon, so turned 45 degrees its
entrance face (run A) faces that corner and its two front chamfers (runs B, H) run parallel to Broadway and 3rd Street.
Both street faces stand `SETBACK` 6.5 m back from the kerb lines, which leaves room for the café sets. Its sidewalk top
(0.15 in its frame) sits on the Bradbury's pavement top (0.201). The parts are linked as collections and instanced, so a
rebuilt part, new objects included, shows up when the scene is opened again. Only a change to the Bradbury's scene needs
`build_city_scene.py` rerun. The build checks every site prop (café sets, palms, pots, lamps) lands on the sidewalk.

Under the scene's sun (azimuth +40, as for the Bradbury) the Broadway face is sunlit, the 3rd Street face shaded and the
entrance face lit at a grazing angle, as the Bradbury's chamfer is.

## Ground

`city/block_kit.lotted_block` (until AI 651 `city_ground.py`) lays the block's `scn_pavement` / `scn_kerb` in the city's linked materials (`GND_pavement`: scored slabs,
joint dirt, wall-base grime; `GND_kerb`: rolled edge, block joints, foot dirt, tide lines, chips) round a new outline:
the kerb rectangle with a 24 x 33 m parking lot cut into its back (west) half at road level, opening onto the west
street through a 7 m driveway. The kerb (the Bradbury's profile, copied) runs round the lot and the driveway, and the
lot's floor is the scene's own street asphalt (no wheel wear), with bays in the city's line paint. Terra & Mar's own
forecourt paving (`RB_SITE_GROUND`, a rectangle for the unturned plan) is not used.

## Neighbours

AI 651: the modelled neighbours are now the city's (`../../city/city_neighbours.py`, built into `city.blend`), so the
Bradbury's composition shows them too, and their front line is the union of both heroes' cameras. The description
below is the third pass (2026-10-17).

The city's buildings are boxes whose windows are drawn by their material. The ones the cameras actually see,
`city_neighbours.FRONT_LINE`, are modelled instead (`neighbours=off` keeps the boxes). That list is every building
filling at least 0.4% of some still or flyover frame (`front_line.py`), plus the ones the user marked. Each box keeps its
footprint, height and roof plane; its walls, parapet and rooftop boxes are rebuilt:

- **Use.** The use the city gave the box (its recipe: flats, shops, offices, shed), with the city's storey heights.
  The Bradbury's tower across Broadway is an apartment tower; its wing is shops under flats.
- **Apartment plan.** Residential floors are divided into apartments (about two per face) of rooms: living room,
  bedroom, bathroom, kitchen, mirrored apartment by apartment, with the stair core in the middle of a front face. Each
  room has its own window: a pair for a living room or bedroom (so the facade reads pair, space, pair), one kitchen
  window, a small high frosted bathroom window, and the stair's narrow windows at the half landings. Balconies only
  where homes are: the odd small projecting balcony on ordinary flats and Juliet rails on the tower's long faces; none
  on shop and workshop buildings, offices or the large blocks that read as works.
- **Entrances.** A residential or office entrance is a real hall: wide glazed double doors between sidelights under a
  transom, in clear glass, and behind them a lit hall (stone floor, lift doors, letter boxes) under a canopy. Shops have
  glazed doors in every shopfront, sheds roll-up and steel man doors, back faces a service door.
- **Structure.** The tower is plain rendered walls with its rooms' windows (the second pass's concrete frame is gone:
  "for the tall building simpler is better"). The offices' rendered pilasters are cut at every floor.
- **Features.** Plinth, string course, a stepped cornice under a coped parapet (flats, shops, wing) or a metal coping,
  lintels and sills, canopies, shop fascias with sign panels, some awnings. Every box piece has a small bevel, and the
  walls' corners are chamfered.
- **Colour.** Trims are the wall's own material: a shade lighter on render, and on brick the same brick in a slightly
  deeper tone (soldier-course lintels, brick sills and a brick band under a dark metal coping, sash windows). Frames,
  signs and awnings are muted, and the glass is a neutral dark.
- **Weathering.** Done in the wall material, with no surface mottle: dust rising from the base to a ragged 0.8-1.5 m,
  and runoff streaks hanging from the coping (the object's `nb_top`). A composition scales it by `city_weather`
  (absent 1, 0 off).
- **Roofs.** The city's bulkhead becomes a stair bulkhead (steel door, louvre, lamp, coping). Its plant boxes become
  condensers with a top fan on rails, louvred air handlers or exhaust fans, with refrigerant pipes on supports. Vent
  stacks and a hatch are added.
- **Variation (subtle).** The ground storey a shade darker than the floors above, and a seeded per-building choice of
  frame colour, cornice depth and room mix, on top of the city's per-building tint.

## Cameras

Stills and flyover stand where the Bradbury's do, round the corner, and none looks from the back: behind the block lie
the city's open parking parcels, which the Bradbury's stands never show. The neighbour tower across Broadway (the
Bradbury's off-frame shadow caster) is kept out of the corner framings (`check=1` reports it).

## Light

AI 651: the city's emitters read the composition's `city_light_scale` (19.569 here) and the composition owns the sun
(8 x 19.569) and the exposure (-4.29); see `../../city/README.md`. The history below is the legacy copy's.

The Terra & Mar parts were tuned under their calibrated rig (sun 162.7 at exposure -4.29: the interiors' area lights,
downlights and pendants are in absolute units); the Bradbury's scene is the same daylight at sun 8 / exposure 0. The
copy takes exposure -4.29 and multiplies every Bradbury light source (sun lamp, both sky backgrounds, the haze's sky
emission) by 2^4.29, so the city renders as it did and the building's lamps keep their balance against the day. The
film look stays the Bradbury's (AgX, Medium High Contrast).
