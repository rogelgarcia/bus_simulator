# Sheltered soiling under overhangs (AI 565): the soft darkening a city leaves wherever the building's own geometry
# keeps the rain off. Soot and dust settle on every surface of a facade; rain rinses them off the open ones, and the
# surfaces it cannot reach keep them. The ICOMOS-ISCS glossary describes black crust as "developing generally on areas
# protected against direct rainfall or water runoff in urban environment"; Blocken & Carmeliet (2013) put the deposit's
# staying down to "reduced rainwash" in sheltered places; Miller (1994) placed dirt where accessibility is low. Los
# Angeles's smog is not coal soot, so here it reads as soiling, a dulling and darkening of each material's own colour,
# never as a black crust.
#
# THE RAIN is wind-driven: RAIN_THETA inclinations off the vertical times RAIN_PHI azimuths off each face's normal (the
# wind from either side of the street as much as square on), every direction the same share of the rain. What a wall
# facing the street intercepts of a direction is its share times sin(theta) cos(phi), the horizontal component. A
# direction is kept off a point when the ray from the point back toward the rain meets the building.
#
# THE SHELTER is found on the elevation, the facade as the street sees it on the mask's 5 cm texels: the depth of the
# first surface a level ray from the street meets (the fire escapes looked through, their platforms laid back in as the
# slabs they are). Seen from the rain's side that depth map is the building's envelope, so a ray from a surface point
# is blocked exactly when, somewhere above it, the envelope stands further out than the ray has got by then. One sweep
# down the whole atlas per direction finds that for every texel at once (a horizon map), so the 77 directions cost
# half a second. The share of the rain a texel's surface loses is its SHELTER, 0 in the open, 1 right under a deep
# projection. It falls off smoothly with the distance below a projection, as the more slanting rain gets under it, and
# the projection's own depth sets how far down it reaches: under a long projection p deep, half the rain is kept off
# the wall p below it and a fifth 2p below. The band's 0.25 m soffit keeps half the rain off the brick a quarter metre
# below it; the storefront heads, 0.4 m deep, shelter most of their transom panels; a sill's 3 to 5 cm, a few
# centimetres.
#
# OVERHANGS ONLY. What shelters here is what OVERHANGS: a surface blocks the rain only where it stands out over
# something below it within OVH_LOOK -- a cornice, a sill, a window head, a bracket, a capital's abacus, a fire escape's
# platform. A pier standing proud beside a recessed wall keeps some slanting rain off the wall's inside corner as well,
# but that is not shelter from above, and counting it darkens open brick in a band down every pier: the "fake ambient
# occlusion" look that was rejected twice. The full exposure, piers and all, is published for the washed zones (AI 566).
#
# UNDERSIDES. A surface that faces down takes no rain whatever stands above it, so the soffits of the crown, its
# coffers and dentils, the undersides of the band and its brackets and of the impost course, the window heads and arch
# soffits, the portal's vault, the storefront heads and the fire escapes' platforms are soiled by their own
# orientation: the shader follows the rain model's own fall-off with the tilt, on faces turned more down than out. That
# is also why the mask alone could not do it: every point of a soffit reads one row of the atlas, the row of the
# projection's front edge.
#
# THE SOURCES are the overhangs themselves: every drip edge on the elevation, a masonry surface (or a platform) whose
# surface below steps back at least EDGE_MIN, traced into runs along the edge. Each run is a line source and each of its
# texels' shelter is one mark from it: a texel belongs to the first drip edge above it in its column (to the nearest one
# beside it in a lateral penumbra). The debug view draws each drip edge and, down its middle, how far the shelter its
# element's soiling counts reaches. Nothing here is placed by noise: the gradients are the geometry's, texel by texel.
#
# ONE ELEMENT AT A TIME (the rework of 2026-09-23). Every window head, arch, sill, storefront, fire escape platform and
# portal on this building is the same shape, so the shelter alone soils each one exactly alike: the same mark stamped at
# every window (user 2026-09-23: marks must not repeat identically from one instance to the next). What differs between
# them on a real front is what the model does not carry -- a sound or a failed drip, a lintel reset, a window washed
# down with its frame, a tenant who cleans the shop front -- so each of those ELEMENTS (VARY) takes its own share of the
# soiling and its own stretch of the reach, seeded from where it is (element_vary: a hash of its family, face and span,
# so a rebuild draws the same values and nothing else reshuffles them), within bounds: 0.70 to 1.15 of the measure,
# most a little lighter, about one in five a little heavier, none clean. The portals are the building's doors, washed
# down with the entrance (PORTAL_KEEP). Shares and stretches are smooth fields, not labels: at each texel, the elements'
# values weighted by the shelter each would give there alone (blend_elements), so where a fire escape platform's shelter
# lies over the window heads under it the platform leads, and a value changes only where the shelter does -- never along
# the line where two marks happen to meet -- while an element's soffit (its drip edge's own row) takes its own share.
# The continuous courses -- the crown, the band with the brackets under it, the impost, the string course -- keep the
# whole measure: each runs the length of its face as one element, and a bracket's underside is the band's own soiling
# (drawn bracket by bracket it would read as a checker along the band).
#
# THE TOP'S RUN-OFF. The crown's top sheds its rain over its front arris, and its top 9 cm lean outward: with no drip
# there, the water runs back along that lip's underside and down the fascia under it to the next arris, and drips from
# that. By the rain alone the lip reads fully sheltered (it faces down, and its upper part overhangs its lower), but it
# carries the run-off of the whole top along the building's most rain-beaten line, so it is washed, not soiled
# (top_runoff; the 1960 HABS crown reads light along its top edge, dark only under the corona). The lower cornices have
# a fascia whose undercut drips before their bed mouldings, which stay sheltered.
#
# INDOORS (the critique of 2026-09-25). What the street sees only through glass is inside the building, and neither the
# rain nor the street's dust reaches it: the storefronts' white transom panels, 2.2 cm behind their transom glass; the
# portals' vestibules behind their doors; the part of a display window's frame, or of a window's reveal, that runs on
# behind the pane. The mask cannot tell them apart from the pane in front of them -- they read the texel of the glass,
# whose shelter is the storefront head's, and the transom panels came out the most darkened surfaces on the west face
# -- so they are found on the model instead (indoors): rays from each pane into the building find what it shows, sight
# lines from each face so seen to the street find the pane it is seen through, and a face whose points behind that
# pane the street sees only through glass (all but the odd one) carries the pane's plane in its own space (apply()).
# Behind that plane the shader takes none. Glass grime (AI 571) is what dims them, through the pane.
#
# THE LOOK darkens and dulls the material's own colour toward a grey-brown deposit, keeping its pattern (the brick's
# mortar joints hold a little more of it): brick, terracotta and stone in full, painted metal and paint in part, the
# portal's glazed brick and oak lightly, glass not at all, nor anything indoors, and bare metal not at all either: the
# portal's brass kickplates and bronze lamps and the doors' bronze hardware are polished by hand. It turns the porous
# fabric matte; a smooth finish -- paint, metal, varnished oak, glaze -- keeps its own gloss and only darkens, because
# roughened, that gloss spreads the sun's highlight over the finish and lights it up (the critique of 2026-09-24: the
# Broadway portal's sunlit brass kickplates read 1.44 of their clean luminance, its oak 1.03 to 1.04). A deposit here
# never lightens.
#
# PUBLISHED for the features that follow (566 washes where the rain reaches, 572 wants shelter for its perches, 573
# erodes the joints where the rain beats): `shelter`, `exposure`, `front`, `overhangs` and `rain` (see the README's
# "Sheltered soiling under overhangs (AI 565)"); sample() reads any of the fields at (face, s, z). They stay the
# geometry's measure of the rain: the elements' shares and the top's run-off are this feature's own look, in its mask.
import hashlib, math, re
import numpy as np
from .. import classes
from ..geometry import FACADES, ATLAS, Z_GROUND, facade_of

NAME = "soiling"
AI = 565
LABEL = "sheltered soiling under overhangs"
ORDER = 200
DEFAULT_STRENGTH = 1.0
DEBUG_COLOR = (0.55, 0.20, 0.95)
MASK = dict(res=0.05, channels=4, bits=16)   # R: the shelter of the surface the street sees, as its element's soiling
RES = MASK["res"]                            # reaches; G, B: that element's share above and below 1; A: the depth

# ---------------------------------------------------------------------------------------------------- the rain
RAIN_THETA = (10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0)   # inclination off the vertical, degrees
RAIN_PHI = tuple(float(p) for p in range(-75, 76, 15))    # azimuth off the face's normal, degrees
MAX_LATERAL = 2.0       # a direction's ray crosses at most this many texels sideways per row it rises (70 deg at 75 deg
                        # would be 2.07): a digital line then never steps over a two-texel bracket

# ---------------------------------------------------------------------------------------------------- the elevation
SEE_THROUGH = ("attachment_fire_escape",)   # open ironwork hung in front of the wall: the wall behind it is the facade
PLATFORM_AREA = 0.5     # a fire escape's downward-facing flat parts at one level, at least this much and ...
PLATFORM_FILL = 0.5     # ... filling at least this share of their footprint, are a platform (not a rail or a tread)
D_FROM, REACH = 4.0, 12.0                 # the level rays: from this far out, this far
Z_LO, Z_HI = 0.10, 20.90                 # the rows cast: the block stands 0.194 .. 20.732
OPEN = -9.0             # the depth of open air, where a level ray meets nothing
NEG = -1.0e6            # nothing above: the horizon of a ray that meets nothing

# ---------------------------------------------------------------------------------------------------- the shelter
OVH_MIN = 0.02          # a surface overhangs where it stands this much further out than a surface below it ...
OVH_LOOK = 2.5          # ... within this far down its column (the crown's full height; a window under its head) ...
CARRY = 0.005           # ... before a surface standing this much further out than it carries it
BIAS = 0.003            # a ray's own surface never blocks it
SOFT = 0.01             # a ray grazing an edge is blocked by degrees over this much depth, so edges do not alias

