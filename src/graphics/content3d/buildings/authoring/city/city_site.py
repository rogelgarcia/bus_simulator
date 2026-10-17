# city_site.py -- the reusable city's paths, its SITE descriptor and its scene controls (AI 651, 2026-10-17).
#
# The city (build_city.py -> tests/artifacts/blender/city/city.blend) is everything round the city's origin block --
# sky, haze, streets, the far blocks' pavements and lots, the near and far context, the neighbour tower, the street
# furniture, the city fill and the modelled front-line neighbours -- with that block itself, the SITE, left empty: no
# pavement, no kerb, no building. A hero's COMPOSITION links the city and the hero's building files, finishes the site
# (block_kit.py: its sidewalk, kerb and any lot) and owns the sun, the cameras, the film and its building's wear.
#
# THE SITE is the block between Broadway (east) and 3rd Street (south). Its kerb rectangle is the Bradbury's outline
# pushed out PAVE_W (build_scene.py's ground section), and the whole street grid, the far blocks, the city's open zone
# and the neighbour tower are laid out from it, so it is fixed here and written beside the city as site.json, which
# the compositions read (they never recompute it).
#
# LIGHT UNITS. The city's emitters (the world's two Background strengths, the haze group's sky Emission and the
# neighbours' lit entrance halls) are multiplied by the composition's scene property `city_light_scale`, read with a
# View Layer attribute (Cycles falls back to the scene's own property); absent reads 1 (the attribute's Alpha says
# whether the property exists). The sun is the composition's own lamp, LIGHT_UNITS[...]["sun"] x scale. Bradbury
# renders at scale 1 and exposure 0; Terra & Mar at 2^4.2905 and exposure -4.2905, because its interiors' lamps are
# calibrated in absolute units -- the same daylight on the film either way.
#
# WEATHERING NAMESPACES on a composition's scene (kept apart: a switch on one never touches another's pixels):
#   wear, wear_<feature>, edge_*, wear_realism   the Bradbury wear layer (BradburyBlock/wear/)
#   tm_wear, tm_wear_<feature>, tm_wear_signal   the Terra & Mar wear module (terramar_recessed/rebuild/wear/)
#   city_weather                                 the neighbours' NB_weather (base dust, coping runoff): absent 1, 0 off
#   city_light_scale                             the city's light units (not weathering)
# The city's ground wear (wheel paths, cracks, kerb grime, slab joints) lives in mesh attributes and AO and has no
# switch; a composition's own block meshes carry the same attributes (block_kit.py).
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", "..", "..", "..", "..", ".."))
ART = os.path.join(ROOT, "tests", "artifacts", "blender", "city")
CITY_BLEND = os.path.join(ART, "city.blend")
SITE_JSON = os.path.join(ART, "site.json")
CONTEXT_LIBRARY = os.path.join(ART, "context_library.blend")   # the city's copy (paths remapped) of the one below
LEGACY_CONTEXT_LIBRARY = os.path.join(ROOT, "tests", "artifacts", "blender", "bradbury", "portal_project", "context_library.blend")
SCREENS = os.path.join(ROOT, "tests", "artifacts", "screens", "city_reuse")

# ---- the site (build_scene.py's ground section: the Bradbury hull pushed out PAVE_W, its kerb lines)
Z_GROUND = 0.201          # the pavement's top (the Bradbury's sidewalk top)
ROAD_Z = -0.08            # the roadway's plane
GUTTER_Z = -0.105         # about where the road settles into the gutter (ROAD_Z - ROAD_GUTTER_DIP)
PAVE_W = 4.20             # the sidewalk, wall to kerb line
KERB_RECT = (-40.227, 21.194, -22.079, 21.577)   # WX, EX, SY, NY: the site's kerb lines (checked against the build)
EYE = 1.62                # a standing eye over the pavement

