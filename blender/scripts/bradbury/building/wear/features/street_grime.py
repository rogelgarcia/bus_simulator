# Street-level grime band (AI 567): the darker foot of a city building. Rain splashes back off the pavement onto the
# lowest part of the wall, traffic and pedestrians leave their grime, and damp rises from the ground; the ICOMOS-ISCS
# glossary lists rising damp among the causes of darkened "moist areas". The band is darkest at the pavement and fades
# upward with a soft top edge; it lies only on what faces the pavement and the street, and it breaks at the openings.
# Every value comes from the built model's street level and from each run's and each corner's own draw (below); nothing
# is placed by noise, and the mask is byte-identical from one build to the next.
#
# THE ELEVATION. The street level of each face as the street sees it, on the mask's 2 cm texels up to above hand
# height: the depth, material, owner and normal of the first surface a level ray meets. On this block it is the pier
# ring's stone (the storefront piers, the corner piers with two street faces, the narrow strips beside the portal
# pilasters), the portals' pilaster plinths, their granite step and the paired piers standing on it at the mouth, with
# the storefronts' glass and frames and the portals' doors between them. The storefronts are glazed down to a 6 cm
# frame rail on the pavement: there is no stone under them, so their stone is their jambs.
#
# THE SOURCE is the ground: the pavement, which the render scene lays under the whole outline (it closes the floor of
# every recessed storefront too), and the step a portal's piers stand on. Every run of street-facing stone standing on
# its ground is one source, a line along its foot, and its band is one mark, measured up from that ground: a pier's
# from the pavement, a portal pier's from the step's top.
#
# THE REACH. Splash is thrown by rain that lands on the ground, so what a surface takes depends on how far back the wet
# ground runs in front of it. The ground is probed along each column from the street inward, at every point the share
# of 565's wind-driven rain that reaches it (a ground point takes a direction's rain by its vertical component): the
# pavement in front of the piers and the floors of the storefront recesses are open to the rain; under a portal's arch
# block and inside its recess the floor falls dry. A surface takes the band in full while it stands on or in front of
# the wet ground's back edge and loses it over REACH, the splash's reach, behind it. So the band runs round each pier's
# arris onto its jambs, the storefronts' and the doors' (the recess floor beside them is pavement in the rain), and onto
# the portal piers at the mouth, and does not climb into the portal's recess.
#
# CORNERS AND PLINTHS. The convex vertical arrises that stand on the ground at the street front -- the piers' edges at
# every opening, the block's corners (the chamfer's 135 degree ones at half sharpness), the plinths' and the portal
# piers' -- take more splash: within a corner's zone, on both of its faces, the band is stronger. Hands, bags and
# shoulders rub some of them, and faint rubbing marks run on above the band to hand height. Plinths standing proud of
# the pier ring take PLINTH_GAIN more. Everywhere else the top edge is one height all along a run.
#
# ONE PIER AND ONE CORNER AT A TIME (the rework of 2026-09-23). The pier ring is one stone repeated round the block, so
# the geometry alone stamped the same band on every pier and the same splash gain and rubbing marks up every one of its
# 100 corners: the same U at every pier (user 2026-09-23: marks must not repeat identically from one instance to the
# next). What makes one pier's foot differ from the next on a real street is what the model does not carry -- a tenant
# who scrubs the frontage, a paving slab that falls toward one pier and ponds at its foot, the doors people use and the
# corners they turn -- so each run draws its own amount and reach (a few were scrubbed not long ago), a little more the
# busier the pavement in front of it, and each corner its own splash gain and zone, and whether hands and bags rub it at
# all: most of an entrance's jambs (the portals' mouths, the three doors) and the block's corners, few along a row of
# shop windows, and each with its own strength, height and share on its jamb. How busy the pavement is comes from the
# model: its entrances and the block's corners, falling off along the pavement, and keep right, which makes a pier's
# right-hand arris the one the flow nearest the wall meets (570's measure). The seed is the run's or the corner's own
# place (sha256 of "street_grime:" and a key): a rebuild draws the same, and a change elsewhere reshuffles nothing.
#
# THE LOOK darkens the stone's own colour, a little greyed, and makes it a little rougher; its texture stays under it
# and the normal map is untouched. Masonry only, on walls and jambs: never a top, a soffit, glass, frames or doors.
#
# PUBLISHED for the features that follow (573 erodes the joints in the splash zone; 570 wears the exposed corners):
# `zone`, `runs`, `corners`, `entrances`, `ground` and `profile` (see the README's "Street-level grime band (AI 567)").
import hashlib, math
import numpy as np
from .. import classes
from ..geometry import FACADES, ATLAS, Z_GROUND, facade_of
from . import soiling

NAME = "street_grime"
AI = 567
LABEL = "street-level grime band"
ORDER = 230
DEFAULT_STRENGTH = 1.0
DEBUG_COLOR = (1.00, 0.85, 0.05)
MASK = dict(res=0.02, channels=4, bits=8)   # R: the splash band / R_SCALE; G: a corner's extra over it; B: the street
RES = MASK["res"]                           # front's depth; A: how far back the wet ground runs (B, A: D_LO + D_SPAN x
                                            # value)

# ---------------------------------------------------------------------------------------------------- the elevation
Z_LO, Z_HI = 0.10, 1.40         # the rows cast and painted: from under the pavement (0.201) to above hand height
D_FROM, REACH_RAY = 4.0, 12.0   # the level rays: from this far out, this far
FRONT_ND = 0.7                  # a front faces the street: its normal's share out of the face at least this
STEP_MAX = 0.20                 # a ground stands at most this far above the pavement (a portal's step: 0.12)
FOOT = 0.12                     # a front whose lowest texel stands within this of its ground stands on it
SAME = 0.05                     # texels of one front: within this of each other's depth

# ---------------------------------------------------------------------------------------------------- the ground
GROUND_STEP = 0.05              # the ground probed every this much along a column ...
GROUND_EVERY = 2                # ... on every this many columns
GROUND_AHEAD = 0.10             # from this far in front of the street line ...
LINE_SPAN = 2.0                 # ... the most forward base within this much along the face (a portal's half width)
RAIN_THETA = soiling.RAIN_THETA[1::2]      # 565's rain, every other inclination (20, 40, 60 degrees) ...
RAIN_PHI = soiling.RAIN_PHI[::2]           # ... and every other azimuth (-75 .. 75 by 30): a ground point takes a
                                           # direction's share by its vertical component, cos theta
WET = 0.4                       # the ground is wet where it takes at least this share of the open pavement's rain
REACH = 0.45                    # the splash reaches this far behind the wet ground's back edge

# ---------------------------------------------------------------------------------------------------- the band
TOP = 0.65                      # the splash band's reach above its ground: a smoothstep down from the ground to TOP ...
FOOT_W, FOOT_E = 0.25, 0.10     # ... with FOOT_W of it an exponential foot of e-fold FOOT_E: darkest at the ground
PLINTH = (0.05, 0.20)           # a base standing this far in front of the pier ring starts to count as a plinth, fully
PLINTH_GAIN = 0.12              # a plinth takes this much more
BLEED = 3                       # texels: a front's values reach this far past its edge, for its jamb to read
TOP_SHOW = 0.10                 # a run's path follows its band's top edge, where the band falls to this