# ---------------------------------------------------------------------------------------------------- the sources
EDGE_MIN = 0.03         # a drip edge: an overhanging masonry surface whose surface below steps back at least this much
RUN_MIN = 0.15          # a drip edge shorter than this is part of the overhang above it, not a source of its own
REACH_K, REACH_MIN = 8.0, 0.5   # a drip edge's marks run at most this many times its projection below it (at least
                                # REACH_MIN): the rain model's shelter is under 0.05 there
MARGIN = 2              # texels: a mark reaches this far past the shelter it carries, so the depth channel is whole
SHOWN = 0.05            # a texel belongs to a mark from this much shelter (the look starts at SHOW[0])
VIS = 0.10              # a source's path runs down to where its shelter falls below this
FAMILIES = (            # what a drip edge belongs to, by its object's name (the first match)
    ("crown", r"^ge_crown_"),
    ("band", r"^(ge_cornice45_|ge_band45|ge_teeth45)"),
    ("bracket", r"^ge_bracket45"),
    ("springing", r"^ge_capital5"),
    ("capital", r"^ge_capital"),
    ("impost", r"^impost_course"),
    ("sill", r"^sill_"),
    ("window_head", r"^(panel_|wall_floors_2_4)"),
    ("arch_head", r"^(top_panel_|ge_archivolt|wall__21)"),
    ("ground_crown", r"^ge_crown$"),
    ("string_course", r"^(ge_cornice$|ge_bead|ge_teeth)"),
    ("storefront_head", r"^(ge_band_strip|ge_upper_band|fit_)"),
    ("fire_escape", r"^attachment_fire_escape"),
)
FAMILY_LABEL = dict(crown="crown cornice", band="band 4-5", bracket="band bracket", springing="springing capital",
                    capital="column capital", impost="impost course", sill="window sill", window_head="window head",
                    arch_head="arched window head", ground_crown="ground floor crown", string_course="string course",
                    storefront_head="storefront head", fire_escape="fire escape platform", portal="portal",
                    other="other")

# ---------------------------------------------------------------------------------------------------- the elements
VARY = {                # family: the bounds of an element's share of the soiling and of the stretch of its reach, each
                        # drawn per element (the mean of two seeded uniforms: the middle likelier than the ends)
    "window_head": ((0.70, 1.15), (0.80, 1.25)),
    "arch_head": ((0.70, 1.15), (0.80, 1.25)),
    "sill": ((0.70, 1.15), (0.80, 1.25)),
    "fire_escape": ((0.70, 1.15), (0.80, 1.25)),
    "storefront_head": ((0.55, 1.15), (0.80, 1.25)),    # a shop's tenant keeps its own front clean, or does not
    "portal": ((0.70, 1.15), (0.80, 1.25)),
}
PORTAL_KEEP = 0.70      # a portal is the building's door, its recess washed down with the entrance: its share times this
UP_SPAN = 0.5           # the mask holds a share above 1 in G as (share - 1) / UP_SPAN and one below 1 in B as 1 - share,
                        # so a texel outside every mark (both 0) keeps the whole measure

# ---------------------------------------------------------------------------------------------------- the top's run-off
TOP_TOL = 0.005         # the run-off of the building's top runs on down a face while it steps less than this ...
LIP_NZ = (-0.94, -0.20) # ... or back along an underside leaning out between these Nz (steeper than 20 degrees) ...
LIP_STEP = 0.15         # ... at most this far back per row; a larger step back is an arris it drips from
TOP_SPREAD = 8          # texels: and along a wetted face sideways, under the return of a corner pavilion's crown

# ---------------------------------------------------------------------------------------------------- indoors
PANE_STEP = 0.30        # each pane's street face is looked through from points this far apart ...
PANE_EL = (-30.0, 0.0, 30.0, 60.0)          # ... along these elevations ...
PANE_AZ = (-60.0, -30.0, 0.0, 30.0, 60.0)   # ... and azimuths off its face's inward normal (degrees) ...
PANE_REACH = 12.0       # ... this far in (the portals' vestibules are 6.3 m deep), past the pane's own faces within ...
PANE_SKIP = 0.03        # ... this of the first: a pane beyond ends the ray (what lies past it is not this pane's to show)
PANE_HITS = 1           # the first point each triangle is seen at is looked from too (a ceiling seen between its beams)
VIEW_D = (0.6, 2.0, 8.0, 25.0)              # the street's viewpoints: this far in front of a face's hull line ...
VIEW_Z = (0.4, 1.6, 8.0, 16.0)              # ... this high over the pavement ...
VIEW_S = (-15.0, -4.0, 0.0, 4.0, 15.0)      # ... and this far along it from the point they look at
CORNER = 0.95           # a face is looked at from its centre and from this far out toward each corner (up to 8) ...
POINT_R = 0.02          # ... when it reaches further than this from its centre: the part of a face in front of a pane
                        # includes a corner, so a face running from outside the pane to behind it is seen from outside
FACET_PTS = 48          # at most this many of a facet's points are looked from (spread over them)
SLIT = 0.02             # a clear sight line counts when most of the 4 lines this far beside it are clear too: the model
                        # leaves gaps of a few millimetres to over a centimetre between a pane and its door or frame
BROAD = 0.9             # a pane's plane is that of a face of glass turned to the street at least this much
PLANE_COS, PLANE_TOL = 0.999, 0.005     # the panes a face is seen through are one plane within these, and of its
VETO, VETO_SHARE = 0.002, 0.25          # points this far behind it, no more than this share may be seen from the
                        # street without glass: the model's joints leave the odd opening (the chamfer's transom panel
                        # shows one corner past its frame), a recessed entrance behind a pane's plane shows most of it
TEST_ALL = 400          # a mesh with a face indoors has every face looked at, in every object drawing it, up to this many
WHOLE_TOL = 0.005       # faces; and a mesh is indoors whole when it lies this far behind the one pane its faces are seen
                        # through and the street sees none of them without glass
PANE_GAP = (0.001, 0.003)   # a point this far behind its face's pane (the shader, in the object's own space) is indoors:
                            # a frame's face that runs on behind its glass is cut where the glass meets it
PANE_ATTR = "wear_soiling_pane"     # the face attribute holding that pane's normal (its offset is Attr, wear_soiling)

# ---------------------------------------------------------------------------------------------------- wind catch
# How much of the wind-driven rain a face catches where (Blocken & Carmeliet 2013): most at its top edge and top
# corners, then down its side edges, least low in the middle. The soiling does not use it (an open wall stays clean
# wherever it is); it is published inside `exposure` for the washed zones and the mortar erosion.
Z_TOP = 20.732          # the crown's top
CATCH_FOOT = 0.6        # the pavement's catch against the top edge's: the height law runoff (AI 564) uses, EXPO_FOOT
CATCH_TOP = 3.0         # the top edge's zone, metres down from the crown's top
CATCH_SIDE = 3.0        # a side edge's zone, metres in from a corner of the block (a 90 degree one; the chamfer's
                        # 135 degree corners carry half of it)
CATCH_EDGE = 0.35       # how much more the edge zones catch at their outer edge

# ---------------------------------------------------------------------------------------------------- the look
SHOW = (0.03, 0.55)     # the shelter the soiling starts at and is full at (smoothstep): an open wall stays clean
JOINT_HOLD = 0.35       # a mortar joint holds this much more of the deposit than a brick's face (the layer's Joint)
UNDER = (-0.30, -0.60)  # undersides: from Nz -0.30 to -0.60 the orientation term comes in ...
UNDER_POW = 1.8         # ... as the rain model's own shelter by tilt, 1 - (1 + Nz) ** 1.8: what an open face tilted
                        # down receives of the wall's rain, summed over RAIN_THETA x RAIN_PHI (within 0.03 of the sums)
GATE = (0.10, 0.25)     # a point standing this far in front of the surface the mask recorded (a fire escape) is not it
DEPTH_LO, DEPTH_SPAN = -3.0, 4.5    # the depth channel: d from -3.0 to +1.5 over 0..1
AMOUNT = 0.62           # at strength 1 a full shelter goes this far toward DIRT
DIRT_DARK = 0.45        # DIRT keeps this share of the material's own colour ...
DIRT_GREY = 0.45        # ... after losing this much of its saturation toward a grey-brown
DIRT_TINT = (1.00, 0.95, 0.88)      # that grey-brown against a neutral grey: smog and dust, not soot
MATTE = 0.80            # and it is at least this rough ...
MATTE_ON = classes.MASONRY      # ... on the porous fabric alone: a smooth finish keeps its own gloss (see THE LOOK)
CLASS_AMOUNT = {classes.BRICK: 1.0, classes.TERRACOTTA: 1.0, classes.STONE: 1.0, classes.METAL: 0.6,
                classes.PAINT: 0.6, classes.GLAZED: 0.4, classes.WOOD: 0.35}   # glass and none: nothing. The glazed
                # brick and the varnished oak of the portal's recess hold less of it and are wiped by hand (and the
                # portal as a whole is washed down with the entrance: PORTAL_KEEP)
BARE = (0.75, 0.90)     # a metal this metallic is bare metal, not paint (the portal's brass and bronze read 1.0, the
                        # doors' bronze hardware 0.92; the painted iron and steel 0.6 to 0.7): polished by hand, it
                        # takes none


def s_at(f, c):                  # a face-local column's centre
    return FACADES[f].s0 + (np.asarray(c) + 0.5) * RES


def z_at(r):                     # a row's centre
    return ATLAS.z0 + (np.asarray(r) + 0.5) * RES


def rain_directions():
    """(theta, phi, weight, c, a) per direction: the share a wall facing the street intercepts, and the ray back toward
    the rain as outward metres (c) and sideways texels (a) per row it rises."""
    out = []
    for th in RAIN_THETA:
        for ph in RAIN_PHI:
            t, p = math.radians(th), math.radians(ph)
            a = math.tan(t) * math.sin(p)
            if abs(a) > MAX_LATERAL: a = math.copysign(MAX_LATERAL, a)
            out.append((th, ph, math.sin(t) * math.cos(p), math.tan(t) * math.cos(p) * RES, a))
    return out


