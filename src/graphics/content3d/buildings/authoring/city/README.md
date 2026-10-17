# The reusable city

AI 651 (2026-10-17). Before this, the city existed twice: the Bradbury's render scene (`BradburyBlock/build_scene.py`)
and a copy of it for Terra & Mar (`terramar_recessed/city/build_city_scene.py`), and a city change had to be made in
the Bradbury script and re-copied. The pipeline is now split into three kinds of files:

- **One CITY**, built here: `tests/artifacts/blender/city/city.blend` and `site.json` beside it. Its SITE (the
  origin block between Broadway and 3rd Street) is left empty: no pavement, no kerb, no building.
- **One BUILDING file set per hero**, unchanged: the Bradbury's worn block chain (`portal_project/wear/...`) and
  Terra & Mar's part files (`terramar_recessed/rebuild/*.blend`).
- **One COMPOSITION per hero** that links the city and the building, finishes the site (sidewalk, kerb, lot), and owns
  the sun, the light units, the cameras, the film and the building's wear switch.

Rebuilding the city reaches every composition the next time it is opened. Compositions are not rebuilt.

## Files

| File | What it does |
| --- | --- |
| `city_site.py` | paths, the SITE descriptor (`site.json`), the light units, the scene-control names and the light-scale / weather attribute helpers |
| `build_city.py` | builds `city.blend` from copies of `build_scene.py`'s sections (sky, haze, ground, near and far context, neighbour tower, furniture, city fill), then the modelled neighbours |
| `city_neighbours.py` | the front-line neighbours (moved from the Terra & Mar city, third pass), with the light-scale and `city_weather` hooks |
| `front_line.py` | measures which city buildings a hero's stills and flyover see, on that hero's composition |
| `block_kit.py` | the site's ground in the city's materials: `full_block()` (the kerb rectangle) and `lotted_block()` (with the parking lot) |
| `city_compose.py` | what every composition does: link the city, set the light units and the sun, the film, the cameras |
| `parity_render.py`, `parity_compare.py` | repeatable stills (OptiX alone, fixed seed) and the [legacy, composition, difference] composites |
| `weather_check.py`, `weather_report.py` | the per-namespace weathering switch check on a composition |

The compositions:

| Hero | Builder | Output |
| --- | --- | --- |
| Bradbury | `BradburyBlock/build_composition.py` | `tests/artifacts/blender/bradbury/portal_project/bradbury_city_composition.blend` |
| Terra & Mar | `terramar_recessed/city/build_composition.py` | `tests/artifacts/blender/terramar_recessed/city/terramar_city_composition.blend` |

## Commands

```
blender -b --factory-startup -P city/build_city.py --                    # the city, neighbours on
blender -b --factory-startup -P city/build_city.py -- neighbours=off     # the drawn-window boxes (parity with the legacy Bradbury)
blender -b --factory-startup -P BradburyBlock/build_composition.py -- [wear=on|off|debug] [wear_stale=ok]
blender -b --factory-startup -P terramar_recessed/city/build_composition.py -- [wear=on|off|debug]
blender -b <composition> -P city/front_line.py -- hero=bradbury|terramar
blender -b -P city/parity_render.py -- scene=<.blend> views=ref_3q,hero_3q table=bradbury|terramar tag=<name>
blender -b <composition> -P city/weather_check.py -- hero=<hero> cam=x,y,z:tx,ty,tz:lens
```

A city build takes about 15 seconds and a composition build 2-3 seconds.
Blender runs headless (`C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`), one render job on the GPU at a
time.

## The site descriptor (`site.json`)

Written by every city build and read by the compositions, which never recompute it:

- `kerb_rect`: WX -40.227, EX 21.194, SY -22.079, NY 21.577. This is the Bradbury's hull pushed out `PAVE_W` 4.2, and
  the builder checks it against `city_site.KERB_RECT`.
- `levels`: pavement top 0.201, road -0.08, gutter about -0.105.
- `sun`: azimuth 40.0 and elevation 42.9 (the sky map's own sun, turned to the photo's azimuth), angle 0.53 degrees.
- `light`: the property name and the units per hero (see below).
- `collections`: the city's top-level collections (`GROUND`, `CONTEXT`, `CITY`, `NEIGHBOURS`) and `SITE_FURNITURE`.
- `world`: `CITY_SKY`.
- `hero_xy`: the point the neighbours' fronts face.
- `cam_clip`, `streets`, `front_line`, `neighbours`, `built`.

The road grid's wheel wear is cleared under the site (nothing drives on a site), so a lot cut into the block shows
clean asphalt.

## Light units

A linked city cannot be rescaled by editing its data, so its emitters read the composition's scene property
`city_light_scale`:

- the world's two Background strengths;
- the haze group's sky Emission;
- the neighbours' entrance-hall panels.

The value is read with an Attribute node of type View Layer, which falls back to the scene. An absent property reads 1
(`1 + alpha * (value - 1)`: the attribute's Alpha is 0 when the property does not exist). This was verified first
(2026-10-17) with a linked world and a linked node group in Cycles: absent gave 0 / alpha 0, 0 gave 0 / alpha 1, and
3 gave 3. The sun lamp is the composition's own, because a lamp cannot read the attribute.

| Hero | `city_light_scale` | Exposure | Sun |
| --- | --- | --- | --- |
| Bradbury | 1 | 0 | 8 |
| Terra & Mar | 2^4.2905 = 19.569 | -4.2905 | 156.6 |

Terra & Mar runs in absolute units because its interiors' lamps are calibrated that way. The day renders the same on
the film either way. The hall panels were tuned at the Terra & Mar scale (30), so they emit 30 / 19.569 x scale.

## Weathering namespaces

Each system has its own scene properties on a composition. A switch run on one never changes another's pixels
(`weather_check.py` shows it).

| System | Properties | Where it lives | Switch |
| --- | --- | --- | --- |
| Bradbury wear layer | `wear`, `wear_<feature>`, `edge_*`, `wear_realism` | baked into the worn block files; the wear-only objects in local `WEAR_*` collections of the composition | `BradburyBlock/render_composition_wear.py`, `wear.controls.apply()` |
| Terra & Mar wear module | `tm_wear`, `tm_wear_<feature>`, `tm_wear_signal` | the parts' materials (View Layer attributes) and the `TM_WEAR` overlays, one instance per feature collection | `terramar_recessed/city/composition_wear.switch()` |
| City ground wear | none | mesh attributes (`wear`, `ptone`, `grime`) and AO in the city's ground; `block_kit.py` meshes carry the same | no switch |
| Neighbours' NB_weather | `city_weather` (absent 1, 0 off) | the city's `NB_weather` group | set the property |

## Adding a hero

1. Build the hero's own files, in its own frame.
2. Write a composition builder beside them:
   - `city_compose.link_city(S, site)`: add `furniture=True` only if the Bradbury's vault covers and lantern post
     belong on its sidewalk.
   - Finish the site with `block_kit.full_block()` or `lotted_block()`, or a new outline in the kit.
   - Link the building. Use collections for a building that stands at the city's origin. Use collection instances for
     one that has to be turned, and give each wear overlay collection its own instance.
   - Add `city_site.LIGHT_UNITS[<hero>]` and call `city_compose.light_units()`, then `film()` and the cameras.
3. Run `front_line.py` on the new composition and add what it reports to `city_neighbours.FRONT_LINE`. Rebuild the city
   once; every composition sees the change.