# ---------------------------------------------------------------------------------------------------- the corners
ARRIS_STEP = 0.06               # a convex arris: the surface beside a front stands back at least this much, ...
ARRIS_TURN = 0.30               # ... or turns away from the street at least this much (the chamfer's corners)
ARRIS_MIN_H = 0.30              # an arris at least this tall, standing on its ground, is a corner
ARRIS_COLS = 2                  # texels of one arris: within this many columns of each other ...
ARRIS_GAP = 0.12                # ... and a run of it resting on another within this much above its top, within
ARRIS_JOIN = 0.08               # this much along the face (a pilaster's shaft on its plinth), carries on as the same
CORNER_W = 0.20                 # a corner's zone reaches this far along each of its faces (x its WIDTH), and on its jamb
                                # this far back from the arris
CORNER_GAIN = 0.20              # the band is up to this much stronger at a corner (x its GAIN)
CONTACT = 0.32                  # a rubbed corner's marks, against the band's full value at the ground (x its RUB_AMOUNT)

# ---------------------------------------------------------------------------------------------------- one at a time
# Each run's and each corner's share of what the geometry gives it, drawn from its own seed (the mean of two uniforms
# where a range is given: the middle likelier than the ends). 1.0 is the geometry's measure, what every one had before
T_REACH = 2.0                   # an entrance's or a corner's traffic falls off over this along the pavement (e-fold)
MOUTH_PAD = 0.10                # an entrance's jambs: the arrises within this of its opening
PULL_Z, PULL_H = (0.80, 2.00), 0.60     # a door: a small part at hand height over the pavement (a pull), no taller
OPENING_MIN = 1.0                       # than this, in an opening of the pier ring at least this wide
RUN_AMOUNT = (0.78, 1.12)       # a run's band, times this (its tenant's care, how its paving drains) ...
RUN_TRAFFIC = 0.15              # ... and up to this much more on the busiest pavement (the feet, the dirt carried in)
RUN_REACH = (0.85, 1.18)        # its height, times this (how high the splash rises off its paving)
SCRUB_P, SCRUB = 0.08, (0.40, 0.65)     # a run scrubbed not long ago: this often, its amount this instead
GAIN = (0.40, 1.40)             # a corner's splash gain, times this
WIDTH = (0.65, 1.35)            # its zone's reach along each face, times this
RUB_P = (0.04, 0.75)            # a corner is rubbed this often: the first where the pavement is quietest, the second
                                # at an entrance's jambs and the block's corners
LEAD_TRAIL = 0.70               # an arris the flow nearest the wall meets last (keep right) is as busy as this share of
                                # its pavement
RUB_AMOUNT = (0.50, 1.30)       # a rubbed corner's marks, times CONTACT, ...
RUB_LEAD = 0.70                 # ... times this where the pavement is quietest, all of it at the busiest
RUB_FULL = (0.50, 0.80)         # full from the band up to this height over the pavement (hands, bags, a hip) ...
RUB_FADE = (0.20, 0.35)         # ... and gone this much higher
JAMB = (0.25, 0.75)             # the share of its rubbing its jamb takes; at an entrance's jambs, where the hands go,
MOUTH_JAMB = (0.80, 1.20)       # this
R_SCALE = 1.5                   # the mask holds the band / R_SCALE: a heavy run's plinth can reach 1.44

# ---------------------------------------------------------------------------------------------------- the look
D_LO, D_SPAN = -1.40, 2.00      # the depth channels: d from -1.40 to +0.60 over 0..1
AMOUNT = 0.78                   # at strength 1 a full band goes this far toward DIRT
DIRT_DARK = 0.40                # DIRT keeps this share of the stone's own colour ...
DIRT_GREY = 0.10                # ... after losing this much of its saturation toward a warm grey
DIRT_TINT = (1.00, 0.94, 0.87)
MATTE = 0.80                    # and is at least this rough
VERT = (0.55, 0.85)             # walls and jambs: |Nz| under the first in full, gone by the second (no tops, soffits)
OUTWARD = (-0.50, -0.20)        # nothing that faces into the building
DEBUG_GAIN = 4.0                # the debug view shows the band at full colour from a quarter of its foot
KINDS = (("pier", "fit_piers"), ("plinth", "pilaster_"), ("step", "slab_step"), ("portal pier", "pillar_"))


def s_at(f, c):                  # a face-local column's centre
    return FACADES[f].s0 + (np.asarray(c) + 0.5) * RES


def z_at(r):                     # a row's centre
    return ATLAS.z0 + (np.asarray(r) + 0.5) * RES