def catch_ratio(f, s, z):
    """The wind-driven rain catch across face f at (s, z), 0..1 (1 at a top corner): the height law, raised in the top
    edge's zone and each side edge's (numpy arrays welcome)."""
    F = FACADES[f]
    s = np.asarray(s, np.float64); z = np.asarray(z, np.float64)
    h = CATCH_FOOT + (1.0 - CATCH_FOOT) * np.clip((z - Z_GROUND) / (Z_TOP - Z_GROUND), 0.0, 1.0)
    top = np.clip((z - (Z_TOP - CATCH_TOP)) / CATCH_TOP, 0.0, 1.0)
    sharp = [corner_sharpness(f, 0), corner_sharpness(f, 1)]
    side = np.maximum(np.clip(1.0 - s / CATCH_SIDE, 0.0, 1.0) * sharp[0],
                      np.clip(1.0 - (F.L - s) / CATCH_SIDE, 0.0, 1.0) * sharp[1])
    edge = np.maximum(top, side * (0.5 + 0.5 * top))
    return h * (1.0 + CATCH_EDGE * edge) / (1.0 + CATCH_EDGE)


def corner_sharpness(f, end):
    # 1 at a square corner of the block, 0.5 at the chamfer's 135 degree ones: the turn to the next face over 90 degrees
    F = FACADES[f]; G = FACADES[(f + (1 if end else -1)) % len(FACADES)]
    turn = math.degrees(math.acos(max(-1.0, min(1.0, F.t[0] * G.t[0] + F.t[1] * G.t[1]))))
    return min(1.0, turn / 90.0)


def sample(field, f, s, z, key="data"):
    """A published field (shelter, exposure or front) at face f's (s, z): bilinear, numpy arrays welcome."""
    res, z0 = field["res"], field["z0"]; data = np.asarray(field[key], np.float64)
    F = FACADES[f]
    x = (F.off + (np.asarray(s, np.float64) - F.s0)) / res - 0.5
    y = (np.asarray(z, np.float64) - z0) / res - 0.5
    x0 = np.clip(np.floor(x).astype(np.int64), 0, data.shape[1] - 2)
    y0 = np.clip(np.floor(y).astype(np.int64), 0, data.shape[0] - 2)
    fx = np.clip(x - x0, 0.0, 1.0); fy = np.clip(y - y0, 0.0, 1.0)
    return ((data[y0, x0] * (1 - fx) + data[y0, x0 + 1] * fx) * (1 - fy)
            + (data[y0 + 1, x0] * (1 - fx) + data[y0 + 1, x0 + 1] * fx) * fy)


# ---------------------------------------------------------------------------------------------------- the elevation
def cast(blk, f, see):
    """Face f as the street sees it, on this mask's texels: depth D (nan where nothing), class C, instance I and the
    normal's z NZ of the first surface a level ray meets, the fire escapes looked through."""
    from mathutils import Vector
    F = FACADES[f]; H = ATLAS.shape(RES)[0]; W = int(round(F.width / RES))
    D = np.full((H, W), np.nan, np.float32); C = np.full((H, W), -1, np.int8); I = np.full((H, W), -1, np.int32)
    NZ = np.zeros((H, W), np.float32)
    ray = blk.bvh.ray_cast; tri_class, tri_inst = blk.tri_class, blk.tri_inst
    dirv = Vector((-F.n[0], -F.n[1], 0.0)); nx, ny, cn = F.n[0], F.n[1], F.c_n
    rows = range(max(0, int((Z_LO - ATLAS.z0) / RES)), min(H, int(math.ceil((Z_HI - ATLAS.z0) / RES))))
    n = 0
    for c in range(W):
        s = F.s0 + (c + 0.5) * RES
        x0 = F.a[0] + s * F.t[0] + D_FROM * nx; y0 = F.a[1] + s * F.t[1] + D_FROM * ny
        for r in rows:
            o = Vector((x0, y0, ATLAS.z0 + (r + 0.5) * RES)); reach = REACH
            while True:
                loc, nor, t, dist = ray(o, dirv, reach); n += 1
                if loc is None or not see[tri_inst[t]]: break
                o = loc + dirv * 0.002; reach -= dist + 0.002
            if loc is None: continue
            D[r, c] = nx * loc.x + ny * loc.y - cn; C[r, c] = tri_class[t]; I[r, c] = tri_inst[t]; NZ[r, c] = nor.z
    return D, C, I, NZ, n


def platforms(blk, f, W):
    """The fire escapes' platforms on face f, laid into the envelope as the slabs they are: (depth, instance) per
    texel over each platform's height and span, OPEN elsewhere. A level of flat, downward-facing parts is a platform
    when it adds up to PLATFORM_AREA and fills PLATFORM_FILL of its footprint (a rail's ring or a stair tread does
    not)."""
    F = FACADES[f]; H = ATLAS.shape(RES)[0]
    Dp = np.full((H, W), OPEN, np.float32); Ip = np.full((H, W), -1, np.int32); found = []
    for rec in blk.instances(SEE_THROUGH[0]):
        P, N, A, _ = blk.triangles(rec)
        cen = P.reshape(-1, 3).mean(axis=0)
        if int(facade_of(cen[0], cen[1])) != f: continue
        S, Dd, Z = F.sdz(P[..., 0], P[..., 1], P[..., 2])
        down = N[:, 2] < -0.9
        zc = Z.mean(axis=1)
        order = np.argsort(zc[down]); idx = np.nonzero(down)[0][order]
        groups, cur = [], []
        for i in idx:
            if cur and zc[i] - zc[cur[0]] > 0.10:
                groups.append(cur); cur = []
            cur.append(i)
        if cur: groups.append(cur)
        for g in groups:
            g = np.array(g)
            s0, s1 = float(S[g].min()), float(S[g].max()); d0, d1 = float(Dd[g].min()), float(Dd[g].max())
            area = float(A[g].sum())
            if area < PLATFORM_AREA or area < PLATFORM_FILL * (s1 - s0) * (d1 - d0): continue
            zb = float(Z[g].min())
            # the slab: from its underside up to the flat parts facing up within 0.10 above it (its deck)
            up = (N[:, 2] > 0.9) & (zc >= zb - 0.01) & (zc <= zb + 0.10)
            zt = float(Z[up].max()) if up.any() else zb + RES
            r0 = int(math.floor((zb - ATLAS.z0) / RES)); r1 = int(math.floor((zt - ATLAS.z0) / RES))
            c0 = int(math.floor((s0 - F.s0) / RES)); c1 = int(math.floor((s1 - F.s0) / RES))
            Dp[r0:r1 + 1, max(c0, 0):min(c1 + 1, W)] = np.maximum(Dp[r0:r1 + 1, max(c0, 0):min(c1 + 1, W)], d1)
            Ip[r0:r1 + 1, max(c0, 0):min(c1 + 1, W)] = rec["i"]
            found.append(dict(object=rec["object"], s0=s0, s1=s1, z0=zb, z1=zt, d_front=d1, d_back=d0))
    return Dp, Ip, found


def overhanging(env):
    """env where the envelope overhangs, OPEN elsewhere. Going down its column from a surface, it overhangs when a
    surface OVH_MIN further back comes within OVH_LOOK before any surface that stands further out than it does (which
    carries it: the wall above the ground floor's crown does not overhang the storefronts under that crown). Below a
    column's lowest surface the base is taken to go on down, so nothing overhangs the pavement. Returns (overhanging
    envelope, the padded envelope)."""
    H, W = env.shape
    valid = env > OPEN
    low = np.where(valid.any(axis=0), np.argmax(valid, axis=0), H)          # each column's lowest surface
    base = env[np.clip(low, 0, H - 1), np.arange(W)]
    pad = env.copy()
    below = np.arange(H)[:, None] < low[None, :]
    pad[below] = np.broadcast_to(base[None, :], (H, W))[below]
    K = int(round(OVH_LOOK / RES))
    ext = np.concatenate([np.broadcast_to(pad[:1], (K, W)), pad], axis=0)   # below the atlas: the base again
    carried = np.zeros((H, W), bool); over = np.zeros((H, W), bool)
    for k in range(1, K + 1):
        e = ext[K - k:K - k + H]                                           # the surface k rows below
        over |= ~carried & (e < pad - OVH_MIN)
        carried |= e > pad + CARRY
    return np.where(valid & over, env, OPEN).astype(np.float32), pad


def horizon(env, c_row, a, gaps):
    """For every texel (r, j): the most the envelope above stands out of the ray that leaves it rising one row at a
    time, c_row metres further out and a texels further along per row: max over k >= 1 of env[r+k, j+off] - k c_row,
    along a digital line whose column offsets are global (so the line above a texel's is its own, and one running
    maximum per row serves them all). `gaps` are the empty columns between the faces, where nothing carries across."""
    H, W = env.shape
    off = np.floor(a * np.arange(H + 1) + 0.5).astype(np.int64)
    M = np.full((H, W), NEG, np.float32)
    G = env[H - 1].copy()
    G[gaps] = NEG
    for r in range(H - 2, -1, -1):
        d = int(off[r + 1] - off[r])
        if d == 0: sh = G
        else:
            sh = np.full(W, NEG, np.float32)
            if d > 0: sh[:-d] = G[d:]
            else: sh[-d:] = G[:d]
        M[r] = sh - c_row
        G = np.maximum(env[r], M[r])
        G[gaps] = NEG
    return M


# ---------------------------------------------------------------------------------------------------- the sources
def family_of(rec):
    if rec["instancer"]: return "portal"
    for key, rx in FAMILIES:
        if re.match(rx, rec["object"]): return key
    return "other"


FAMILY_KEYS = [k for k, _ in FAMILIES] + ["portal", "other"]


