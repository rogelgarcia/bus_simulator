# Terra & Mar in the Bradbury's city

The Bradbury's render scene (sky, sun, haze, streets, kerbs, context, neighbour tower, furniture and the city fill
built by `BradburyBlock/build_scene.py`) with the Bradbury block taken out and the Terra & Mar rebuild standing on its
site. Nothing here writes a Bradbury file (copy-only rule): the scene is a copy, the flyover script a copy of
`BradburyBlock/render_flyover.py`.

| Script | What it does |
| --- | --- |
| `city_common.py` | paths, the placement (`to_world`), the light scale |
| `build_city_scene.py` | opens `bradbury_scene.blend`, removes `BRADBURY_BLOCK`, its cameras and its library chain, links the Terra & Mar part collections as instances, sets the wear switch, rescales the light, saves `tests/artifacts/blender/terramar_recessed/city/terramar_city_scene.blend` |
| `render_city_shots.py` | repeatable UHD stills from a table of views written in the Terra & Mar frame |
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

Terra & Mar is turned 90 degrees so its front (run A, -Y in its own frame) faces east onto Broadway: the scene's sun
stands at azimuth +40 (east-north-east), so the front and the right side are sunlit (facing 3rd Street, as the
Bradbury's south face does, the front would be in shade). The front edge of its forecourt paving lies on the
Bradbury's Broadway wall line, centred north-south on the block; its sidewalk top (0.15 in its frame) sits on the
Bradbury's pavement top (0.201) and the forecourt paving 3 mm proud of it. The parts are **linked as collections** and
instanced, so a rebuilt part (new objects included) shows up when the scene is opened again; only a change to the
Bradbury's scene needs `build_city_scene.py` rerun.

The Bradbury's block is larger (54 x 35 m) than Terra & Mar with its forecourt (32 x 39 m): the block's pavement west of
the building stays open as a paved plaza.

## Light

The Terra & Mar parts were tuned under their calibrated rig (sun 162.7 at exposure -4.29: the interiors' area lights,
downlights and pendants are in absolute units); the Bradbury's scene is the same daylight at sun 8 / exposure 0. The
copy takes exposure -4.29 and multiplies every Bradbury light source (sun lamp, both sky backgrounds, the haze's sky
emission) by 2^4.29, so the city renders as it did and the building's lamps keep their balance against the day. The
film look stays the Bradbury's (AgX, Medium High Contrast).