def smooth(e0, e1, x):
    t = np.clip((np.asarray(x, np.float64) - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def profile(H):
    """The splash band at a height H above its ground: 1 at the ground, falling softly to 0 at TOP."""
    H = np.maximum(np.asarray(H, np.float64), 0.0)
    return np.where(H < TOP, FOOT_W * np.exp(-H / FOOT_E) + (1.0 - FOOT_W) * (1.0 - smooth(0.0, TOP, H)), 0.0)


def enc(d):
    return np.clip((np.asarray(d, np.float64) - D_LO) / D_SPAN, 0.0, 1.0)


def kind_of(name):
    for k, prefix in KINDS:
        if name.startswith(prefix): return k
    return "stone"


# ---------------------------------------------------------------------------------------------------- one at a time
def draw(key, n):
    """n uniforms in 0..1 from a run's or a corner's own seed: the sha256 of its key, two bytes each, so every rebuild
    draws the same values and nothing drawn for one moves when another changes."""
    h = hashlib.sha256(("street_grime:" + key).encode("utf-8")).digest()
    return [int.from_bytes(h[2 * i:2 * i + 2], "big") / 65535.0 for i in range(n)]


def mid(bounds, u, v):
    # the mean of two uniforms across the bounds: the middle likelier than the ends
    return bounds[0] + (bounds[1] - bounds[0]) * 0.5 * (u + v)


def run_draw(key, busy):
    """A run's own: its amount and its reach (times the geometry's band), and whether it was scrubbed not long ago."""
    u = draw(key, 5)
    if u[0] < SCRUB_P: amount, scrubbed = mid(SCRUB, u[1], u[2]), True
    else: amount, scrubbed = mid(RUN_AMOUNT, u[1], u[2]) * (1.0 + RUN_TRAFFIC * busy), False
    return amount, mid(RUN_REACH, u[3], u[4]), scrubbed


def corner_draw(key, busy, mouth):
    """A corner's own: its splash gain and its zone's reach along each face (times the geometry's); whether hands and
    bags rub it, and then how much (times CONTACT), full to what height over the pavement and gone by what height, and
    the share its jamb takes."""
    u = draw(key, 13)
    rubbed = u[4] < RUB_P[0] + (RUB_P[1] - RUB_P[0]) * busy
    h0 = mid(RUB_FULL, u[7], u[8])
    return dict(gain=mid(GAIN, u[0], u[1]), width=mid(WIDTH, u[2], u[3]),
                rub=mid(RUB_AMOUNT, u[5], u[6]) * (RUB_LEAD + (1.0 - RUB_LEAD) * busy) if rubbed else 0.0,
                h0=h0, h1=h0 + mid(RUB_FADE, u[9], u[10]), jamb=mid(MOUTH_JAMB if mouth else JAMB, u[11], u[12]))


class Pavement:
    """The pavement round the block, measured along its perimeter: the entrances -- each portal's mouth (its step run)
    and each door (an opening of the pier ring with a pull in it) -- and the block's corners, where people turn in and
    out, turn the corner, slow down and touch the stone."""

    def __init__(self, blk, runs, d_ring):
        self.cum = np.concatenate([[0.0], np.cumsum([F.L for F in FACADES])])
        self.perimeter = float(self.cum[-1])
        self.entrances = [dict(id=f"portal:{FACADES[f].name}:{r['s0']:.2f}", kind="portal", facade=f,
                               s0=round(r["s0"], 3), s1=round(r["s1"], 3), object=r["object"])
                          for f in sorted(runs) for r in runs[f] if r["kind"] == "step"]
        self.entrances += find_doors(blk, runs, d_ring)
        for e in self.entrances:
            e["p0"], e["p1"] = self.perim(e["facade"], e["s0"]), self.perim(e["facade"], e["s1"])

    def perim(self, f, s):
        return float(self.cum[f] + s)

    def pdist(self, p, q):
        d = abs(p - q) % self.perimeter
        return min(d, self.perimeter - d)

    def busy(self, f, s):
        # how busy the pavement is at s of face f: 1 at an entrance or a corner, falling off along the pavement (570's
        # traffic is its base share plus the rest times this)
        p = self.perim(f, s)
        near = [0.0 if (p - e["p0"]) % self.perimeter <= (e["p1"] - e["p0"]) % self.perimeter
                else min(self.pdist(p, e["p0"]), self.pdist(p, e["p1"])) for e in self.entrances]
        return math.exp(-min(near + [self.pdist(p, c) for c in self.cum[:-1]]) / T_REACH)

    def mouth(self, f, s):
        # the entrance whose opening this point of face f stands at, if any
        for e in self.entrances:
            if e["facade"] == f and e["s0"] - MOUTH_PAD <= s <= e["s1"] + MOUTH_PAD: return e
        return None


def find_doors(blk, runs, d_ring):
    """The doors: an opening between two piers of the ring at least OPENING_MIN wide with a pull in it, a small part at
    hand height that is not stone (the block's own; the portals' mouths are their step runs)."""
    ni = len(blk.inst)
    masonry = np.zeros(len(classes.NAMES), bool); masonry[list(classes.MASONRY)] = True
    zc = blk.V[:, 2][blk.T]
    zlo = np.full(ni, np.inf); zhi = np.full(ni, -np.inf)
    np.minimum.at(zlo, blk.tri_inst, zc.min(axis=1)); np.maximum.at(zhi, blk.tri_inst, zc.max(axis=1))
    cnt = np.bincount(blk.tri_inst, minlength=ni).astype(np.float64)
    cen = np.stack([np.bincount(blk.tri_inst, weights=blk.V[:, k][blk.T].mean(axis=1), minlength=ni) for k in range(3)],
                   axis=1) / np.maximum(cnt, 1.0)[:, None]
    stone = np.bincount(blk.tri_inst, weights=masonry[np.clip(blk.tri_class, 0, None)].astype(np.float64),
                        minlength=ni) > 0
    doors = {}
    for i, d in enumerate(blk.inst):
        if d["instancer"] is not None or stone[i] or cnt[i] == 0: continue
        if zlo[i] < Z_GROUND + PULL_Z[0] or zhi[i] > Z_GROUND + PULL_Z[1] or zhi[i] - zlo[i] > PULL_H: continue
        f = int(facade_of(cen[i, 0], cen[i, 1]))
        s, dd, _ = FACADES[f].sdz(cen[i, 0], cen[i, 1], cen[i, 2])
        if not (-1.5 < dd < d_ring + 0.1): continue
        piers = sorted((r["s0"], r["s1"]) for r in runs.get(f, []) if r["kind"] == "pier")
        gap = next(((a[1], b[0]) for a, b in zip(piers, piers[1:]) if a[1] <= s <= b[0]), None)
        if gap is None or gap[1] - gap[0] < OPENING_MIN: continue
        doors.setdefault((f, round(gap[0], 3), round(gap[1], 3)), []).append(d["object"])
    return [dict(id=f"door:{FACADES[f].name}:{s0:.2f}", kind="door", facade=f, s0=s0, s1=s1, object=",".join(sorted(obs)))
            for (f, s0, s1), obs in sorted(doors.items())]


# ---------------------------------------------------------------------------------------------------- the elevation
def cast(blk, f, r0, r1):
    """Face f's street level as the street sees it, rows r0..r1-1 of this mask: depth D (nan where nothing), class C,
    instance I, the hit normal in the face's frame (NT along, ND out, NZ up, turned toward the street) and whether its
    surface belongs to this face by the bisector rule."""
    from mathutils import Vector
    F = FACADES[f]; W = int(round(F.width / RES)); H = r1 - r0
    D = np.full((H, W), np.nan); C = np.full((H, W), -1, np.int32); I = np.full((H, W), -1, np.int32)
    NT = np.zeros((H, W)); ND = np.zeros((H, W)); NZ = np.zeros((H, W)); X = np.zeros((H, W)); Y = np.zeros((H, W))
    ray = blk.bvh.ray_cast; tri_class, tri_inst = blk.tri_class, blk.tri_inst
    dirv = Vector((-F.n[0], -F.n[1], 0.0))
    tx, ty, nx, ny = F.t[0], F.t[1], F.n[0], F.n[1]
    zs = [float(z) for z in z_at(np.arange(r0, r1))]
    for c in range(W):
        s = F.s0 + (c + 0.5) * RES
        x0 = F.a[0] + s * tx + D_FROM * nx; y0 = F.a[1] + s * ty + D_FROM * ny
        for k, z in enumerate(zs):
            loc, nor, ti, dist = ray(Vector((x0, y0, z)), dirv, REACH_RAY)
            if loc is None: continue
            a, b, u = nor.x * tx + nor.y * ty, nor.x * nx + nor.y * ny, nor.z
            if b < 0.0: a, b, u = -a, -b, -u                         # the side the ray came from
            D[k, c] = D_FROM - dist; C[k, c] = tri_class[ti]; I[k, c] = tri_inst[ti]
            NT[k, c], ND[k, c], NZ[k, c] = a, b, u
            X[k, c], Y[k, c] = loc.x, loc.y
    fin = np.isfinite(D)
    own = fin & (facade_of(np.where(fin, X, 0.0), np.where(fin, Y, 0.0)) == f)
    return dict(D=D, C=C, I=I, NT=NT, ND=ND, NZ=NZ, own=own)


def ground_at(blk, F, s, d, z_from):
    """The ground under (s, d), looking down from z_from: the top of a step or a floor no more than STEP_MAX over the
    pavement, else the pavement itself (the render scene's; the block does not hold it). Tops higher up (a plinth's
    cap) are looked past; anything else met (the inside of a solid) leaves the pavement."""
    from mathutils import Vector
    x, y, _ = F.world(s, d, 0.0)
    z = z_from
    while z > Z_GROUND:
        loc, nor, _, _ = blk.bvh.ray_cast(Vector((x, y, z)), Vector((0.0, 0.0, -1.0)), z - Z_GROUND + 0.02)
        if loc is None or nor.z < 0.5: return Z_GROUND
        if loc.z <= Z_GROUND + STEP_MAX: return max(Z_GROUND, loc.z)
        z = loc.z - 0.002
    return Z_GROUND


def rain_dirs(F):
    """565's rain toward the street side of face F: (direction toward the rain, a ground point's share of it)."""
    out = []
    for th in RAIN_THETA:
        for ph in RAIN_PHI:
            t, p = math.radians(th), math.radians(ph)
            h = math.sin(t)
            out.append(((h * (math.cos(p) * F.n[0] + math.sin(p) * F.t[0]),
                         h * (math.cos(p) * F.n[1] + math.sin(p) * F.t[1]), math.cos(t)), math.cos(t)))
    return out


def rain_share(blk, point, dirs):
    from mathutils import Vector
    o = Vector(point); got = tot = 0.0
    for v, w in dirs:
        tot += w
        if blk.bvh.ray_cast(o, Vector(v), 60.0)[0] is None: got += w
    return got / tot


# ---------------------------------------------------------------------------------------------------- the build
def build(ctx):
    import time
    t0 = time.time()
    blk = ctx.block
    names = [d["object"] for d in blk.inst]
    r0 = int(round((Z_LO - ATLAS.z0) / RES)); r1 = int(round((Z_HI - ATLAS.z0) / RES))
    Zr = z_at(np.arange(r0, r1))
    masonry = np.zeros(len(classes.NAMES), bool); masonry[list(classes.MASONRY)] = True
    faces, n_rays = {}, 0
    for F in FACADES:
        e = cast(blk, F.idx, r0, r1); n_rays += e["D"].size
        # the stone the street sees at this face (under the pavement nothing shows: the recess's granite fill), and of
        # it the fronts, what faces the street: a moulding's profile or a step's rounded nose takes the band's values
        # too, but stands on nothing and has no corners of its own
        e["surf"] = e["own"] & (e["C"] >= 0) & masonry[np.clip(e["C"], 0, None)] & (Zr[:, None] > Z_GROUND)
        e["front"] = e["surf"] & (e["ND"] >= FRONT_ND)
        faces[F.idx] = e
    t1 = time.time()

    # the pier ring's own front: the modal depth of the stone fronts just over the pavement
    k_pave = int(np.argmax(Zr > Z_GROUND + 0.005))
    base_d = np.concatenate([np.round(e["D"][k_pave][e["front"][k_pave]], 2) for e in faces.values()])
    vals, cnt = np.unique(base_d, return_counts=True)
    d_ring = float(vals[np.argmax(cnt)])

    # the ground: along each column from the street inward, the rain each point takes
    k_probe = int(np.argmax(Zr > Z_GROUND + STEP_MAX + 0.02))               # a level row over any step
    walks, open_e, n_ground = {}, [], 0
    for F in FACADES:
        e = faces[F.idx]; W = e["D"].shape[1]; dirs = rain_dirs(F)
        base = e["D"][k_probe]
        span = int(round(LINE_SPAN / RES))
        fwd = np.where(np.isfinite(base), base, -99.0)
        line = np.array([fwd[max(0, c - span):c + span + 1].max() for c in range(W)])
        line = np.where(line > -99.0, line, np.nan)
        for c in range(0, W, GROUND_EVERY):
            if not (np.isfinite(base[c]) and np.isfinite(line[c])): continue    # past the block: open pavement
            s = float(s_at(F.idx, c)); pts = []
            for d in np.arange(line[c] + GROUND_AHEAD, base[c], -GROUND_STEP):
                zg = ground_at(blk, F, s, float(d), Z_GROUND + STEP_MAX + 0.03)
                x, y, _ = F.world(s, float(d), 0.0)
                pts.append((float(d), rain_share(blk, (x, y, zg + 0.01), dirs))); n_ground += 1
            walks[(F.idx, c)] = pts
            if abs(line[c] - base[c]) < 0.005 and pts: open_e += [w for _, w in pts]
        e["line"], e["base"] = line, base
    e_open = float(np.median(open_e)) if open_e else 1.0
    for F in FACADES:
        e = faces[F.idx]; W = e["D"].shape[1]
        dw = np.full(W, D_LO)
        for c in range(0, W, GROUND_EVERY):
            pts = walks.get((F.idx, c))
            if pts is None: continue
            back = float(e["base"][c])                                  # wet all the way to the first surface ...
            for d, w in pts:
                if w < WET * e_open:
                    back = d + 0.5 * GROUND_STEP; break                     # ... or to where it first falls dry
            dw[c:c + GROUND_EVERY] = min(back, float(e["line"][c]) + GROUND_AHEAD)
        # the deeper of each column's neighbours: a jamb stands at a front's edge, over the wet floor beside it
        dwm = dw.copy()
        for k in range(1, BLEED + 1):
            dwm[k:] = np.minimum(dwm[k:], dw[:-k]); dwm[:-k] = np.minimum(dwm[:-k], dw[k:])
        e["d_wet"] = dwm
    t2 = time.time()

    # every face's stone: the ground each texel stands on, where each texel's values come from, its runs and corners
    n_down, runs = 0, {}
    for F in FACADES:
        f = F.idx; e = faces[f]
        D, surf = e["D"], e["surf"]
        H, W = D.shape
        # the ground each stone texel stands on (a portal pier's is the step's top)
        zg = np.full((H, W), Z_GROUND)
        for k in np.nonzero(Zr < Z_GROUND + STEP_MAX + TOP * RUN_REACH[1] + 0.05)[0]:
            for c in np.nonzero(surf[k])[0]:
                zg[k, c] = min(float(Zr[k]), ground_at(blk, F, float(s_at(f, c)), float(D[k, c]) + 0.02,
                                                       min(float(Zr[k]), Z_GROUND + STEP_MAX + 0.03)))
                n_down += 1
        plinth = smooth(PLINTH[0], PLINTH[1], np.where(surf, D, d_ring) - d_ring)
        # each stone texel's values reach BLEED texels past its edge (the nearer one's first), so its jamb reads them:
        # src and srow, the texel a texel's values come from
        src = np.where(surf, np.arange(W)[None, :], -1)
        dist = np.where(surf, 0, BLEED + 1)
        for k in range(1, BLEED + 1):
            for sh in (k, -k):
                nb = np.full((H, W), -1)
                if sh > 0: nb[:, sh:] = src[:, :-sh]
                else: nb[:, :sh] = src[:, -sh:]
                ok = (nb >= 0) & (dist > k) & ~surf
                src = np.where(ok, nb, src); dist = np.where(ok, k, dist)
        rows = np.broadcast_to(np.arange(H)[:, None], (H, W))
        has = src >= 0
        Dref = np.where(has, D[rows, np.clip(src, 0, None)], np.nan)
        srow = np.where(has, rows, -1)
        # under each column's lowest value, the same values: the lookup at the foot filters against itself
        for c in np.nonzero(has.any(axis=0))[0]:
            k0 = int(np.argmax(has[:, c]))
            if k0 > 0:
                Dref[:k0, c] = Dref[k0, c]; src[:k0, c] = src[k0, c]; srow[:k0, c] = k0; has[:k0, c] = True
        e.update(zg=zg, plinth=plinth, src=src, srow=srow, Dref=Dref, has=has)
        e["feet"] = find_feet(e, Zr)
        runs[f] = find_runs(e, f, names)
        e["segs"] = find_arrises(e, Zr, F)
    t3 = time.time()

    # how busy the pavement is, and each run's and each corner's own draw
    pave = Pavement(blk, runs, d_ring)
    for F in FACADES:
        f = F.idx; e = faces[f]
        for r in runs[f]:
            r["busy"] = pave.busy(f, 0.5 * (r["s0"] + r["s1"]))
            r["amount"], r["reach"], r["scrubbed"] = run_draw(run_key(F, r), r["busy"])
        base = {}                                   # each corner's own arris run: the one standing on its ground
        for a in e["segs"]:
            if a["corner"] not in base or a["z0"] < base[a["corner"]]["z0"]: base[a["corner"]] = a
        e["draws"] = []
        for a in e["segs"]:
            b = base[a["corner"]]
            key, at_end = corner_key(F, b)
            mouth = pave.mouth(f, b["s"])
            # an entrance's jambs and the block's corners take the most; elsewhere the pavement in front, a pier's
            # right-hand arris (keep right) all of it and its left-hand one LEAD_TRAIL
            busy = 1.0 if (mouth or at_end) else pave.busy(f, b["s"]) * (1.0 if b["side"] > 0 else LEAD_TRAIL)
            cd = corner_draw(key, busy, mouth is not None)
            cd.update(busy=busy, mouth=mouth["id"] if mouth else None, key=key)
            e["draws"].append(cd)

    # every face's channels: each corner's zone, then the band from each run and the corners' extra over it
    for F in FACADES:
        f = F.idx; e = faces[f]
        H, W = e["D"].shape
        Wz = np.zeros((H, W)); seg_of = np.full((H, W), -1); jamb = np.zeros((H, W), bool)
        for i, a in enumerate(e["segs"]):
            paint_corner(a, i, e, Wz, seg_of, jamb, Zr, CORNER_W * e["draws"][i]["width"])
        for c in np.nonzero((Wz > 0).any(axis=0))[0]:
            k0 = int(np.argmax(Wz[:, c] > 0))
            if k0 > 0: Wz[:k0, c] = Wz[k0, c]; seg_of[:k0, c] = seg_of[k0, c]; jamb[:k0, c] = jamb[k0, c]
        e.update(Wz=Wz, seg_of=seg_of, jamb=jamb)
        e["owner"] = owners(e, runs[f])
        e["R"] = band_of(e, runs[f], Zr, F)
        e["Gx"] = extra_of(e, Zr)
    t4 = time.time()

    out_runs, out_corners = mark(ctx, faces, runs, Zr, r0)
    publish(ctx, faces, out_runs, out_corners, pave, Zr, r0, e_open, d_ring)
    ctx.log(f"   street_grime: {n_rays} level rays in {t1 - t0:.1f} s; the ground probed at {n_ground} points in "
            f"{t2 - t1:.1f} s (the open pavement takes {e_open:.3f} of 565's rain); {n_down} front texels grounded in "
            f"{t3 - t2:.1f} s; the draws and the channels in {t4 - t3:.1f} s; the pier ring's front at d {d_ring:.2f}; "
            f"{len(out_runs)} runs, {len(out_corners)} corners")
    ctx.log("   street_grime entrances: " + ", ".join(f"{x['kind']} {FACADES[x['facade']].name} {x['s0']:.2f}..{x['s1']:.2f}"
                                                  for x in pave.entrances))
    by = {}
    for r in out_runs:
        b = by.setdefault(r["kind"], dict(n=0, length=0.0)); b["n"] += 1; b["length"] += r["s1"] - r["s0"]
    for k, b in sorted(by.items()):
        ctx.log(f"   street_grime run {k:<12} {b['n']:4d}, {b['length']:7.2f} m along the faces")
    byc = {}
    for c in out_corners:
        b = byc.setdefault(c["kind"], dict(n=0, sharp=[], rubbed=0)); b["n"] += 1; b["sharp"].append(c["sharpness"])
        b["rubbed"] += c["rubbed"]
    for k, b in sorted(byc.items()):
        ctx.log(f"   street_grime corner {k:<12} {b['n']:4d}, sharpness {min(b['sharp']):.2f}..{max(b['sharp']):.2f}, "
                f"{b['rubbed']} rubbed")
    am = np.array([r["amount"] for r in out_runs]); re_ = np.array([r["reach"] for r in out_runs])
    ctx.log(f"   street_grime drawn: runs' amount {np.median(am):.2f} ({am.min():.2f}..{am.max():.2f}), reach "
            f"{np.median(re_):.2f} ({re_.min():.2f}..{re_.max():.2f}), {sum(r['scrubbed'] for r in out_runs)} scrubbed; "
            + describe_corners(out_corners))


def run_key(F, r):
    # a run's seed: its kind and span on its face, or, for a corner pier's run, the block corner it wraps (the pier's
    # two faces are one stone and one frontage: they draw alike)
    if r["s0"] < 0.5: return f"run:{r['kind']}:block:{F.idx}"
    if r["s1"] > F.L - 0.5: return f"run:{r['kind']}:block:{(F.idx + 1) % len(FACADES)}"
    return f"run:{r['kind']}:{F.name}:{r['s0']:.2f}:{r['s1']:.2f}:{r['zg']:.2f}"


def corner_key(F, a):
    # a corner's seed: its place on its face and its side, or the block corner it is (listed once for each street it
    # fronts, drawn once)
    if a["s"] < 0.5: return f"corner:block:{F.idx}", True
    if a["s"] > F.L - 0.5: return f"corner:block:{(F.idx + 1) % len(FACADES)}", True
    return f"corner:{F.name}:{a['s']:.2f}:{'right' if a['side'] > 0 else 'left'}", False


def describe_corners(corners):
    rub = [c for c in corners if c["rubbed"]]
    g = np.array([c["gain"] for c in corners]); w = np.array([c["width"] for c in corners])
    out = (f"corners' gain {np.median(g):.2f} ({g.min():.2f}..{g.max():.2f}), zone {np.median(w):.2f} m "
           f"({w.min():.2f}..{w.max():.2f}); {len(rub)} of {len(corners)} rubbed")
    if rub:
        ct = np.array([c["contact"] for c in rub]); h1 = np.array([c["hand"][1] for c in rub])
        out += (f", contact {np.median(ct):.2f} ({ct.min():.2f}..{ct.max():.2f}), gone by {h1.min():.2f}..{h1.max():.2f}"
                f" m over the pavement")
    return out


def find_feet(e, Zr):
    """Per column, every front's foot: its lowest texel, standing within FOOT of its own ground, with nothing of the
    same part (a step's rounded nose, a plinth's moulding) under it within FOOT. Returns a list of (column, row, depth,
    ground, instance)."""
    D, front, zg, I = e["D"], e["front"], e["zg"], e["I"]
    H, W = D.shape
    n = int(math.ceil(FOOT / RES))
    out = []
    for c in range(W):
        for k in np.nonzero(front[:, c])[0]:
            if Zr[k] - 0.5 * RES - zg[k, c] > FOOT: continue
            lo = max(0, k - n)
            same = [j for j in range(lo, k) if front[j, c] and (I[j, c] == I[k, c] or
                    (abs(D[j, c] - D[k, c]) <= SAME and abs(zg[j, c] - zg[k, c]) < 0.03))]
            if same: continue
            out.append((c, int(k), float(D[k, c]), float(zg[k, c]), int(I[k, c])))
    return out


def find_runs(e, f, names):
    """The runs: the feet joined along the face where they stand on one ground at one depth. Each is a dict: its feet,
    kind, instance and object, its span s0..s1 along the face, its depth and its ground."""
    groups = []
    for c, k, d, zg, inst in sorted(e["feet"], key=lambda t: (t[0], t[1])):
        for gr in groups:
            c1, k1, d1, zg1 = gr[-1][:4]
            if 0 < c - c1 <= 1 and abs(d - d1) <= SAME and abs(zg - zg1) < 0.03:
                gr.append((c, k, d, zg, inst)); break
        else:
            groups.append([(c, k, d, zg, inst)])
    out = []
    for gr in groups:
        cs = np.array([t[0] for t in gr])
        inst = int(np.bincount([t[4] for t in gr if t[4] >= 0]).argmax())
        out.append(dict(feet=gr, kind=kind_of(names[inst]), inst=inst, object=names[inst],
                        s0=float(s_at(f, cs.min()) - 0.5 * RES), s1=float(s_at(f, cs.max()) + 0.5 * RES),
                        d=float(np.median([t[2] for t in gr])), zg=float(np.median([t[3] for t in gr]))))
    return out


def find_arrises(e, Zr, F):
    """The convex vertical arrises of the street fronts: where a front's neighbour along the face stands back at least
    ARRIS_STEP, is open air, or turns away from the street by ARRIS_TURN. Runs of them, joined along their height and
    carried on where one rests on another, standing on their ground and at least ARRIS_MIN_H tall. Each is a dict:
    side (+1: the front lies to its left, the jamb to its right), the rows and columns it runs through, its depth,
    its ground, its sharpness (1 at a square return, 0.5 at the chamfer's corners) and the instance it belongs to."""
    D, front, NT, ND, zg, I = e["D"], e["front"], e["NT"], e["ND"], e["zg"], e["I"]
    H, W = D.shape
    found = []
    for side in (1, -1):
        nbD = np.full((H, W), np.nan); nbT = np.zeros((H, W)); nbN = np.ones((H, W))
        if side > 0: nbD[:, :-1] = D[:, 1:]; nbT[:, :-1] = NT[:, 1:]; nbN[:, :-1] = ND[:, 1:]
        else: nbD[:, 1:] = D[:, :-1]; nbT[:, 1:] = NT[:, :-1]; nbN[:, 1:] = ND[:, :-1]
        fin = np.isfinite(nbD)
        step = fin & (nbD < D - ARRIS_STEP)
        turn = fin & ~step & (side * nbT > ARRIS_TURN) & (nbD < D + 0.005)
        hit = front & (~fin | step | turn)
        sharp = np.where(turn, np.degrees(np.arccos(np.clip(nbN, -1.0, 1.0))) / 90.0, 1.0)
        # join the texels into runs: 8-connected within ARRIS_COLS columns, of one depth
        ks, cs = np.nonzero(hit)
        order = np.lexsort((cs, ks))
        ks, cs = ks[order], cs[order]
        parent = list(range(len(ks)))

        def root(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]; i = parent[i]
            return i
        by_row = {}
        for i, k in enumerate(ks): by_row.setdefault(int(k), []).append(i)
        for i, (k, c) in enumerate(zip(ks, cs)):
            for j in [j for kb in range(int(k) - 3, int(k)) for j in by_row.get(kb, [])]:
                if abs(int(cs[j]) - int(c)) <= ARRIS_COLS and abs(D[k, c] - D[ks[j], cs[j]]) <= SAME:
                    ra, rb = root(i), root(j)
                    if ra != rb: parent[max(ra, rb)] = min(ra, rb)
        groups = {}
        for i in range(len(ks)): groups.setdefault(root(i), []).append(i)
        for key in sorted(groups):
            g = groups[key]
            kk, cc = ks[g], cs[g]
            found.append(dict(side=side, rows=kk.tolist(), cols=cc.tolist(), d=float(np.median(D[kk, cc])),
                              zg=float(zg[kk.min(), cc[np.argmin(kk)]]), sharp=float(np.median(sharp[kk, cc])),
                              z0=float(Zr[kk.min()] - 0.5 * RES), z1=float(Zr[kk.max()] + 0.5 * RES),
                              s=float(np.median(s_at(F.idx, cc) + side * 0.5 * RES)),
                              inst=int(np.bincount(I[kk, cc][I[kk, cc] >= 0]).argmax()) if (I[kk, cc] >= 0).any() else -1))
    # standing on the ground, or resting on a run that does: each run joins the corner it rests on
    found.sort(key=lambda a: (a["z0"], a["side"], a["s"]))
    kept = []
    for a in found:
        if a["z0"] - a["zg"] <= FOOT:
            a["corner"] = len(kept); kept.append(a); continue
        below = [b for b in kept if b["side"] == a["side"] and abs(b["s"] - a["s"]) <= ARRIS_JOIN
                 and -RES <= a["z0"] - b["z1"] <= ARRIS_GAP]
        if below:
            b = min(below, key=lambda b: (abs(b["s"] - a["s"]), b["z0"]))
            a["corner"] = b["corner"]; a["zg"] = b["zg"]; kept.append(a)
    out = []
    for cid in sorted({a["corner"] for a in kept}):
        grp = [a for a in kept if a["corner"] == cid]
        if max(a["z1"] for a in grp) - min(a["zg"] for a in grp) < ARRIS_MIN_H: continue
        out += grp
    return sorted(out, key=lambda a: (a["s"], a["z0"]))


def paint_corner(a, i, e, Wz, seg_of, jamb, Zr, width):
    """An arris's zone, its weight Wz. Along its front, the corner's sharpness falling to 0 at `width` from the arris,
    while the surface runs on without a step (a moulding's profile included); across it, BLEED texels at full value for
    its jamb, whose street front is the arris's -- unless what stands there is stone set back from it, a concave
    neighbour (the pier strip beside a plinth), which takes none."""
    D, surf, Dref, has, src, srow = e["D"], e["surf"], e["Dref"], e["has"], e["src"], e["srow"]
    H, W = D.shape
    rows = np.array(a["rows"]); cols = np.array(a["cols"])
    side, sharp = a["side"], a["sharp"]
    n = int(math.ceil(width / RES)) + 1
    k_lo = 0 if a["z0"] - a["zg"] <= FOOT else int(np.searchsorted(Zr, a["z0"] - ARRIS_GAP))   # a rest's gap too
    for k in range(k_lo, H):
        if Zr[k] - 0.5 * RES > a["z1"] + RES: break
        j = int(cols[np.argmin(np.abs(rows - k))])                    # the arris's column at this row (or the nearest)
        if not (0 <= j < W) or not surf[k, j]: continue
        d0 = D[k, j]
        prev = d0
        for m in range(0, n):                                         # along its front
            c = j - side * m
            if not (0 <= c < W) or not surf[k, c] or abs(D[k, c] - prev) > SAME: break
            prev = D[k, c]
            dist = abs((c + 0.5) - (j + 0.5 + 0.5 * side)) * RES
            v = sharp * (1.0 - float(smooth(0.0, width, dist)))
            if v > Wz[k, c]: Wz[k, c] = v; seg_of[k, c] = i; jamb[k, c] = False
        for m in range(1, BLEED + 1):                                 # across it, for the jamb
            c = j + side * m
            if not (0 <= c < W) or (surf[k, c] and D[k, c] < d0 - 0.5 * ARRIS_STEP): break
            if sharp > Wz[k, c]: Wz[k, c] = sharp; seg_of[k, c] = i; jamb[k, c] = True
            if not has[k, c]:
                Dref[k, c] = d0; has[k, c] = True; src[k, c] = j; srow[k, c] = k


def owners(e, runs):
    """Every texel with values belongs to the run whose foot stands highest under it in its source column."""
    H, W = e["D"].shape
    owner = np.full((H, W), -1)
    foot_at = {}
    for gi, r in enumerate(runs):
        for c, k, d, zg, inst in r["feet"]: foot_at.setdefault(c, []).append((k, gi))
    src, has = e["src"], e["has"]
    for c in range(W):
        for k in np.nonzero(has[:, c])[0]:
            sc = int(src[k, c])
            cand = [(kf, gi) for kf, gi in foot_at.get(sc, []) if kf <= k]
            if not cand:
                cand = sorted(foot_at.get(sc, []))[:1]              # the rows under a foot, filled down
            if cand: owner[k, c] = max(cand)[1]
    return owner


def band_of(e, runs, Zr, F):
    """The band each texel takes from its run, read at the texel its values come from: the run's amount x the profile
    at its height over its ground, stretched by the run's reach, x a plinth's gain."""
    has, owner = e["has"], e["owner"]
    sc, sr = np.clip(e["src"], 0, None), np.clip(e["srow"], 0, None)
    Hs = Zr[sr] - e["zg"][sr, sc]
    gain = 1.0 + PLINTH_GAIN * e["plinth"][sr, sc]
    lost = int((has & (owner < 0) & (profile(Hs) > 0)).sum())
    assert lost == 0, f"street_grime: {lost} band texels on face {F.name} stand on no run"
    amount = np.zeros(owner.shape); reach = np.ones(owner.shape)
    for gi, r in enumerate(runs):
        sel = owner == gi
        amount[sel] = r["amount"]; reach[sel] = r["reach"]
    return np.where(has & (owner >= 0), amount * profile(Hs / reach) * gain, 0.0)


def extra_of(e, Zr):
    """What a corner adds to the band, the mask's G: its splash gain (its gain x its zone x the band) or its rubbing
    marks (its amount x CONTACT x its zone, the jamb's share on the jamb, full to its own height and gone by its own),
    whichever takes the surface darker, less the band."""
    R, Wz, seg_of, jamb = e["R"], e["Wz"], e["seg_of"], e["jamb"]
    Hp = np.broadcast_to((Zr - Z_GROUND)[:, None], R.shape)
    Gx = np.zeros(R.shape)
    for i, cd in enumerate(e["draws"]):
        sel = seg_of == i
        if not sel.any(): continue
        w, r, hp = Wz[sel], R[sel], Hp[sel]
        gain = CORNER_GAIN * cd["gain"] * w * r
        rub = CONTACT * cd["rub"] * w * np.where(jamb[sel], cd["jamb"], 1.0) * (1.0 - smooth(cd["h0"], cd["h1"], hp))
        Gx[sel] = np.maximum(np.maximum(gain, rub - r), 0.0)
    return Gx


def mark(ctx, faces, runs, Zr, r0):
    """The sources, marks and paint: one line source along each run's foot and its band as one mark; one line source up
    each corner's arris and its zone as one mark."""
    out_runs, out_corners = [], []
    for F in FACADES:
        f = F.idx; e = faces[f]
        owner = e["owner"]
        for gi, r in enumerate(runs[f]):
            cs = np.array([t[0] for t in r["feet"]])
            d, zg, s0, s1, kind = r["d"], r["zg"], r["s0"], r["s1"], r["kind"]
            rid = f"run:{F.name}:{len(out_runs)}"
            lift = 0.025                                            # the marker's tube rests on the ground
            src_obj = ctx.source(rid, "line", [F.world(s0, d + 0.02, zg + lift), F.world(s1, d + 0.02, zg + lift)],
                                 facade=f, what=kind, object=r["object"])
            m = ctx.mark(src_obj, f, what=kind)
            sel = owner == gi
            rr, cc = np.nonzero(sel)
            ra, rb, c0, c1 = int(rr.min()), int(rr.max()), int(cc.min()), int(cc.max())
            box = sel[ra:rb + 1, c0:c1 + 1]
            ps0 = F.s0 + c0 * RES + 0.25 * RES; ps1 = F.s0 + (c1 + 1) * RES - 0.25 * RES
            pz0 = ATLAS.z0 + (r0 + ra) * RES + 0.25 * RES; pz1 = ATLAS.z0 + (r0 + rb + 1) * RES - 0.25 * RES
            R = e["R"][ra:rb + 1, c0:c1 + 1]
            Dref = np.nan_to_num(e["Dref"][ra:rb + 1, c0:c1 + 1], nan=D_LO)
            dw = np.broadcast_to(e["d_wet"][None, c0:c1 + 1], R.shape)
            ctx.paint(m, np.where(box, R / R_SCALE, 0.0), ps0, ps1, pz0, pz1, channel=0)
            ctx.paint(m, np.where(box, enc(Dref), 0.0), ps0, ps1, pz0, pz1, channel=2)
            ctx.paint(m, np.where(box, enc(dw), 0.0), ps0, ps1, pz0, pz1, channel=3)
            # the band's top edge along the run, on its own texels: the path the debug view draws, a step at each
            # change of height (a corner's rise, a plinth)
            top = []
            for c in range(int(cs.min()), int(cs.max()) + 1):
                v = np.where(owner[:, c] == gi, band_front(e, c), 0.0)
                above = np.nonzero(v >= TOP_SHOW)[0]
                top.append(float(Zr[above.max()] + 0.5 * RES) if len(above) else zg)
            top = np.round(np.array(top) / 0.01) * 0.01                     # centimetres: an even edge draws straight
            pts = []
            for i, c in enumerate(range(int(cs.min()), int(cs.max()) + 1)):
                s_edge = float(s_at(f, c)) - 0.5 * RES
                if i == 0 or top[i] != top[i - 1]:
                    if i: pts.append(F.world(s_edge, d + 0.02, float(top[i - 1])))
                    pts.append(F.world(s_edge, d + 0.02, float(top[i])))
            pts.append(F.world(float(s_at(f, cs.max())) + 0.5 * RES, d + 0.02, float(top[-1])))
            ctx.path(m, pts)
            out_runs.append(dict(id=rid, facade=f, kind=kind, object=r["object"], s0=round(s0, 3), s1=round(s1, 3),
                                 d=round(d, 3), z_ground=round(zg, 3),
                                 top=round(float(np.median(top)) - zg, 3), texels=int(sel.sum()),
                                 amount=round(r["amount"], 3), reach=round(r["reach"], 3), busy=round(r["busy"], 3),
                                 scrubbed=bool(r["scrubbed"])))
        # corners: one source and one mark per arris run (a pilaster's plinth and the shaft resting on it are two)
        for i, a in enumerate(e["segs"]):
            sel = e["seg_of"] == i
            if not sel.any(): continue
            cd = e["draws"][i]
            cid = f"corner:{F.name}:{len(out_corners)}"
            at_end = a["s"] < 0.5 or a["s"] > F.L - 0.5                # at the block's own corner (the chamfer's too)
            kind = "block corner" if at_end else (kind_of(ctx.block.inst[a["inst"]]["object"]) if a["inst"] >= 0
                                                  else "stone")
            z_start = a["zg"] if a["z0"] - a["zg"] <= FOOT else a["z0"]
            # the tube runs up the arris to where its zone falls to TOP_SHOW: the band's top, or its rubbing marks'
            j = int(np.array(a["cols"])[int(np.argmin(a["rows"]))])
            above = np.nonzero(band_front(e, j) >= TOP_SHOW)[0]
            top = float(Zr[above.max()] + 0.5 * RES) if len(above) else z_start
            top = min(a["z1"], max(top, z_start + 0.05))
            src_obj = ctx.source(cid, "line", [F.world(a["s"], a["d"] + 0.02, z_start), F.world(a["s"], a["d"] + 0.02, top)],
                                 facade=f, what=kind, sharpness=round(a["sharp"], 3), rubbed=cd["rub"] > 0.0)
            m = ctx.mark(src_obj, f, what=kind)
            rr, cc = np.nonzero(sel)
            ra, rb, c0, c1 = int(rr.min()), int(rr.max()), int(cc.min()), int(cc.max())
            box = sel[ra:rb + 1, c0:c1 + 1]
            ps0 = F.s0 + c0 * RES + 0.25 * RES; ps1 = F.s0 + (c1 + 1) * RES - 0.25 * RES
            pz0 = ATLAS.z0 + (r0 + ra) * RES + 0.25 * RES; pz1 = ATLAS.z0 + (r0 + rb + 1) * RES - 0.25 * RES
            ctx.paint(m, np.where(box, e["Gx"][ra:rb + 1, c0:c1 + 1], 0.0), ps0, ps1, pz0, pz1, channel=1)
            # the jamb's texels this corner handed its street front to
            Dref = np.nan_to_num(e["Dref"][ra:rb + 1, c0:c1 + 1], nan=D_LO)
            dw = np.broadcast_to(e["d_wet"][None, c0:c1 + 1], box.shape)
            hb = box & e["has"][ra:rb + 1, c0:c1 + 1]
            ctx.paint(m, np.where(hb, enc(Dref), 0.0), ps0, ps1, pz0, pz1, channel=2)
            ctx.paint(m, np.where(hb, enc(dw), 0.0), ps0, ps1, pz0, pz1, channel=3)
            rubbed = cd["rub"] > 0.0
            out_corners.append(dict(id=cid, facade=f, kind=kind, side="right" if a["side"] > 0 else "left",
                                    s=round(a["s"], 3), d=round(a["d"], 3), z_ground=round(a["zg"], 3),
                                    z0=round(a["z0"], 3), z1=round(a["z1"], 3), sharpness=round(a["sharp"], 3),
                                    object=ctx.block.inst[a["inst"]]["object"] if a["inst"] >= 0 else None,
                                    gain=round(CORNER_GAIN * cd["gain"], 3), width=round(CORNER_W * cd["width"], 3),
                                    rubbed=bool(rubbed), contact=round(CONTACT * cd["rub"], 3),
                                    hand=[round(cd["h0"], 3), round(cd["h1"], 3)] if rubbed else None,
                                    jamb=round(cd["jamb"], 3) if rubbed else None, busy=round(cd["busy"], 3),
                                    mouth=cd["mouth"]))
    return out_runs, out_corners


def band_front(e, c):
    """The band a front at column c takes, by height: its run's band and its corner's extra over it (the shader's own
    sum, on the front itself)."""
    return e["R"][:, c] + e["Gx"][:, c]


def publish(ctx, faces, runs, corners, pave, Zr, r0, e_open, d_ring):
    """What the features that follow read (ctx.field("street_grime", key)); see the README for the formats."""
    Ha, Wa = ATLAS.shape(RES)
    zone = np.zeros((Ha, Wa), np.float32)
    ground = {}
    for F in FACADES:
        e = faces[F.idx]; a0, a1 = ATLAS.cols(F, RES)
        H, W = e["D"].shape
        v = e["R"] + e["Gx"]
        att = 1.0 - smooth(0.0, REACH, e["d_wet"][None, :] - np.nan_to_num(e["D"], nan=D_LO))
        zone[r0:r0 + H, a0:a1] = np.where(e["front"], np.clip(v * att, 0.0, None), 0.0)
        ground[F.name] = dict(s=np.round(s_at(F.idx, np.arange(W)), 3).astype(np.float32),
                              line=np.round(np.nan_to_num(e["line"], nan=D_LO), 3).astype(np.float32),
                              d_wet=np.round(e["d_wet"], 3).astype(np.float32))
    H2, W2 = Ha // 2, Wa // 2
    pooled = zone[:H2 * 2, :W2 * 2].reshape(H2, 2, W2, 2).max(axis=(1, 3)).astype(np.float16)
    ctx.publish("zone", dict(res=2 * RES, z0=ATLAS.z0, atlas=ATLAS.to_dict(), data=pooled, note=(
        "the splash zone: the street-level band on the street fronts as each run and corner takes it, 0..1.5 (1 at "
        "the pavement on a flat run at the geometry's measure; each run's own amount and reach, each corner's own "
        "splash gain and, where hands and bags rub it, its rubbing marks), with the recess fall-off already in; "
        f"max-pooled to 4 cm, rows from z0 up; on this block all of it lies on stone under {Z_HI - 0.2:.1f} m")))
    ctx.publish("runs", runs)
    ctx.publish("corners", corners)
    ctx.publish("entrances", [dict((k, v) for k, v in x.items() if k not in ("p0", "p1")) for x in pave.entrances])
    ctx.publish("ground", dict(res=RES, e_open=round(e_open, 4), wet=WET, reach=REACH, d_ring=d_ring, faces=ground,
                               note=(
        "per face and 2 cm column: `line`, the street line (the most forward base within 2 m along the face), and "
        "`d_wet`, how far back the rain-wet ground runs in front of the column (the deeper of the column's neighbours "
        f"within {BLEED} texels; {D_LO} where nothing stands, past the block's corners); a surface loses the band "
        "over `reach` behind d_wet")))
    ctx.publish("profile", dict(top=TOP, foot_w=FOOT_W, foot_e=FOOT_E, reach=REACH, corner_w=CORNER_W,
                                corner_gain=CORNER_GAIN, contact=CONTACT, plinth_gain=PLINTH_GAIN,
                                rub_full=list(RUB_FULL), rub_fade=list(RUB_FADE), note=(
        "the band at a height H above its ground, at the geometry's measure: FOOT_W exp(-H / FOOT_E) + (1 - FOOT_W)"
        "(1 - smoothstep(0, TOP, H)), 0 from TOP; each run takes it x its `amount` with H over its `reach`, x (1 + "
        "plinth_gain) on a plinth; within a corner's `width` of an exposed arris, x (1 + its `gain`); a rubbed corner's "
        "marks, its `contact` there, full to its `hand`[0] over the pavement and gone by its `hand`[1], where they are "
        "more (see `runs` and `corners`)")))


def elevation(canvas):
    """What the elevation images draw of this mask: the band and the corners' extra, as a front takes them."""
    return np.clip(canvas[:, :, 0] * R_SCALE + canvas[:, :, 1], 0.0, 1.0)


# ---------------------------------------------------------------------------------------------------- shader
def shader(g):
    R, Gc, B = g.sep(g.i("Mask"))
    d_ref = g.add(g.mul(B, D_SPAN), D_LO)                   # the street front's depth here
    d_wet = g.add(g.mul(g.i("Mask Alpha"), D_SPAN), D_LO)   # how far back the wet ground runs
    D = g.i("D")
    # a surface behind the wet ground's back edge loses the band over the splash's reach: the portal's recess
    att = g.one_minus(g.smooth(0.0, REACH, g.sub(d_wet, D)))
    # a corner's extra: along its front from the mask, onto its jamb by how far back from the arris the point stands
    near = g.one_minus(g.smooth(0.0, CORNER_W, g.sub(d_ref, D)))
    v = g.mul(g.add(g.mul(R, R_SCALE), g.mul(Gc, near)), att)
    # masonry, on walls and jambs: never a top or a soffit, nothing facing into the building
    vert = g.one_minus(g.smooth(VERT[0], VERT[1], g.absf(g.i("Nz"))))
    where = g.mul(g.mul(g.is_class(*classes.MASONRY), vert), g.smooth(OUTWARD[0], OUTWARD[1], g.i("Nd")))
    amt = g.mul(g.mul(v, where), g.mul(g.i("Strength"), AMOUNT))
    col = g.i("Color")
    y = g.lum(col)
    grey = g.rgb(g.mul(y, DIRT_TINT[0]), g.mul(y, DIRT_TINT[1]), g.mul(y, DIRT_TINT[2]))
    dirt = g.scale_rgb(g.mix(col, grey, DIRT_GREY, 'RGBA'), DIRT_DARK)
    g.o("Color", g.mix(col, dirt, amt, 'RGBA'))
    g.o("Roughness", g.mix(g.i("Roughness"), g.mx(g.i("Roughness"), MATTE), amt))
    g.o("Debug", g.mul(g.clamp(g.mul(v, DEBUG_GAIN)), where))