def drip_runs(env, pad, ovh, ok, I, fam_of_inst):
    """The drip edges of one face in runs. A drip edge is an overhanging texel whose surface is masonry or a platform
    (`ok`) and whose surface below steps back at least EDGE_MIN; edge texels of one family that touch (8-connected)
    make one run, and a run shorter than RUN_MIN along the face is not a source of its own. Returns the runs (their
    edge segments per row, their column span and family) and each edge texel's run (-1 elsewhere)."""
    H, W = env.shape
    below = np.concatenate([pad[:1], pad[:-1]], axis=0)
    edge = (ovh > OPEN) & (env - below >= EDGE_MIN) & ok & (I >= 0)
    fam = np.where(edge, fam_of_inst[np.clip(I, 0, None)], -1)
    segs = []                                                   # (row, first col, last col, family) per row segment
    for r in np.nonzero(edge.any(axis=1))[0]:
        row = fam[r]
        cols = np.nonzero(row >= 0)[0]
        brk = np.where((np.diff(cols) > 1) | (row[cols[1:]] != row[cols[:-1]]))[0]
        for part in np.split(cols, brk + 1):
            segs.append((int(r), int(part[0]), int(part[-1]), int(row[part[0]])))
    parent = list(range(len(segs)))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    by_row = {}
    for k, sg in enumerate(segs): by_row.setdefault(sg[0], []).append(k)
    for k, (r, a0, a1, fm) in enumerate(segs):             # join a segment to the ones of its family it touches below
        for j in by_row.get(r - 1, []):
            _, b0, b1, fb = segs[j]
            if fb == fm and b0 <= a1 + 1 and a0 <= b1 + 1:
                ra, rb = root(k), root(j)
                if ra != rb: parent[max(ra, rb)] = min(ra, rb)
    groups = {}
    for k in range(len(segs)): groups.setdefault(root(k), []).append(k)
    runs, edge_run = [], np.full((H, W), -1, np.int32)
    for key in sorted(groups):
        ks = groups[key]
        c0 = min(segs[k][1] for k in ks); c1 = max(segs[k][2] for k in ks)
        if (c1 - c0 + 1) * RES < RUN_MIN: continue
        for k in ks:
            r, a0, a1, _ = segs[k]
            edge_run[r, a0:a1 + 1] = len(runs)
        runs.append(dict(segs=[segs[k] for k in ks], c0=c0, c1=c1, fam=FAMILY_KEYS[segs[ks[0]][3]]))
    return runs, edge_run


def attribute(edge_run, reach, need):
    """Which run each texel in `need` belongs to: the first drip edge above it in its column, as long as it lies within
    that edge's reach (REACH_K times its projection, at least REACH_MIN); a texel with none (in the lateral penumbra
    beside a projection's end, or sheltered by its own profile, a cove under its crest) takes its nearest labelled
    neighbour's, grown out a texel at a time. Returns the labels and how many texels in `need` were left without one."""
    H, W = edge_run.shape
    lab = np.full((H, W), -1, np.int32)
    cur = np.full(W, -1, np.int32); lim = np.full(W, np.inf)
    for r in range(H - 1, -1, -1):
        z = float(z_at(r))
        lab[r] = np.where(z >= lim, cur, -1)                    # under the drip edges passed so far, within reach
        hit = edge_run[r] >= 0
        cur = np.where(hit, edge_run[r], cur)
        lim = np.where(hit, z - 0.5 * RES - reach[np.clip(edge_run[r], 0, None)], lim)
    lab[~need] = -1
    todo = need & (lab < 0)
    for _ in range(400):
        if not todo.any(): break
        grown = False
        for axis, sh in ((1, 1), (1, -1), (0, 1), (0, -1)):    # from the left, the right, below, above
            nb = np.full((H, W), -1, np.int32)
            if axis == 1:
                if sh > 0: nb[:, sh:] = lab[:, :-sh]
                else: nb[:, :sh] = lab[:, -sh:]
            else:
                if sh > 0: nb[sh:, :] = lab[:-sh, :]
                else: nb[:sh, :] = lab[-sh:, :]
            take = todo & (nb >= 0)
            if take.any():
                lab[take] = nb[take]; todo &= ~take; grown = True
        if not grown: break
    left = int(todo.sum())
    if left and (lab >= 0).any():
        # an island of shelter out of reach of every edge and touching no labelled texel (a sliver at a face's end):
        # it goes to the nearest labelled texel
        lr, lc = np.nonzero(lab >= 0)
        for r, c in zip(*np.nonzero(todo)):
            j = int(np.argmin((lr - r) ** 2 + (lc - c) ** 2))
            lab[r, c] = lab[lr[j], lc[j]]
    return lab, left


def dilate(m, k):
    out = m.copy()
    for _ in range(k):
        o = out.copy()
        o[1:] |= out[:-1]; o[:-1] |= out[1:]; o[:, 1:] |= out[:, :-1]; o[:, :-1] |= out[:, 1:]
        out = o
    return out


def run_edge(F, run, env, pad):
    """A run's drip edge as a polyline along the face (world points), from each column's lowest edge texel: the
    projection's front at its lower edge. Points are kept where the edge changes height, so a straight run is two."""
    low = {}
    for r, a0, a1, _ in run["segs"]:
        for c in range(a0, a1 + 1):
            if c not in low or r < low[c]: low[c] = r
    cols = sorted(low)
    pts, prev = [], None
    for i, c in enumerate(cols):
        r = low[c]
        if i in (0, len(cols) - 1) or r != prev or (i + 1 < len(cols) and low[cols[i + 1]] != r):
            s = float(s_at(F.idx, c)) + (-0.5 * RES if i == 0 else 0.5 * RES if i == len(cols) - 1 else 0.0)
            pts.append(F.world(s, float(env[r, c]), float(z_at(r)) - 0.5 * RES))
        prev = r
    rs = np.array([low[c] for c in cols]); cs = np.array(cols)
    return pts, rs, cs


# ---------------------------------------------------------------------------------------------------- the elements
def smoothstep(e0, e1, x):
    t = np.clip((np.asarray(x, np.float64) - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def element_vary(F, fam, s0, s1, z, obj):
    """A drip edge's element and its drawn share of the soiling and stretch of its reach: (key, share, stretch), or
    (None, 1, 1) for the continuous courses. The seed is the element's own place -- its family, face, span and height,
    or for a portal its instance, whose drip edges vary together -- hashed, so every rebuild draws the same values and a
    change elsewhere on the model reshuffles nothing."""
    if fam not in VARY: return None, 1.0, 1.0
    if fam == "portal" and obj: key = "portal:" + obj.split("/")[0]
    else: key = f"{fam}:{F.name}:{s0:.2f}:{s1:.2f}:{z:.2f}"
    h = hashlib.sha256(key.encode("utf-8")).digest()
    u = [int.from_bytes(h[2 * i:2 * i + 2], "big") / 65535.0 for i in range(4)]
    (a0, a1), (b0, b1) = VARY[fam]
    share = a0 + (a1 - a0) * 0.5 * (u[0] + u[1])
    stretch = b0 + (b1 - b0) * 0.5 * (u[2] + u[3])
    if fam == "portal": share *= PORTAL_KEEP
    return key, share, stretch


def shelter_law(x):
    # the rain model's shelter under a long projection x projections below its edge (the README's table within 0.06):
    # a weight for blend_elements, not the shelter itself, which the sweep measures
    return 1.0 / (1.0 + (np.maximum(x, 0.0) / 1.04) ** 1.94)


def blend_elements(runs, lab, H, W):
    """The elements' shares and stretches as smooth fields over one face: at each texel, the mean of the drip edges'
    own values weighted by the shelter each would give there alone (shelter_law of its own projection, down its span
    and, beside it, over its own penumbra), so that where one overhang's shelter lies over another's -- a fire escape's
    platform over the window heads under it -- the one that shelters most leads, and a value changes only where the
    shelter does, never along a line where two marks happen to meet. (1, 1) wherever no drip edge shelters."""
    wsum, wshare, wstretch = np.zeros((H, W)), np.zeros((H, W)), np.zeros((H, W))
    for k, run in enumerate(runs):
        p = max(run["proj"], OVH_MIN); reach = max(REACH_MIN, REACH_K * p)
        er, ec = run["er"], run["ec"]                           # each span column's lowest edge row
        ze = z_at(er) - 0.5 * RES                               # and the arris over it
        rows = np.arange(max(0, int(math.floor((float(ze.min()) - reach - ATLAS.z0) / RES))), int(er.max()))
        if len(rows):
            h = ze[None, :] - z_at(rows)[:, None]
            S = np.where((h > 0.0) & (h <= reach), shelter_law(h / p), 0.0)
            ix = np.ix_(rows, ec)
            wsum[ix] += S; wshare[ix] += S * run["share"]; wstretch[ix] += S * run["stretch"]
        side = lab == k                                         # its own texels beside its span: the penumbra
        side[:, run["c0"]:run["c1"] + 1] = False
        if side.any():
            rr, cc = np.nonzero(side)
            near = np.clip(np.searchsorted(ec, cc), 0, len(ec) - 1)
            h = ze[near] - z_at(rr); d = np.abs(cc - ec[near]) * RES
            S = np.where((h > 0.0) & (h <= reach), shelter_law(h / p), 0.0) * np.clip(1.0 - d / max(p, 0.1), 0.0, 1.0)
            wsum[rr, cc] += S; wshare[rr, cc] += S * run["share"]; wstretch[rr, cc] += S * run["stretch"]
    some = wsum > 1e-6
    return (np.where(some, wshare / np.where(some, wsum, 1.0), 1.0),
            np.where(some, wstretch / np.where(some, wsum, 1.0), 1.0))


def top_runoff(D, NZ):
    """The texels the run-off of the building's own top runs down before it drips: from each column's highest surface,
    down a face that steps less than TOP_TOL from one row to the next, or back along an underside that leans out (an
    outward-leaning lip, which the water that goes over the top's arris follows back), until the surface steps back
    further (an arris the water drips from) or out (something that catches it). The film on a face runs on sideways
    too, at that face's depth, where a column's own top is something else (the return of a corner pavilion's crown)."""
    H, W = D.shape
    surf = np.isfinite(D)
    lip = surf & (NZ > LIP_NZ[0]) & (NZ < LIP_NZ[1])
    wet = np.zeros((H, W), bool)
    for c in np.nonzero(surf.any(axis=0))[0]:
        r = int(np.nonzero(surf[:, c])[0].max()); wet[r, c] = True
        while r > 0 and surf[r - 1, c]:
            step = float(D[r, c] - D[r - 1, c])              # > 0: the surface below stands further back
            if step < -TOP_TOL or step > (LIP_STEP if lip[r, c] else TOP_TOL): break
            r -= 1; wet[r, c] = True
    level = np.abs(np.diff(np.where(surf, D, np.inf), axis=1)) <= TOP_TOL    # a texel and the next along at one depth
    for _ in range(TOP_SPREAD):
        side = np.zeros((H, W), bool)
        side[:, 1:] |= wet[:, :-1] & level; side[:, :-1] |= wet[:, 1:] & level
        side &= surf & ~wet
        if not side.any(): break
        wet |= side
    return wet


# ---------------------------------------------------------------------------------------------------- indoors
def _fan_in(F):
    # the directions a street viewer looks through a pane of face F along, into the building (unit vectors)
    out = []
    for el in PANE_EL:
        for az in PANE_AZ:
            e, a = math.radians(el), math.radians(az)
            out.append((-F.n[0] * math.cos(e) * math.cos(a) + F.t[0] * math.cos(e) * math.sin(a),
                        -F.n[1] * math.cos(e) * math.cos(a) + F.t[1] * math.cos(e) * math.sin(a), math.sin(e)))
    return out


def pane_views(blk):
    """What the panes show. From points PANE_STEP apart on each pane's street face (or on a single sheet of glass that
    faces in), rays into the building over the fan a street viewer looks along, each past the pane's own faces to the
    first surface behind it. Returns {instance: {its triangle seen: the first PANE_HITS points it was seen at}} and the
    number of rays cast."""
    from mathutils import Vector
    ray, cls = blk.bvh.ray_cast, blk.tri_class
    first = np.zeros(len(blk.inst) + 1, np.int64)
    first[1:] = np.cumsum(np.bincount(blk.tri_inst, minlength=len(blk.inst)))
    gl = np.nonzero(cls == classes.GLASS)[0]
    P = blk.V[blk.T[gl]]
    cr = np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0])
    nrm = cr / np.maximum(np.linalg.norm(cr, axis=1), 1e-12)[:, None]
    cen = P.mean(axis=1)
    fg = facade_of(cen[:, 0], cen[:, 1])
    fn = np.array([FACADES[int(f)].n for f in fg]).reshape(-1, 2)
    nd = nrm[:, 0] * fn[:, 0] + nrm[:, 1] * fn[:, 1]
    inst = blk.tri_inst[gl]
    street = np.isin(inst, np.unique(inst[nd >= 0.5]))
    fans = [[Vector(d) for d in _fan_in(F)] for F in FACADES]
    seen, n = {}, 0
    for k in np.nonzero((nd >= 0.5) | ((nd <= -0.5) & ~street))[0]:
        F = FACADES[int(fg[k])]
        a, b, c = P[k]
        m = max(1, int(math.ceil(max(np.linalg.norm(b - a), np.linalg.norm(c - b), np.linalg.norm(a - c)) / PANE_STEP)))
        ahead = Vector((F.n[0], F.n[1], 0.0)) * 0.002
        for i in range(m):
            for j in range(m - i):
                u, v = (i + 1.0 / 3.0) / m, (j + 1.0 / 3.0) / m
                if u + v > 1.0: continue
                p = Vector(a + u * (b - a) + v * (c - a)) + ahead
                for d in fans[F.idx]:
                    o, reach, went, g0 = p, PANE_REACH, 0.0, None
                    while True:
                        loc, _, t, dist = ray(o, d, reach); n += 1
                        if loc is None: break
                        went += dist
                        if cls[t] != classes.GLASS: break
                        if g0 is None: g0 = went
                        elif went - g0 > PANE_SKIP: loc = None; break         # the next pane: not this one's view
                        o = loc + d * 0.001; reach -= dist + 0.001; went += 0.001
                    if loc is None or g0 is None or cls[t] == classes.NONE: continue
                    key = int(blk.tri_inst[t])
                    pts = seen.setdefault(key, {}).setdefault(int(t - first[key]), [])
                    if len(pts) < PANE_HITS: pts.append(np.array(loc, np.float64))
    return seen, n


