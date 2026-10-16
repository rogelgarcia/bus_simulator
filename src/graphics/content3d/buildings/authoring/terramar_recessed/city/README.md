# Terra & Mar in the Bradbury's city

The Bradbury's render scene (sky, sun, haze, streets, kerbs, context, neighbour tower, furniture and the city fill
built by `BradburyBlock/build_scene.py`) with the Bradbury block taken out and the Terra & Mar rebuild standing on its
site. Nothing here writes a Bradbury file (copy-only rule): the scene is a copy, the flyover script a copy of
`BradburyBlock/render_flyover.py`.

| Script | What it does |
| --- | --- |
| `city_common.py` | paths, the placement (`to_world`), the light scale |
| `city_ground.py` | the block's sidewalk and worn kerb rebuilt in the Bradbury's materials round a rear parking lot |
| `build_city_scene.py` | opens `bradbury_scene.blend`, removes `BRADBURY_BLOCK`, its cameras and its library chain, rebuilds the block's ground (`city_ground.py`), links the Terra & Mar part collections as instances, sets the wear switch, rescales the light, saves `tests/artifacts/blender/terramar_recessed/city/terramar_city_scene.blend` |
| `render_city_shots.py` | repeatable UHD stills from a table of views at the Bradbury's corner stands |
| `render_flyover.py` | the portrait 1080 x 1920 flyover (frames + H.264 MP4) |

## Commands

```
blender -b --factory-startup -P build_city_scene.py --        # (re)build the copy; rerun after the Bradbury scene is rebuilt
blender -b -P render_city_shots.py -- check=1                   # framing + what each view's centre ray hits
blender -b -P render_city_shots.py -- pct=25 samples=32 out=<dir>   # quick preview set
blender -b -P render_city_shots.py --                           # the UHD set: 3840 x 2160, 128 spp
blender -b -P render_city_shots.py -- views=hero_3q,roof samples=256
blender -b -P render_flyover.py -- check=1                      # every shot's first/mid/last framing
blender -b -P render_flyover.py -- frames=first,mid,last pct=25 # preview frames
blender -b -P render_flyover.py --                              # all frames, then the MP4
blender -b -P render_flyover.py -- frames=none encode=1         # re-encode from the frames on disk
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

`city_ground.py` replaces the block's `scn_pavement` / `scn_kerb` with the same materials (`GND_pavement`: scored slabs,
joint dirt, wall-base grime; `GND_kerb`: rolled edge, block joints, foot dirt, tide lines, chips) round a new outline:
the kerb rectangle with a 24 x 33 m parking lot cut into its back (west) half at road level, opening onto the west
street through a 7 m driveway. The kerb (the Bradbury's profile, copied) runs round the lot and the driveway, and the
lot's floor is the scene's own street asphalt (no wheel wear), with bays in the city's line paint. Terra & Mar's own
forecourt paving (`RB_SITE_GROUND`, a rectangle for the unturned plan) is not used.

## Cameras

Stills and flyover stand where the Bradbury's do, round the corner, and none looks from the back: behind the block lie
the city's open parking parcels, which the Bradbury's stands never show. The neighbour tower across Broadway (the
Bradbury's off-frame shadow caster) is kept out of the corner framings (`check=1` reports it).

## Light

The Terra & Mar parts were tuned under their calibrated rig (sun 162.7 at exposure -4.29: the interiors' area lights,
downlights and pendants are in absolute units); the Bradbury's scene is the same daylight at sun 8 / exposure 0. The
copy takes exposure -4.29 and multiplies every Bradbury light source (sun lamp, both sky backgrounds, the haze's sky
emission) by 2^4.29, so the city renders as it did and the building's lamps keep their balance against the day. The
film look stays the Bradbury's (AgX, Medium High Contrast).