# ---- the scene controls
LIGHT_PROP = "city_light_scale"
WEATHER_PROP = "city_weather"
EXPOSURE_TM = -4.2905283
LIGHT_UNITS = {           # per hero: the city light scale, the film's exposure, the sun lamp's strength at scale 1
    "bradbury": {"scale": 1.0, "exposure": 0.0, "sun": 8.0},
    "terramar": {"scale": 2.0 ** (-EXPOSURE_TM), "exposure": EXPOSURE_TM, "sun": 8.0},
}
HALL_LIGHT_SCALE = LIGHT_UNITS["terramar"]["scale"]   # the neighbours' hall panels were tuned at that scale (HALL_LIGHT 30)

# ---- the city's collections, as a composition links them
CITY_COLLECTIONS = ("GROUND", "CONTEXT", "CITY", "NEIGHBOURS")   # the city proper
SITE_FURNITURE = "SITE_FURNITURE"   # the vault covers and the lantern post on the site's own sidewalk (opt-in)
WORLD = "CITY_SKY"
HAZE = "scn_haze"

# the point the neighbours face (their fronts: entrances, shopfronts, signs): the site's hero point the legacy Terra &
# Mar city used, its plan centre placed (city_common.to_world((0, 0.5))); the Bradbury fills the same block round it
HERO_XY = (3.176715, -4.061715)


def write_site(sun_az, sun_el, extra=None):
    """The descriptor the compositions read: kerb rectangle, levels, sun, light units, collection names."""
    d = {
        "kerb_rect": {"WX": KERB_RECT[0], "EX": KERB_RECT[1], "SY": KERB_RECT[2], "NY": KERB_RECT[3]},
        "levels": {"pavement_top": Z_GROUND, "road": ROAD_Z, "gutter": GUTTER_Z},
        "pave_w": PAVE_W,
        "sun": {"azimuth_deg": sun_az, "elevation_deg": sun_el, "angle_deg": 0.53},
        "light": {"property": LIGHT_PROP, "units": LIGHT_UNITS},
        "weather_property": WEATHER_PROP,
        "collections": {"city": list(CITY_COLLECTIONS), "site_furniture": SITE_FURNITURE},
        "world": WORLD,
        "hero_xy": list(HERO_XY),
    }
    d.update(extra or {})
    os.makedirs(ART, exist_ok=True)
    with open(SITE_JSON, "w", encoding="utf-8") as fh:
        json.dump(d, fh, indent=2)
    return d


def read_site(path=SITE_JSON):
    assert os.path.isfile(path), f"no site descriptor at {path}: build the city first (city/build_city.py)"
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def sun_direction(site):
    az, el = math.radians(site["sun"]["azimuth_deg"]), math.radians(site["sun"]["elevation_deg"])
    return (math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el))


def scale_socket(nt, prop, location=(0, 0)):
    """In node tree nt: the effective value of the scene property `prop` read as a View Layer attribute, 1 when the
    property is absent (1 + alpha * (value - 1)). Returns the output socket."""
    x, y = location
    a = nt.nodes.new('ShaderNodeAttribute'); a.attribute_type = 'VIEW_LAYER'; a.attribute_name = prop
    a.name = a.label = prop; a.location = (x - 400, y)
    sub = nt.nodes.new('ShaderNodeMath'); sub.operation = 'SUBTRACT'; sub.location = (x - 200, y)
    sub.inputs[1].default_value = 1.0
    nt.links.new(a.outputs["Fac"], sub.inputs[0])
    ma = nt.nodes.new('ShaderNodeMath'); ma.operation = 'MULTIPLY_ADD'; ma.location = (x, y)
    nt.links.new(sub.outputs["Value"], ma.inputs[0]); nt.links.new(a.outputs["Alpha"], ma.inputs[1])
    ma.inputs[2].default_value = 1.0
    return ma.outputs["Value"]


def scaled_input(nt, socket, base, prop=LIGHT_PROP):
    """Drive an input socket (a Strength) by base x the effective `prop`."""
    node = socket.node
    s = scale_socket(nt, prop, (node.location.x - 220, node.location.y - 160))
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.location = (node.location.x - 140, node.location.y - 160)
    mul.inputs[1].default_value = base
    nt.links.new(s, mul.inputs[0]); nt.links.new(mul.outputs["Value"], socket)
    return mul


def parse_args(argv):
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    return dict(a.split("=", 1) for a in argv if "=" in a), [a for a in argv if "=" not in a]