def _line(blk, o, w, L):
    """A sight line from o along w for L: ('clear', None) when it meets nothing, ('glass', pane) when it meets nothing
    but glass -- the pane the plane of the first broad face of glass it meets (normal toward the street, offset), None
    when it met the glass only through a pane's edge --, ('opaque', None) when it meets anything else."""
    ray, cls = blk.bvh.ray_cast, blk.tri_class
    pane, glass, rem = None, False, L
    while True:
        loc, nor, t, dist = ray(o, w, rem)
        if loc is None: return ("glass", pane) if glass else ("clear", None)
        if cls[t] != classes.GLASS: return "opaque", None
        glass = True
        if pane is None:
            g = nor if nor.dot(w) > 0.0 else -nor
            F = FACADES[int(facade_of(loc.x, loc.y))]
            if abs(g.x * F.n[0] + g.y * F.n[1]) >= BROAD: pane = (tuple(g), g.dot(loc))
        o = loc + w * 0.001; rem -= dist + 0.001
        if rem <= 0.0: return "glass", pane


def _sight(blk, q, nn):
    """How the street sees the point q of a face turned nn: ('out', None) when a sight line to one of its viewpoints in
    front of q's face (VIEW_D, VIEW_Z, VIEW_S) is clear, else ('in', the pane) when one passes nothing but glass, else
    ('hidden', None). A clear line counts only when most of the 4 lines beside it, SLIT apart, are clear too: the model
    leaves narrow gaps between a pane and its door or frame, which no one sees the street through."""
    from mathutils import Vector
    F = FACADES[int(facade_of(q[0], q[1]))]
    s = F.sdz(q[0], q[1], q[2])[0]
    n = Vector(nn); o0 = Vector(q) + n * 0.001
    pane, through = None, False
    for D in VIEW_D:
        for Z in VIEW_Z:
            for ds in VIEW_S:
                w = Vector(F.world(s + ds, D, Z_GROUND + Z)) - o0
                L = w.length
                w /= L
                if w.dot(n) <= 0.02: continue                       # behind the face
                kind, pl = _line(blk, o0, w, L)
                if kind == "clear":
                    a = w.cross(Vector((0.0, 0.0, 1.0)))
                    if a.length < 1e-6: a = w.cross(Vector((1.0, 0.0, 0.0)))
                    a.normalize(); b = w.cross(a)
                    lift = o0 + n * SLIT
                    if sum(_line(blk, lift + e * SLIT, w, L)[0] == "clear" for e in (a, -a, b, -b)) >= 3:
                        return "out", None
                elif kind == "glass":
                    through = True
                    if pane is None: pane = pl
    return ("in", pane) if through and pane is not None else ("hidden", None)


