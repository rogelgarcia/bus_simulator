# Terra & Mar in the Bradbury's city (2026-10-16): shared paths, the placement and the light scale.
#
# The city scenario is the Bradbury's render scene (BradburyBlock/build_scene.py -> bradbury_scene.blend), copied, never
# edited (the copy-only rule): build_city_scene.py opens that file, takes the Bradbury block out and stands the Terra &
# Mar part files in its place, and saves the copy here under tests/artifacts/. render_city_shots.py (stills) and
# render_flyover.py (the portrait video) open the copy. Nothing here writes a Bradbury file.
#
# THE PLACEMENT (user 2026-10-16: "the front of the building should face the corner ... that same corner must face the
# entrance of terra e mar"). The Terra & Mar parts are modelled in their own frame (tm_common: front run A faces -Y,
# street z 0, sidewalk top 0.15). They stand on the Bradbury's own block, at its corner of Broadway (the east kerb, x
# 21.19) and 3rd Street (the south kerb, y -22.08) -- the corner every Bradbury corner shot looks at. Terra & Mar's plan
# is a chamfered octagon, so TURNED 45 degrees its front run A faces that corner (south-east) and its two front chamfers
# (runs B and H, 45 degrees to A) run parallel to Broadway and to 3rd Street: a corner building with its entrance on
# the cut corner, as the Bradbury has its chamfer there. Both street faces (the balcony edge, which the podium follows)
# stand SETBACK back from their kerb lines -- room for the café sets along them -- and its sidewalk top (0.15) on the
# Bradbury's pavement top (0.201). The sun stands at azimuth +40 as for the Bradbury: the Broadway face sunlit, 3rd
# Street's in shade, the corner face at a grazing light. Its own forecourt paving (RB_SITE_GROUND, a rectangle for the
# unturned plan) is not used: the block's whole sidewalk is rebuilt in the Bradbury's materials (city_ground.py).
# Everything else in these scripts that belongs to the building (its box, the flyover's pivots) is written in the Terra
# & Mar frame and mapped by to_world(); the cameras are written in the world, at the Bradbury's own stands.
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
import math
from mathutils import Vector
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = BP.ROOT
BUILDING_ID = "terramar_recessed"

# the source: the Bradbury's canonical (worn) render scene, as BradburyBlock/build_scene.py writes it
BRADBURY_SCENE = BP.files('bradbury/legacy/bradbury_scene.blend')
# the Terra & Mar part files (rebuild/build.py target=...), linked into the copy
REBUILD_DIR = BP.files('terramar/parts')
PARTS = {   # collection name -> part file; RB_SITE's children one by one (its forecourt paving is left out)
    "TM_BUILDING": "terramar_part_shell.blend",
    "TM_PROPS": "terramar_part_props.blend",
    "TM_INTERIORS": "terramar_part_interiors.blend",
    "TM_WEAR": "terramar_part_wear.blend",
    "RB_SITE_CAFE": "terramar_part_site.blend",
    "RB_SITE_PALMS": "terramar_part_site.blend",
}
OPTIONAL_PARTS = ("TM_WEAR",)

CITY_DIR = BP.files('terramar')
# AI 651: the scripts open the COMPOSITION (build_composition.py: the reusable city linked, the parts instanced);
# LEGACY_CITY_BLEND is build_city_scene.py's copy of the Bradbury scene, kept until the user retires it
BUILDING_ENTRY = BP.files("terramar/terramar_building.blend")
COMPOSITION_BLEND = BP.files('terramar/terramar_city_composition.blend')
LEGACY_CITY_BLEND = BP.files('terramar/legacy/terramar_city_scene.blend')
CITY_BLEND = COMPOSITION_BLEND
SCREENS = BP.screens('buildings/terramar_recessed/city')
SHOTS_DIR = BP.screens('buildings/terramar_recessed/city/shots')
FLYOVER_DIR = BP.screens('buildings/terramar_recessed/city/flyover')

# the placement (see above)
Z_GROUND = 0.201                     # the Bradbury's pavement top
TM_SIDEWALK = 0.15                   # the Terra & Mar sidewalk top in its own frame (the café and palms stand on it)
KERB_E, KERB_S = 21.194, -22.079       # the block's Broadway and 3rd Street kerb lines (scn_pavement's pad_hi.x / pad_lo.y)
SETBACK = 6.5                        # the street faces' balcony edge back from the kerb line
CHAMFER_C = (13.35 + 2.4379) / 2 ** 0.5   # runs B and H: their distance from the plan centre (plan roof.guard_halves; the balcony edge)
ROT_DEG = 45.0
OFFSET = (KERB_E - SETBACK - CHAMFER_C, KERB_S + SETBACK + CHAMFER_C, Z_GROUND - TM_SIDEWALK)
EYE = 1.62                           # a standing eye over the pavement

# the light scale. The Terra & Mar parts were lit and tuned (interior area lights in W/m2, emissive downlights and
# pendants) under its calibrated rig, sun 162.7 at exposure -4.29; the Bradbury's scene has sun 8 at exposure 0 -- the
# same daylight in other units (162.7 x 2^-4.29 = 8.3). So the copy takes the Terra & Mar exposure and every light
# source of the Bradbury's scene (the sun lamp, both sky backgrounds, the haze's sky emission) is raised by 2^-EXPOSURE:
# the city renders exactly as before, and the building's lamps keep their calibrated balance against the day.
EXPOSURE = -4.2905283
LIGHT_SCALE = 2.0 ** (-EXPOSURE)

# Terra & Mar's own box (its frame), for framing checks and the flyover's blur start
TM_BOX = ((-13.5, -12.41, -0.25), (13.5, 13.5, 31.85))
ENTRANCE = (0.0, -11.6, 0.15)        # the projecting entrance volume's front (plan structure.entrance, x -3.45..3.45, y -12.15..-11.0)
ROOF_TOP = 27.25                     # the roof slab's top (plan roof.roof_top); the penthouse stands to about 31
PODIUM_TOP = 10.17
# the Bradbury scene's off-frame neighbour tower across Broadway (world box, build_scene.py's neighbour section)
TOWER_WORLD = ((42.5, -17.0, 0.15), (68.5, -4.49, 39.8))


def to_world(p):
    """A Terra & Mar frame point (x, y[, z]) -> the city's world point (the turn, then OFFSET)."""
    a = math.radians(ROT_DEG)
    x, y = p[0], p[1]
    z = p[2] if len(p) > 2 else 0.0
    return (x * math.cos(a) - y * math.sin(a) + OFFSET[0], x * math.sin(a) + y * math.cos(a) + OFFSET[1], z + OFFSET[2])


def box_corners(box, world=True):
    lo, hi = box
    pts = [(x, y, z) for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])]
    return [to_world(p) for p in pts] if world else pts


def parse_args(argv):
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    return dict(a.split("=", 1) for a in argv if "=" in a), [a for a in argv if "=" not in a]