def indoors(blk):
    """The faces the street sees only through glass (INDOORS above), by the meshes that draw them, each with the plane
    of the pane it is seen through in the mesh's own space. A mesh's faces are judged in FACETS, the faces of one plane
    that share a corner (a quad split into two triangles is one side of a bar, and its two halves must not differ).
    Each facet the panes show (pane_views) is looked at from the street (_sight) at each face's centre and near each
    of its corners: it is indoors behind its pane when a point of it is seen through glass, the panes all such points
    are seen through are one plane, and its points behind that plane are seen from the street through glass or not at
    all, but for the odd one (VETO_SHARE; a point in front of the plane may be seen: a display window's frame runs from
    3 cm in front of its glass to 9 cm behind it, and only the part behind is indoors). A mesh with a facet indoors has
    every facet reaching behind its pane looked at, in every
    object that draws it (the export shares a mesh between the windows it frames), up to TEST_ALL faces; and a mesh is
    indoors whole when the facets looked at are all behind one pane, none seen from the street without glass, and
    every object drawing it lies wholly behind that pane. Returns ({"block": {object: entry}, "portal": {object:
    entry}}, counts), an entry dict(polys, faces, planes): the faces and each one's pane (normal toward the street,
    offset) in the object's own space."""
    import bpy
    seen, n_rays = pane_views(blk)
    dg = bpy.context.evaluated_depsgraph_get()
    objs = {(o.name, o.library is not None): o for o in bpy.data.objects}      # the block's own, and the portal's
    assert len(objs) == len(bpy.data.objects), "soiling: two objects of the block or of the portal share a name"

    def ob_of(rec):
        return objs[(rec["object"], rec["instancer"] is not None)]
    draws = {}                                              # every render-visible instance, by the mesh it draws
    for i, rec in enumerate(blk.inst):
        draws.setdefault(ob_of(rec).data.name_full, []).append(i)
    cache = {}

    def arrays(i):
        # instance i's evaluated mesh: its vertices in its own space and in the world, each polygon's vertices, centre,
        # reach and unit normal in the world and its unit normal in its own space, each of its triangles' polygon (the
        # Block reads the same loop triangles, in the same order), and its matrix
        if i in cache: return cache[i]
        rec = blk.inst[i]; me = ob_of(rec).evaluated_get(dg).data
        M = np.array(rec["matrix"], np.float64)
        lco = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", lco); lco = lco.reshape(-1, 3)
        co = lco @ M[:3, :3].T + M[:3, 3]
        npo = len(me.polygons)
        ls = np.empty(npo, np.int64); me.polygons.foreach_get("loop_start", ls)
        lt = np.empty(npo, np.int64); me.polygons.foreach_get("loop_total", lt)
        lv = np.empty(len(me.loops), np.int64); me.loops.foreach_get("vertex_index", lv)
        lpn = np.empty(npo * 3); me.polygons.foreach_get("normal", lpn); lpn = lpn.reshape(-1, 3)
        pn = lpn @ np.linalg.inv(M[:3, :3])
        pn /= np.maximum(np.linalg.norm(pn, axis=1), 1e-12)[:, None]
        tp = np.empty(len(me.loop_triangles), np.int64); me.loop_triangles.foreach_get("polygon_index", tp)
        verts = [lv[ls[p]:ls[p] + lt[p]] for p in range(npo)]
        cen = np.array([co[v].mean(axis=0) for v in verts]).reshape(-1, 3)
        rad = np.array([np.linalg.norm(co[v] - cen[p], axis=1).max() for p, v in enumerate(verts)])
        cache[i] = dict(M=M, lco=lco, co=co, verts=verts, cen=cen, rad=rad, pn=pn, lpn=lpn, tp=tp, npoly=npo)
        return cache[i]

    def facets(A):
        # the mesh's faces in facets: one plane (normal and offset in its own space, to the millimetre), a shared corner
        key = [tuple(np.round(np.append(A["lpn"][p], A["lpn"][p] @ A["lco"][v[0]]), 3)) for p, v in enumerate(A["verts"])]
        parent = list(range(A["npoly"]))

        def root(a):
            while parent[a] != a:
                parent[a] = parent[parent[a]]; a = parent[a]
            return a
        by_vert = {}
        for p, v in enumerate(A["verts"]):
            for x in v: by_vert.setdefault(int(x), []).append(p)
        for ps in by_vert.values():
            for p in ps[1:]:
                if key[p] == key[ps[0]]:
                    ra, rb = root(p), root(ps[0])
                    if ra != rb: parent[max(ra, rb)] = min(ra, rb)
        of = [root(p) for p in range(A["npoly"])]
        groups = {}
        for p, r in enumerate(of): groups.setdefault(r, []).append(p)
        return {r: g for r, g in groups.items()}, of

    def local(A, pane):
        # a world plane (normal, offset) in the instance's own space
        g, c = np.asarray(pane[0], np.float64), pane[1]
        nl = A["M"][:3, :3].T @ g; k = np.linalg.norm(nl)
        return nl / k, (c - g @ A["M"][:3, 3]) / k

    def look(A, faces, hits=()):
        # one facet looked at from the street: each face's centre and a point near each of its corners (on a face
        # larger than POINT_R), and the points the panes showed of it; each point's place in the object's own space,
        # verdict and pane
        pts = {}
        for p in faces:
            c = A["cen"][p]
            for q in [c] + ([c + CORNER * (A["co"][v] - c) for v in A["verts"][p][:8]] if A["rad"][p] > POINT_R else []):
                pts.setdefault(tuple(np.round(q, 4)), q)
        for q in hits: pts.setdefault(tuple(np.round(q, 4)), q)
        keys = sorted(pts)
        if len(keys) > FACET_PTS: keys = [keys[k] for k in np.linspace(0, len(keys) - 1, FACET_PTS).round().astype(int)]
        Mi = np.linalg.inv(A["M"][:3, :3])
        out = []
        for q in (pts[k] for k in keys):
            r, pane = _sight(blk, q, A["pn"][faces[0]])
            out.append((Mi @ (np.asarray(q) - A["M"][:3, 3]), r, local(A, pane) if pane is not None else None))
        return out

    def settle(looks):
        # a facet's pane in its own space from every look at it (every object drawing it): the panes its points are
        # seen through must be one plane ('mixed' otherwise), and its points behind that plane may be seen from the
        # street without glass at no more than VETO_SHARE of them ('seen' otherwise); None when no point of it is seen
        # through glass
        panes = [pl for L in looks for _, r, pl in L if pl is not None]
        if not panes: return None
        n0, c0 = panes[0]
        if any(pl[0] @ n0 < PLANE_COS or abs(pl[1] - c0) > PLANE_TOL for pl in panes): return "mixed"
        behind = [r for L in looks for x, r, _ in L if x @ n0 - c0 < -VETO]
        if sum(r == "out" for r in behind) > VETO_SHARE * len(behind): return "seen"
        return n0, c0
    tri_poly = {}                                           # mesh -> {instance: {polygon seen through glass: points}}
    for i, tris in seen.items():                            # (pane_views keeps no glass and no class NONE)
        A = arrays(i)
        polys = tri_poly.setdefault(ob_of(blk.inst[i]).data.name_full, {}).setdefault(i, {})
        for t in sorted(tris): polys.setdefault(int(A["tp"][t]), []).extend(tris[t])
    out = {"block": {}, "portal": {}}
    counts = dict(meshes=0, objects=0, faces=0, whole=0, mixed=0, skipped=[])
    for mk in sorted(tri_poly):
        per, us = tri_poly[mk], draws[mk]
        npoly = arrays(us[0])["npoly"]
        if any(len(ob_of(blk.inst[i]).data.polygons) != npoly for i in us):
            counts["skipped"].append(mk); continue          # a modifier: its faces are not the mesh's
        fac, of = facets(arrays(us[0]))
        looks = {}
        for i in sorted(per):
            for f in sorted({of[p] for p in per[i]}):
                hits = [q for p in fac[f] for q in per[i].get(p, ())]
                looks.setdefault(f, []).append(look(arrays(i), fac[f], hits))
        got = {f: settle(L) for f, L in looks.items()}
        if not any(isinstance(v, tuple) for v in got.values()): continue
        if npoly <= TEST_ALL:
            # every other facet reaching behind one of the panes found (a facet wholly in front of them cannot be behind
            # them), in every object
            known = [v for v in got.values() if isinstance(v, tuple)]
            lco, verts = arrays(us[0])["lco"], arrays(us[0])["verts"]
            reach = {f for f in fac if any(float((lco[np.concatenate([verts[p] for p in fac[f]])] @ n - c).min()) < -VETO
                                           for n, c in known)}
            for i in us:
                done = {of[p] for p in per.get(i, ())}
                for f in sorted(reach - done): looks.setdefault(f, []).append(look(arrays(i), fac[f]))
            got = {f: settle(L) for f, L in looks.items()}
        # a mesh lying wholly behind the one pane its facets are seen through, none of them seen from the street without
        # glass, is indoors whole: its facets no sight line reaches too (a vestibule's hidden faces, a medallion's)
        n0, c0 = next(v for v in got.values() if isinstance(v, tuple))
        whole = all(v is None or (isinstance(v, tuple) and v[0] @ n0 >= PLANE_COS and abs(v[1] - c0) <= PLANE_TOL)
                    for v in got.values())
        whole = whole and all(float((arrays(i)["lco"] @ n0 - c0).max()) < -WHOLE_TOL for i in us)
        if whole: got = {f: (n0, c0) for f in fac}
        counts["whole"] += whole
        counts["mixed"] += sum(len(fac[f]) for f, v in got.items() if isinstance(v, str) and v == "mixed")
        pane = {p: got[f] for f in got if isinstance(got[f], tuple) for p in fac[f]}
        faces = sorted(pane)
        if not faces: continue
        planes = [[round(float(x), 6) for x in pane[p][0]] + [round(float(pane[p][1]), 6)] for p in faces]
        counts["meshes"] += 1; counts["faces"] += len(faces)
        for i in us:
            rec = blk.inst[i]
            out["portal" if rec["instancer"] else "block"][rec["object"]] = dict(polys=npoly, faces=faces, planes=planes)
    counts["objects"] = len(out["block"]) + len(out["portal"])
    counts["rays"] = n_rays
    return out, counts


def build(ctx):
    import time
    blk = ctx.block
    t0 = time.time()
    see = np.array([d["object"].startswith(SEE_THROUGH) for d in blk.inst], bool)
    fam_of_inst = np.array([FAMILY_KEYS.index(family_of(d)) for d in blk.inst], np.int32)
    H, WA = ATLAS.shape(RES)
    D = np.full((H, WA), np.nan, np.float32); C = np.full((H, WA), -1, np.int8); I = np.full((H, WA), -1, np.int32)
    NZ = np.zeros((H, WA), np.float32)
    env = np.full((H, WA), OPEN, np.float32); env_i = np.full((H, WA), -1, np.int32)
    gaps = np.ones(WA, bool)
    n_rays, plats = 0, []
    for F in FACADES:
        a0, a1 = ATLAS.cols(F, RES)
        Df, Cf, If, NZf, n = cast(blk, F.idx, see); n_rays += n
        Dp, Ip, found = platforms(blk, F.idx, a1 - a0)
        plats += [dict(facade=F.idx, **p) for p in found]
        D[:, a0:a1] = Df; C[:, a0:a1] = Cf; I[:, a0:a1] = If; NZ[:, a0:a1] = NZf
        e = np.where(np.isfinite(Df), Df, OPEN).astype(np.float32); ei = If.copy()
        m = Dp > e; e[m] = Dp[m]; ei[m] = Ip[m]
        env[:, a0:a1] = e; env_i[:, a0:a1] = ei
        gaps[a0:a1] = False
    t1 = time.time()

    # the shelter: every rain direction swept down the atlas, over the overhangs alone and over the whole envelope
    ovh, pad = overhanging(env)
    surf = np.isfinite(D)
    D0 = (np.where(surf, D, OPEN) + BIAS).astype(np.float32)
    dirs = rain_directions()
    wsum = sum(d[2] for d in dirs)
    kept_ovh = np.zeros((H, WA), np.float32); kept_all = np.zeros((H, WA), np.float32)
    for th, ph, w, c_row, a in dirs:
        for E, acc in ((ovh, kept_ovh), (env, kept_all)):
            M = horizon(E, c_row, a, gaps)
            acc += np.float32(w) * np.clip((M - D0) / SOFT + 0.5, 0.0, 1.0)
    shelter = np.where(surf, np.clip(kept_ovh / wsum, 0.0, 1.0), 0.0).astype(np.float32)
    opened = np.where(surf, np.clip(1.0 - kept_all / wsum, 0.0, 1.0), 0.0).astype(np.float32)
    t2 = time.time()

    # the sources: the drip edges, per face, in runs; every sheltered texel is one mark from the first edge above it.
    # Only what a face's own shading points read is painted: the texels whose surface belongs to it by the bisector
    # rule (and a margin, for the lookup's filtering), not the next face seen obliquely past a corner
    masonry = np.zeros(len(classes.NAMES), bool); masonry[list(classes.MASONRY)] = True
    depth01 = np.clip((np.where(surf, D, DEPTH_LO) - DEPTH_LO) / DEPTH_SPAN, 0.0, 1.0).astype(np.float32)
    overhangs, lost, n_src, n_wet = [], 0, 0, 0
    for F in FACADES:
        a0, a1 = ATLAS.cols(F, RES)
        envf, padf, ovhf, Cf, Ief = env[:, a0:a1], pad[:, a0:a1], ovh[:, a0:a1], C[:, a0:a1], env_i[:, a0:a1]
        Sf = np.broadcast_to(s_at(F.idx, np.arange(a1 - a0))[None, :], (H, a1 - a0))
        Dff = np.where(surf[:, a0:a1], D[:, a0:a1], 0.0)
        X, Yw = F.a[0] + Sf * F.t[0] + Dff * F.n[0], F.a[1] + Sf * F.t[1] + Dff * F.n[1]
        owned = surf[:, a0:a1] & (facade_of(X, Yw) == F.idx)
        need = dilate(shelter[:, a0:a1] >= SHOWN, MARGIN) & surf[:, a0:a1] & dilate(owned, MARGIN)
        plat = (Ief >= 0) & see[np.clip(Ief, 0, None)]
        ok = (((Cf >= 0) & masonry[np.clip(Cf, 0, None).astype(np.int64)]) | plat) & owned
        runs, edge_run = drip_runs(envf, padf, ovhf, ok, Ief, fam_of_inst)
        for run in runs:                                       # each drip edge measured: its line, projection, reach
            pts, er, ec = run_edge(F, run, envf, padf)
            below = padf[np.clip(er - 1, 0, None), ec]
            run.update(pts=pts, er=er, ec=ec, below=below, proj=float(np.median(envf[er, ec] - below)))
        reach_lim = np.array([max(REACH_MIN, REACH_K * run["proj"]) for run in runs] or [0.0])
        lab, left = attribute(edge_run, reach_lim, need)
        lost += left
        shf, dpf = shelter[:, a0:a1], depth01[:, a0:a1]
        # each drip edge's element: its object, span and height, and the share and stretch drawn for it
        for run in runs:
            er, ec = run["er"], run["ec"]
            obj = [blk.inst[int(i)]["name"] for i in Ief[er, ec] if i >= 0]
            run["object"] = max(sorted(set(obj)), key=obj.count) if obj else None   # sorted: ties break the same way
            run["z_edge"] = float(np.median(z_at(er))) - 0.5 * RES
            run["s0"] = round(float(s_at(F.idx, run["c0"])) - 0.5 * RES, 3)
            run["s1"] = round(float(s_at(F.idx, run["c1"])) + 0.5 * RES, 3)
            run["element"], run["share"], run["stretch"] = element_vary(F, run["fam"], run["s0"], run["s1"],
                                                                        run["z_edge"], run["object"])
        share = np.array([run["share"] for run in runs] + [1.0])
        fac, stretch = blend_elements(runs, lab, H, a1 - a0)
        # the shelter as the soiling there reaches it (the stretch: R ** (1 / stretch) moves a gradient's foot up or
        # down the wall as a longer or shorter projection would; taken in from SHOWN to twice that, so a mark's own
        # margin still fades to nothing), and none where the top's run-off runs
        raw = shf.astype(np.float64)
        soil = np.where(lab >= 0, raw + (np.power(raw, 1.0 / stretch) - raw) * smoothstep(SHOWN, 2 * SHOWN, raw), 0.0)
        wet = top_runoff(D[:, a0:a1], NZ[:, a0:a1]) & (lab >= 0)
        soil[wet] = 0.0; n_wet += int(wet.sum())
        # on a drip edge's own row, the share of the element that edge belongs to, so the soffit under the edge (which
        # reads this row and the one below it) takes its own element's share -- unless the wall there is soiled by an
        # overhang above it, whose share that wall keeps
        e = (edge_run >= 0) & (lab >= 0)
        w = smoothstep(SHOW[0], SHOW[1], soil[e])
        fac[e] = share[edge_run[e]] * (1.0 - w) + fac[e] * w
        fac[wet] = 0.0
        up = np.clip((fac - 1.0) / UP_SPAN, 0.0, 1.0); down = np.clip(1.0 - fac, 0.0, 1.0)
        for k, run in enumerate(runs):
            sel = lab == k
            if not sel.any(): continue
            rr, cc = np.nonzero(sel)
            r_lo, r_hi, c_lo, c_hi = int(rr.min()), int(rr.max()), int(cc.min()), int(cc.max())
            pts, er, ec, below, proj = run["pts"], run["er"], run["ec"], run["below"], run["proj"]
            obj, z_edge = run["object"], run["z_edge"]
            info = dict(id=f"{run['fam']}:{F.name}:{n_src}", kind=run["fam"], facade=F.idx, s0=run["s0"], s1=run["s1"],
                        z=round(z_edge, 3), d_edge=round(float(np.median(envf[er, ec])), 3),
                        d_below=round(float(np.median(below)), 3), projection=round(proj, 3), object=obj,
                        element=run["element"], share=round(run["share"], 3), stretch=round(run["stretch"], 3))
            src = ctx.source(info["id"], "line", pts if len(pts) > 1 else pts * 2, facade=F.idx, what=run["fam"],
                             object=obj, projection=info["projection"], element=run["element"], share=info["share"],
                             stretch=info["stretch"])
            m = ctx.mark(src, F.idx, what=run["fam"])
            s0 = F.s0 + c_lo * RES + 0.25 * RES; s1 = F.s0 + (c_hi + 1) * RES - 0.25 * RES
            z0 = ATLAS.z0 + r_lo * RES + 0.25 * RES; z1 = ATLAS.z0 + (r_hi + 1) * RES - 0.25 * RES
            box = sel[r_lo:r_hi + 1, c_lo:c_hi + 1]
            for ch, arr in ((0, soil), (1, up), (2, down), (3, dpf)):
                ctx.paint(m, np.where(box, arr[r_lo:r_hi + 1, c_lo:c_hi + 1], 0.0), s0, s1, z0, z1, channel=ch, op="max")
            # the path the debug view draws: down the run's middle, from its drip edge to where the shelter its
            # element's soiling reaches fades; `reach` is the geometry's own, as before
            mid = int(ec[len(ec) // 2]); r_e = int(er[len(er) // 2])
            reach, soiled = 0.0, 0.0
            col = sel[:r_e, mid] & (shf[:r_e, mid] >= VIS)
            if col.any(): reach = z_edge - (float(z_at(int(np.nonzero(col)[0].min()))) - 0.5 * RES)
            col = sel[:r_e, mid] & (soil[:r_e, mid] >= VIS)
            if col.any():
                soiled = z_edge - (float(z_at(int(np.nonzero(col)[0].min()))) - 0.5 * RES)
                d_path = float(padf[max(r_e - 1, 0), mid]) + 0.02
                ctx.path(m, [F.world(float(s_at(F.idx, mid)), d_path, z_edge),
                             F.world(float(s_at(F.idx, mid)), d_path, z_edge - soiled)])
            info.update(reach=round(reach, 3), soiled_reach=round(soiled, 3), texels=int(sel.sum()))
            overhangs.append(info)
            n_src += 1
    t3 = time.time()
    publish(ctx, shelter, opened, D, C, overhangs, plats, dirs)
    by = {}
    for o in overhangs:
        b = by.setdefault(o["kind"], dict(n=0, proj=[], reach=[], el={}))
        b["n"] += 1; b["proj"].append(o["projection"]); b["reach"].append(o["reach"])
        if o["element"]: b["el"][o["element"]] = (o["share"], o["stretch"])
    ctx.log(f"   soiling: {n_rays} rays cast in {t1 - t0:.1f} s, {len(dirs)} rain directions swept in {t2 - t1:.1f} s, "
            f"{len(plats)} fire escape platforms, {n_src} drip edges traced in {t3 - t2:.1f} s"
            + (f"; {lost} sheltered texels beyond every edge's reach went to the nearest mark" if lost else "")
            + f"; the top's run-off washes {n_wet} texels ({n_wet * RES * RES:.1f} m2)")
    for k in FAMILY_KEYS:
        if k not in by: continue
        b = by[k]
        el = np.array(list(b["el"].values())) if b["el"] else None
        ctx.log(f"   soiling {FAMILY_LABEL.get(k, k):<22} {b['n']:4d}: projection {np.median(b['proj']):.3f} m "
                f"({min(b['proj']):.3f}..{max(b['proj']):.3f}), shelter reaches {np.median(b['reach']):.2f} m "
                f"({min(b['reach']):.2f}..{max(b['reach']):.2f})"
                + (f"; {len(el)} elements, share {np.median(el[:, 0]):.2f} ({el[:, 0].min():.2f}..{el[:, 0].max():.2f}), "
                   f"stretch {np.median(el[:, 1]):.2f} ({el[:, 1].min():.2f}..{el[:, 1].max():.2f})"
                   if el is not None else ""))
    # indoors: behind the pane it is seen through, a face the street sees only through glass takes none (apply()'s
    # attributes). It changes neither the mask nor the published fields
    t4 = time.time()
    ctx.stash["indoors"], nc = indoors(blk)
    kinds = {}
    for part in ("block", "portal"):
        for name, e in ctx.stash["indoors"][part].items():
            k = re.sub(r"\d+", "#", re.sub(r"\.\d+$", "", name))       # storefront_transom_solid__#, mesh__t#_#_#_frame
            kinds.setdefault(k, [0, 0]); kinds[k][0] += 1; kinds[k][1] += len(e["faces"])
    ctx.log(f"   soiling indoors: {nc['rays']} rays from the panes, {nc['faces']} faces of {nc['meshes']} meshes "
            f"({nc['whole']} whole) seen from the street only through glass, on {nc['objects']} objects, in "
            f"{time.time() - t4:.1f} s; {nc['mixed']} faces seen through panes that are not one plane left as they are"
            + (f"; skipped (modifiers) {', '.join(nc['skipped'])}" if nc["skipped"] else ""))
    ctx.log("   soiling indoors by object: " + ", ".join(f"{k} {v[0]} ({v[1]} faces)" for k, v in
                                                         sorted(kinds.items(), key=lambda kv: -kv[1][1])))


def publish(ctx, shelter, opened, D, C, overhangs, plats, dirs):
    """What the features that follow read (ctx.field("soiling", key)); see the README for the formats."""
    H, WA = shelter.shape
    catch = np.zeros((H, WA), np.float32)
    for F in FACADES:
        a0, a1 = ATLAS.cols(F, RES)
        S, Z = np.meshgrid(s_at(F.idx, np.arange(a1 - a0)), z_at(np.arange(H)))
        catch[:, a0:a1] = catch_ratio(F.idx, S, Z)
    surf = np.isfinite(D)
    meta = dict(res=RES, z0=ATLAS.z0, atlas=ATLAS.to_dict())
    ctx.publish("shelter", dict(meta, data=shelter.astype(np.float16), note=(
        "the share of the wind-driven rain OVERHANGS keep off the surface the street sees at (s, z), 0..1: 0 in the "
        "open, 1 right under a deep projection; what the soiling paints (undersides are soiled by orientation in the "
        "shader, not here)")))
    ctx.publish("exposure", dict(meta, data=np.where(surf, opened * catch, 0.0).astype(np.float16),
                                 open=opened.astype(np.float16), catch=catch.astype(np.float16), note=(
        "the wind-driven rain the surface the street sees at (s, z) receives, 0..1: `open` (the share of the rain "
        "that reaches it past everything that stands out, overhangs and proud piers alike, against an open wall "
        "facing the street) times `catch` (the wind's catch across the face: most at the top edge and top corners, "
        "catch_ratio()); data = open * catch, 1 at an open top corner")))
    ctx.publish("front", dict(meta, depth=D.astype(np.float16), cls=C.copy(), note=(
        "the facade as the street sees it on these texels: the depth d of the first surface a level ray meets (nan "
        "where nothing; the fire escapes looked through) and its material class (-1 where nothing)")))
    ctx.publish("overhangs", overhangs)
    ctx.publish("rain", dict(theta=list(RAIN_THETA), phi=list(RAIN_PHI), weights=[round(d[2], 6) for d in dirs],
                             ovh_min=OVH_MIN, ovh_look=OVH_LOOK, platforms=plats, note=(
        "every (theta, phi) the same share of the rain; a wall facing the street intercepts sin(theta) cos(phi) of "
        "it (`weights`); a surface overhangs where it stands ovh_min further out than a surface within ovh_look below "
        "it, before anything below stands further out than it")))


# ---------------------------------------------------------------------------------------------------- apply
def _write_indoors(actx, entries):
    """Each face indoors carries the plane of the pane it is seen through, in its object's own space: the normal toward
    the street in the face attribute PANE_ATTR, the offset in wear_soiling (which the shader reads as Attr); every other
    face 0 in both. A mesh the export shares between windows takes them once, in place, when every object drawing it
    has the same faces and panes (so it does: the panes are in the mesh's own space): the attributes change nothing but
    this feature's look, and the objects stay instances of one mesh. Otherwise an object is given its own copy first."""
    import bpy
    by_mesh = {}
    for name, e in sorted(entries.items()):
        o = actx.object(name)
        assert len(o.data.polygons) == e["polys"], \
            f"soiling: {name} is not the mesh the build measured ({len(o.data.polygons)} faces, not {e['polys']})"
        by_mesh.setdefault(o.data.name_full, []).append((o, e))

    def write(me, e):
        n = np.zeros((e["polys"], 3)); c = np.zeros(e["polys"])
        pl = np.asarray(e["planes"], np.float64).reshape(-1, 4)
        n[e["faces"]] = pl[:, :3]; c[e["faces"]] = pl[:, 3]
        for nm, kind, arr, key in (("wear_" + NAME, 'FLOAT', c, "value"), (PANE_ATTR, 'FLOAT_VECTOR', n, "vector")):
            if nm in me.attributes: me.attributes.remove(me.attributes[nm])
            me.attributes.new(nm, kind, 'FACE').data.foreach_set(key, arr.reshape(-1).tolist())
    n_obj, n_faces, n_shared = 0, 0, 0
    for mk in sorted(by_mesh):
        items = by_mesh[mk]; me = items[0][0].data
        drawn_by = {o.name for o in bpy.data.objects if o.data is me}
        if drawn_by == {o.name for o, _ in items} and all((e["faces"], e["planes"]) == (items[0][1]["faces"],
                                                                                        items[0][1]["planes"])
                                                          for _, e in items):
            write(me, items[0][1]); n_shared += len(items) > 1
        else:
            for o, e in items: write(actx.own_mesh(o), e)
        n_obj += len(items); n_faces += sum(len(e["faces"]) for _, e in items)
    return n_obj, n_faces, len(by_mesh), n_shared


def apply(actx):
    """The block's faces indoors (the storefronts' transom panels, the parts of the windows' frames and reveals behind
    their panes): their panes, in place."""
    n_obj, n_faces, n_mesh, n_shared = _write_indoors(actx, actx.stash.get("indoors", {}).get("block", {}))
    actx.log(f"soiling: {n_faces} faces indoors on {n_obj} objects of the block ({n_mesh} meshes, {n_shared} of them "
             f"shared between windows and written once)")


def apply_portal(actx):
    """The portal's faces indoors (its vestibule, behind the doors: one mesh each, instanced three times, the same faces
    and panes in all three): their panes, in place."""
    n_obj, n_faces, _, _ = _write_indoors(actx, actx.stash.get("indoors", {}).get("portal", {}))
    actx.log(f"soiling: {n_faces} faces indoors on {n_obj} objects of the portal")


# ---------------------------------------------------------------------------------------------------- shader
def shader(g):
    shel, up, down = g.sep(g.i("Mask"))                     # the shelter of the surface the street sees here, as its
    depth = g.add(g.mul(g.i("Mask Alpha"), DEPTH_SPAN), DEPTH_LO)   # element's soiling reaches it; and its depth
    # the share of the soiling the element here takes (1 outside every mark, 0 where the top's run-off runs)
    own = g.clamp(g.sub(g.add(1.0, g.mul(up, UP_SPAN)), down), 0.0, 1.0 + UP_SPAN)
    # a point standing well in front of the surface the mask recorded is not that surface (a fire escape's bars, looked
    # through when the mask was made), and a top takes the rain on its face whatever shelters the wall behind it
    here = g.one_minus(g.smooth(GATE[0], GATE[1], g.sub(g.i("D"), depth)))
    wall = g.mul(g.mul(shel, here), g.one_minus(g.upward()))
    # an underside takes no rain at all: the rain model's own shelter by tilt, 1 - (1 + Nz) ** UNDER_POW, on faces
    # turned more down than out
    nz = g.i("Nz")
    tilt = g.one_minus(g.pow(g.clamp(g.add(nz, 1.0), 0.0, 1.0), UNDER_POW))
    under = g.mul(tilt, g.smooth(UNDER[0], UNDER[1], nz))
    # and behind the pane it is seen through, a face the street sees only through glass is indoors: no rain or street
    # dust reaches it (apply()'s attributes: the pane's normal toward the street and its offset, in the object's own
    # space, so one mesh serves every window it frames and every portal). Everywhere else the factor is exactly 1
    pane = g.node('ShaderNodeAttribute', attribute_type='GEOMETRY', attribute_name=PANE_ATTR).outputs['Vector']
    side = g.sub(g.dot(pane, g.node('ShaderNodeTexCoord').outputs['Object']), g.i("Attr"))
    inside = g.mul(g.gt(g.vmath('LENGTH', pane), 0.5), g.smooth(PANE_GAP[0], PANE_GAP[1], g.mul(side, -1.0)))
    v = g.mul(g.mul(g.mx(g.smooth(SHOW[0], SHOW[1], wall), under), own), g.one_minus(inside))
    k = None                                                # how much each material class takes of it
    for c, share in CLASS_AMOUNT.items():
        term = g.mul(g.eq(g.i("Class"), float(c)), share)
        k = term if k is None else g.add(k, term)
    # bare metal (by the material's own metallic: brass, bronze) is polished by hand and takes none; paint its share
    k = g.mul(k, g.one_minus(g.mul(g.is_class(classes.METAL), g.smooth(BARE[0], BARE[1], g.i("Metallic")))))
    # the joints hold a little more of it (the material's own mortar, from its height map), so the deposit keeps the
    # brick's pattern instead of lying over it like a shadow
    hold = g.add(1.0, g.mul(g.clamp(g.i("Joint")), JOINT_HOLD))
    amt = g.mul(g.mul(g.mul(v, k), hold), g.mul(g.i("Strength"), AMOUNT))
    col = g.i("Color")
    y = g.lum(col)
    deposit = g.rgb(g.mul(y, DIRT_TINT[0]), g.mul(y, DIRT_TINT[1]), g.mul(y, DIRT_TINT[2]))
    dirt = g.scale_rgb(g.mix(col, deposit, DIRT_GREY, 'RGBA'), DIRT_DARK)
    g.o("Color", g.mix(col, dirt, amt, 'RGBA'))
    # matte on the porous fabric only: a smooth finish keeps its gloss, which roughened would light it up in the sun
    g.o("Roughness", g.mix(g.i("Roughness"), g.mx(g.i("Roughness"), MATTE), g.mul(amt, g.is_class(*MATTE_ON))))
    g.o("Debug", g.mul(g.clamp(v), g.gt(k, 0.0)))


def elevation(canvas):
    """What the elevation images draw of the mask: the soiling the walls take, the shelter's smoothstep times the
    element's share (the undersides' soiling is the shader's, by their tilt)."""
    own = np.clip(1.0 + UP_SPAN * canvas[:, :, 1] - canvas[:, :, 2], 0.0, 1.0 + UP_SPAN)
    return np.clip(smoothstep(SHOW[0], SHOW[1], canvas[:, :, 0]) * own, 0.0, 1.0)
