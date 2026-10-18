# runoff_streaks -- faint rain-runoff streaks below the places where water leaves an edge (wear feature, 2026-10-14).
#
# Rain that collects on a ledge leaves it at a few particular places and runs down the stone below, picking up the dust
# that settled there and leaving a faint, darker, dirt-laden streak behind. Water concentrates where an edge ends or
# turns and where a horizontal edge runs into something vertical; it never starts in the middle of a flat panel or of
# the curved loggia cover (user fix 22, 2026-10-16: "they should be put in more strategic places, like corners or edge
# of columns. not in a flat surface"). On this building the water leaves:
#   slab_end       a balcony slab (floors 2-5) or the floor-1 terrace slab where its guard run stops against a
#                  room-dividing pier or a front pilaster: the ledge's water and the pier's own runoff leave past the
#                  shoe's end and run down the fascia (on floor 1 the podium stone) along the pier's side line, in the
#                  inside corner where the pilaster stands proud of the fascia
#   slab_corner    an outer corner of a slab edge (floors 1-5 and the roof): the ledge's water gathers on the turn and
#                  runs down one face a few centimetres off the fold's arris (or where a rounded corner starts)
#   sill_corner    a lower corner of an upper podium recess: the recess floor and its planter trough drain over the
#                  front edge where it meets the pier, down the stone below along the jamb line
#   head_corner    an upper corner of an upper podium recess: the water coming down the lintel band is led along the
#                  head's arris to its end and runs down the pier face beside the opening, along the jamb's arris
#   cover_end      an end of the loggia cover (user fix 2): the cover's top drains to its ends at the wall, and the
#                  water runs down the podium face in the inside corner beside the cover's end, then along the jamb
#   coping_end     beside a pilaster crown under the roof frame's cap (user fix 9): the roof slab's ledge water runs
#                  along to the crown's side and leaves over the roof fascia in the inside corner there, clear of the
#                  cap's overhang
#   lantern        rust: one or two of the four wall lanterns' fixings bleed a short orange-brown streak
# The guards' runs and their ends come from the plan (the runs the guards are built from: floor 1 the terrace runs of
# user fix 3; user fix 10: the runs stop at the piers; user fix 8b: straight legs meeting at one corner post).
# Most drip points carry nothing, as on a real building: each candidate is kept with its kind's probability (a little
# higher up the building, where wind-driven rain is heavier), drawn from a seed on its stable id (level, run, end,
# corner, bay), so rebuilds are exact and a change elsewhere reshuffles nothing.
#
# THE EDGE IT HUGS. Every source names the side its edge is on. From a drip point a few centimetres off the junction
# the face is scanned sideways (hug()): the first arris (the face falls away), step (something stands proud: a
# pilaster, the cover's end) or vertical joint within reach is the streak's guide, and the streak runs down a seeded
# 2.5-5.5 cm off an arris or step, or along the joint. A corner, head, cover or coping source with no such edge in
# reach carries nothing; a slab end or sill corner without one keeps its plan junction line.
#
# ONE STREAK AT A TIME. Every kept source draws its own streak from its seed: how much dirt it carries (most light, a
# few heavier), its length (per kind; a fascia's lower arris ends it sooner), its width at the drip and how much it
# widens as it falls, how it fades, its offset off the edge, a slight wander (a slow meander of a few millimetres, one
# smooth curve per streak, drifting away from its edge, never onto it) and the one to three rivulets inside it. No noise
# texture anywhere. A sheltered drip point gets less rain, so its streak is lighter: the amount scales with the sky
# the drip point sees (exposure(), 48 rays over the hemisphere in front of the face on the building part).
#
# THE PATH comes from the built geometry: the building part (terramar_building.blend, the one beside the wear part) is
# linked read-only and ray-cast. A streak runs down while the face under it stays stone (or a stone joint) and stays
# within TOL of the face it started on (a joint groove is crossed, a small set-back crept round); it stops where an
# edge throws the water off (a fascia's lower arris, a recess head, the storefront head) or something stands in front
# (a pilaster, a lantern, an awning tie rod's anchor). Where it stops at an edge, the water hangs there before
# dripping, so the last centimetre is a touch darker. Along the way the stone's own joints shape it: a vertical joint
# near the drip point draws the water into it, and at a bed joint the water hangs and spreads a little before running
# on.
#
# THE OVERLAYS. One thin decal per streak in TM_WEAR_runoff_streaks, conforming to the ray hits PROUD off the face (the
# nearest face of each 3 x 3 neighbourhood, so it bridges joint grooves and never dips into a step), its mask a tile of
# one atlas image generated here (ctx.image_dir/runoff_streaks_atlas.png, 3 mm per pixel). The decals see camera rays
# only (shadow, diffuse, glossy, transmission off) and their material is a tinted Transparent BSDF: what the camera sees
# through it is the stone's own shaded colour times 1 - k * DIRT (or RUST), k = mask * strength, so the streak darkens
# and greys the stone's own texture and leaves the lighting untouched. The material reads the switch: k is 0 with
# tm_wear off and with the strength at 0 (the decal is then a clear surface); debug paints the mask in DEBUG_RGB. Off
# is exact (the switch excludes TM_WEAR); at strength 0 the camera rays still cross the clear decals, which shifts the
# path tracer's sampling sequence in those pixels: the same picture, noise-level differences there. In EEVEE (Material
# Preview) the decals blend (surface_render_method BLENDED) instead of dithering, which drew them as stippled dots.
# Why overlays and not the shader: the streaks are a few centimetres wide and the facade vertices are 0.6-1.2 m apart,
# so a per-vertex signal cannot carry them; one decal per streak keeps each one unique and touches no material.
#
# No rinsed (lighter) streaks: b8's stone is clean, so there is no dust film for the runoff to wash off.
import math
import os

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from .. import classes, context, nodes

NAME = "runoff_streaks"
LABEL = ("faint rain-runoff streaks from drip points along edges: slab ends at piers, slab corners, recess corners, "
         "the cover's and the coping's ends, rust under lanterns")
ORDER = 220
CLASSES = ()                   # no shader part: the streaks are overlays
SIGNALS = ()
DEBUG_RGB = (0.10, 0.35, 1.00)
DEFAULT_STRENGTH = 2.5         # 2026-10-16: at 1.0 a streak darkened its core by ~15-25 of 255 over a few px and read as
                               # nothing; 2.5 reads as a faint trail beside its edge, 4 as a hard dark line

SEED = 220
BUILDING_FILE, BUILDING_ROOT = "terramar_part_shell.blend", "TM_BUILDING"
INTERIOR = ("RB_INTERIOR",)
ATLAS = "runoff_streaks_atlas.png"
MATERIAL = "TM_WEAR_runoff_streaks"
PROUD = 0.004                  # off the face; the audit counts same-facing faces within 3 mm as a z-fight, so not 2 mm

# ---------------------------------------------------------------------------------------------------- the sources
# kind: p = the share of candidates that carry a streak (times the height factor), amount = the dirt it carries
# (drawn as u ** 1.6 across the range: most light, a few heavier), length (m), w0 = half-width at the drip (m),
# need = the streak needs an edge (arris, step or joint) within reach of its drip point, or it is dropped
KINDS = {
    "slab_end": dict(p=0.170, amount=(0.35, 0.95), length=(0.30, 1.40), w0=(0.014, 0.032), need=False),
    "slab_corner": dict(p=0.160, amount=(0.30, 0.90), length=(0.30, 1.40), w0=(0.016, 0.034), need=True),
    "sill_corner": dict(p=0.300, amount=(0.30, 0.85), length=(0.50, 1.20), w0=(0.014, 0.030), need=False),
    "head_corner": dict(p=0.220, amount=(0.25, 0.75), length=(0.35, 1.10), w0=(0.012, 0.026), need=True),
    "cover_end": dict(p=0.500, amount=(0.30, 0.80), length=(0.60, 1.50), w0=(0.014, 0.030), need=True),
    "coping_end": dict(p=0.500, amount=(0.30, 0.85), length=(0.30, 0.70), w0=(0.014, 0.030), need=True,
                       gap=(0.055, 0.080)),   # clear of the cap's 5 cm overhang
    "lantern": dict(count=(1, 2), amount=(0.65, 0.95), length=(0.25, 0.55), w0=(0.012, 0.020), need=False),
}
TERRACE_P = 1.2                # the floor-1 terrace (a large open floor draining at its ends) carries one this much
                               # more often at its slab ends
HEIGHT = (5.0, 27.0, 0.75, 1.25)   # the probability factor: HEIGHT[2] at z HEIGHT[0] rising to HEIGHT[3] at HEIGHT[1]
NOMINAL = 0.06                 # a junction source's drip point sits this far off its junction line, on the face side
CORNER_BACK = 0.40             # a slab corner's drip point sits this far back from the guard's turn along its face
HUG_REACH = {"slab_end": 0.12, "slab_corner": 0.60, "sill_corner": 0.12, "head_corner": 0.15, "cover_end": 0.20,
             "coping_end": 0.15}  # how far toward its edge the face is scanned for it (m)
HUG_GAP = (0.025, 0.055)       # a streak runs this far off the arris or step it hugs (centre line; a kind's own "gap")
JOINT_GAP = (0.012, 0.030)     # ... or this far off the vertical joint it follows (beside it, its edge over the joint)
HUG_DRIFT = 0.006              # its drift away from the edge, at most this much per metre
SHELTER = (0.55, 0.45)         # amount factor: SHELTER[0] for a drip point seeing no sky, 1.0 from SHELTER[1] sky on
APART = 0.40                   # two kept streaks at least this far apart along an edge (their decals must not overlap)
STACK = 0.25                   # the same slab end or corner on another floor carries one this much less often: the
                               # slabs repeat floor to floor, their streaks must not stack into a pattern

# ---------------------------------------------------------------------------------------------------- the path
D = 0.5                        # rays start this far out from the face
DX, DZ = 0.01, 0.02            # decal grid: columns across, rows down (m)
FINE = 0.003                   # the fine scans (joints, the end) step
TOL = 0.025                    # a face within this of the start face (curvature, joint grooves, set-backs) carries on
FORWARD = 0.012                # something standing further forward than this is an obstacle (the streak stops at it)
GROOVE = 0.0015                # deeper than this behind the face is a joint groove
ATTRACT = 0.03                 # a vertical joint this close to the drip point draws the streak into it
ROD_BOX = (0.03, 0.05, 0.04)   # awning tie-rod anchors on the lintel face: half-width, depth, half-height (obstacles);
                               # with the plan's config.hardware (user fix 6) the anchor plate grown by ROD_MARGIN
ROD_MARGIN = 0.005

# ---------------------------------------------------------------------------------------------------- the look
PX = 0.003                     # mask resolution (m per pixel)
ATLAS_W = 2048
LAT_P = 2.2                    # across a streak: exp(-(x / hw) ** LAT_P), a soft edge
RIV_SHARE = 0.35               # the rivulets carry this share of the streak's value
JOINT_HOLD, JOINT_SPREAD = 0.25, 0.15   # at a bed joint: this much darker along it, this much wider just below it
LIP = 0.30                     # this much darker in the last ~1.2 cm above an edge the water drips off
DIRT = (0.50, 0.54, 0.60)      # at k = 1 the stone keeps 1 - DIRT of its colour: darker and a touch warmer, a grey-brown
                               # water stain (the old (0.58, 0.56, 0.50) kept more blue and read blue-black at strength) (AgX
                               # compresses the pale stone: 8 % darker in linear light reads as only ~4 of 255)
RUST = (0.28, 0.58, 0.85)      # rust: warm orange-brown


# ---------------------------------------------------------------------------------------------------- helpers
def _seed(*parts):
    return context.WearContext.seed(SEED, *parts)


def _lerp(rng, u):
    return rng[0] + (rng[1] - rng[0]) * u


def _height_factor(z):
    z0, z1, f0, f1 = HEIGHT
    return f0 + (f1 - f0) * min(max((z - z0) / (z1 - z0), 0.0), 1.0)


def _unit(a, b):
    d = (b[0] - a[0], b[1] - a[1])
    ln = math.hypot(*d)
    return d[0] / ln, d[1] / ln


def _out(d):
    """The outward normal of a counter-clockwise run's direction d (its right-hand side)."""
    return d[1], -d[0]


def _off(p, d, s):
    return p[0] + d[0] * s, p[1] + d[1] * s


def _source(kind, sid, p, n, z, hug=0, column=None):
    """A drip point: p (plan) on the face line, n out of the face, z the drip's height, hug the side its edge is on
    along t = (-n.y, n.x) (+1, -1; 0 none), column the id it shares with the same place on the other floors."""
    return {"kind": kind, "id": sid, "p": (float(p[0]), float(p[1])), "n": (float(n[0]), float(n[1])), "z": float(z),
            "hug": int(hug), "column": column}


# ---------------------------------------------------------------------------------------------------- candidates
def _behind_frame(plan, p):
    """User fix 9 (2026-10-15): a roof guard post behind the roof frame's cap (the front pilasters' crowns and the head
    between them), whose ledge water cannot spill over the front there."""
    rf = plan["structure"]["pilasters"].get("roof_frame")
    if not rf:
        return False
    ov = rf["cap"]["overhang"]
    return rf["x"][0] - ov <= p[0] <= rf["x"][1] + ov and p[1] < rf["cap"]["y"][1] + 0.1


def _runs(plan):
    """(level, run index, slab top, run path, ends) of every guard run: floors 1-5 and the roof's two halves."""
    b, env = plan["balconies"], plan["envelope"]
    out = []
    for floor, (top, _) in enumerate(env["storeys"], start=1):      # user fix 10: the runs' own ends (stop at a pier)
        runs = b["terrace_guard_runs"] if floor == 1 else b["guard_runs"]
        ends = b.get("terrace_guard_run_ends" if floor == 1 else "guard_run_ends", [("open", "open")] * len(runs))
        out += [(f"f{floor}", r, top, run, tuple(end)) for r, (run, end) in enumerate(zip(runs, ends))]
    out += [("roof", h, plan["roof"]["roof_top"], half, ("post", "joint"))
            for h, half in enumerate(plan["roof"]["guard_halves"])]
    return out


def candidates(plan):
    """Every place water leaves an edge onto the stone, with a stable id and the side its edge is on."""
    pd = plan["podium"]
    out = []
    for level, r, top, run, ends in _runs(plan):
        pts = [tuple(p) for i, p in enumerate(run) if i == 0 or math.dist(p, run[i - 1]) > 1e-6]
        if level != "roof" and math.dist(pts[0], pts[-1]) > 1e-6:     # the slab ends at the piers and pilasters
            d0, d1 = _unit(pts[0], pts[1]), _unit(pts[-2], pts[-1])
            out.append(_source("slab_end", f"{level}:{r}:end0", _off(pts[0], d0, NOMINAL), _out(d0), top, -1,
                               f"{r}:end0"))
            out.append(_source("slab_end", f"{level}:{r}:end1", _off(pts[-1], d1, -NOMINAL), _out(d1), top, 1,
                               f"{r}:end1"))
        for i in range(1, len(pts) - 1):                            # the slab's outer corners (left turns: convex)
            a, c = _unit(pts[i - 1], pts[i]), _unit(pts[i], pts[i + 1])
            if math.degrees(math.atan2(a[0] * c[1] - a[1] * c[0], a[0] * c[0] + a[1] * c[1])) < 1.0:
                continue
            if level == "roof" and _behind_frame(plan, pts[i]):
                continue                                            # user fix 9: the roof frame's cap holds it back
            sid = f"{level}:{r}:corner{i}"
            na, nc = _out(a), _out(c)
            ln = math.hypot(na[0] + nc[0], na[1] + nc[1])
            if _seed(sid, "side") < 0.5:                            # one face of the fold, a little back from it
                src = _source("slab_corner", sid, _off(pts[i], a, -CORNER_BACK), na, top, 1, f"{r}:c{i}")
            else:
                src = _source("slab_corner", sid, _off(pts[i], c, CORNER_BACK), nc, top, -1, f"{r}:c{i}")
            src["apex"] = (pts[i], ((na[0] + nc[0]) / ln, (na[1] + nc[1]) / ln))   # a rounded corner: its crown
            out.append(src)
    runs = {r["run"]: r for r in pd["runs"]}
    head = pd["upper"]["head"]
    for bay in pd["bays"]:                                          # the upper recesses' corners
        r = runs[bay["run"]]
        at = lambda s, r=r: (r["p"][0] + r["along"][0] * s, r["p"][1] + r["along"][1] * s)  # noqa: E731
        s0, s1 = bay["s"]
        out.append(_source("sill_corner", f"bay:{bay['id']}:0", at(s0 + NOMINAL), r["outward"],
                           pd["storeys"]["upper"][0], -1))
        out.append(_source("sill_corner", f"bay:{bay['id']}:1", at(s1 - NOMINAL), r["outward"],
                           pd["storeys"]["upper"][0], 1))
        out.append(_source("head_corner", f"head:{bay['id']}:0", at(s0 - NOMINAL), r["outward"], head + 0.01, 1))
        out.append(_source("head_corner", f"head:{bay['id']}:1", at(s1 + NOMINAL), r["outward"], head + 0.01, -1))
    lc = pd.get("loggia_cover")
    if lc:                                                          # user fix 2: the cover's ends at the wall
        for k, sgn in enumerate((-1, 1)):
            out.append(_source("cover_end", f"cover:{k}", (sgn * (lc["half_width"] + NOMINAL), lc["y_wall"]),
                               (0.0, -1.0), lc["z"][1], -sgn))
    rf = plan["structure"]["pilasters"].get("roof_frame")
    if rf:                                                          # user fix 9: the cap's ends past the crowns
        for k, sgn in enumerate((-1, 1)):
            out.append(_source("coping_end", f"coping:{k}", (sgn * (rf["x"][1] + NOMINAL), rf["y"][1]), (0.0, -1.0),
                               rf["cap"]["z"][0], -sgn))
    for k, ln in enumerate(pd["lanterns"]):                         # the lanterns' wall fixings
        out.append(_source("lantern", f"lantern:{k}:{ln['kind']}", (ln["x"], ln["y"]), ln["outward"],
                           pd["lantern"]["z"][0]))
    return out


def select(cands):
    """The candidates that carry a streak: each kept with its kind's probability (lanterns: one or two of them). A slab
    end or corner repeats on every floor: once one floor's carries a streak, the same place on the other floors carries
    one only STACK as often. Two streaks never share the stone: a candidate within APART of one already kept at about
    the same height is passed over."""
    keep, stacked = [], set()
    for c in cands:
        k = KINDS[c["kind"]]
        if "p" not in k:
            continue
        if any(math.dist(c["p"], q["p"]) < APART and abs(c["z"] - q["z"]) < 0.3 for q in keep):
            continue
        column = c["column"]
        p = k["p"] * _height_factor(c["z"]) * (STACK if column in stacked else 1.0)
        if c["kind"] == "slab_end" and c["id"].startswith("f1:"):
            p *= TERRACE_P
        if _seed(c["id"], "keep") < p:
            keep.append(c)
            if column is not None:
                stacked.add(column)
    lanterns = sorted([c for c in cands if c["kind"] == "lantern"], key=lambda c: _seed(c["id"], "keep"))
    lo, hi = KINDS["lantern"]["count"]
    keep += lanterns[:lo + int(_seed("lantern", "count") * (hi - lo + 1))]
    return keep


def params(c):
    """A streak's own shape, drawn from its seed."""
    k, sid = KINDS[c["kind"]], c["id"]
    r = lambda key: _seed(sid, key)                             # noqa: E731
    length = _lerp(k["length"], r("length"))
    rivs = [(_lerp((-0.6, 0.6), r(f"riv_at{i}")), _lerp((0.15, 0.35), r(f"riv_w{i}")),
             _lerp((0.5, 1.0), r(f"riv_k{i}")))
            for i in range(1 + min(2, int(3 * r("rivulets"))))]
    return {"amount": _lerp(k["amount"], r("amount") ** 1.6), "length": length,
            "efold": max(0.15, length * _lerp((0.25, 0.60), r("efold"))), "w0": _lerp(k["w0"], r("w0")),
            "spread": _lerp((0.00, 0.90), r("spread")), "off": _lerp((-0.015, 0.015), r("off")),
            "drift": _lerp((-0.02, 0.02), r("drift")), "wander": _lerp((0.001, 0.004), r("wander")),
            "wave": _lerp((0.50, 1.40), r("wave")), "phase": 2 * math.pi * r("phase"),
            "head": _lerp((0.05, 0.30), r("head")), "rivulets": rivs, "rust": c["kind"] == "lantern",
            "gap": _lerp(k.get("gap", HUG_GAP), r("gap")), "jgap": _lerp(JOINT_GAP, r("jgap")),
            "hdrift": HUG_DRIFT * r("hdrift"), "hug": None, "sky": None}


# ---------------------------------------------------------------------------------------------------- the geometry
STONE, JOINT, OTHER = 1, 2, 0


def _box_tris(centre, U, N, hw, depth, hh, verts, tris):
    c, U, N = Vector(centre), Vector((*U, 0.0)), Vector((*N, 0.0))
    Z = Vector((0.0, 0.0, 1.0))
    base = len(verts)
    for su in (-hw, hw):
        for sv in (0.0, depth):
            for sz in (-hh, hh):
                verts.append(tuple(c + U * su + N * sv + Z * sz))
    quads = ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3))
    for q in quads:
        tris.append((base + q[0], base + q[1], base + q[2]))
        tris.append((base + q[0], base + q[2], base + q[3]))
    return 12


def building_path(ctx):
    here = os.path.dirname(bpy.data.filepath) if bpy.data.filepath else ""
    rebuild = ctx.part_dir
    for d in (here, rebuild):
        p = os.path.join(d, BUILDING_FILE) if d else ""
        if p and os.path.exists(p):
            return p
    raise SystemExit(f"{NAME}: no {BUILDING_FILE} beside the wear part or in {rebuild}: build the building first")


def surfaces(path, plan):
    """(BVH, per-triangle code STONE | JOINT | OTHER) of the building part's exterior, linked read-only and dropped
    again, plus the awning tie rods' anchors on the lintels (props, from the plan) as obstacles."""
    with bpy.data.libraries.load(path, link=True) as (src, dst):
        dst.collections = [BUILDING_ROOT]
    root = dst.collections[0]
    lib = root.library
    verts, tris, codes = [], [], []
    try:
        hidden = set()
        for c in [root] + list(root.children_recursive):
            if c.name in INTERIOR:
                hidden |= {o.name for o in c.all_objects}
        for ob in sorted(root.all_objects, key=lambda o: o.name):
            if ob.type != 'MESH' or ob.name in hidden or not ob.data.polygons:
                continue
            me = ob.data
            n = len(me.vertices)
            co = np.empty(n * 3)
            me.vertices.foreach_get("co", co)
            mw = np.array(ob.matrix_world, dtype=np.float64)
            co = co.reshape(n, 3) @ mw[:3, :3].T + mw[:3, 3]
            lt = me.loop_triangles
            tv = np.empty(len(lt) * 3, dtype=np.int64)
            lt.foreach_get("vertices", tv)
            mi = np.empty(len(lt), dtype=np.int64)
            lt.foreach_get("material_index", mi)
            slot = []
            for m in me.materials:
                cls = classes.classify(m)[1] if m is not None else "none"
                slot.append(JOINT if m is not None and classes.base_name(m.name) == "TM_RB_stone_joint"
                            else STONE if cls == "stone" else OTHER)
            base = len(verts)
            verts.extend(map(tuple, co))
            tris.extend(map(tuple, tv.reshape(-1, 3) + base))
            codes.extend(slot[i] if i < len(slot) else OTHER for i in mi)
    finally:
        bpy.data.libraries.remove(lib)
    aw = plan["props"]["storefront_awnings"]
    rod_z = aw["config"]["rod_anchor_z"]
    box = ROD_BOX
    hw = aw["config"].get("hardware")
    if hw:                     # the plate, out to the clevis past the eye tab's pin
        box = (hw["plate"][0] / 2 + ROD_MARGIN, hw["plate"][2] + hw["tab"][1] + hw["clevis"][2] + ROD_MARGIN,
               hw["plate"][1] / 2 + ROD_MARGIN)
    for c in aw["canopies"]:
        for s in c["rods"]:
            at = (c["p"][0] + c["along"][0] * s, c["p"][1] + c["along"][1] * s, rod_z)
            codes.extend([OTHER] * _box_tris(at, c["along"], c["outward"], *box, verts, tris))
    return BVHTree.FromPolygons(verts, tris, all_triangles=True), np.array(codes, dtype=np.int8)


class Frame:
    """A streak's frame on its face: B the face point under the drip, n out of the face, t across (to the right seen
    from outside), z0 the drip's height; sample(x, y) casts at x across, y below z0 -> (distance, code) or None."""

    def __init__(self, bvh, codes, base, n):
        self.bvh, self.codes = bvh, codes
        self.n = Vector((n[0], n[1], 0.0)).normalized()
        self.t = Vector((-self.n.y, self.n.x, 0.0))
        self.B = Vector(base)

    def origin(self, x, y):
        return self.B + self.n * D + self.t * x - Vector((0.0, 0.0, y))

    def sample(self, x, y):
        loc, _, idx, dist = self.bvh.ray_cast(self.origin(x, y), -self.n, D + 0.5)
        if loc is None:
            return None
        return dist, int(self.codes[idx])


def locate(bvh, codes, c):
    """The face point under a source's drip, or None when the drip is not over stone."""
    n = Vector((c["n"][0], c["n"][1], 0.0)).normalized()
    z = c["z"] - PROUD
    o = Vector((c["p"][0], c["p"][1], z)) + n * (D + 0.3)
    loc, _, idx, dist = bvh.ray_cast(o, -n, D + 0.8)
    if loc is None or codes[idx] == OTHER:
        return None
    return Frame(bvh, codes, (loc.x, loc.y, z), c["n"])


HUG_ROWS = (0.03, 0.10, 0.20)  # the sideways scans' descents below the drip (m)
ROUND_TEST = 0.06              # a corner whose faces stay within FORWARD of its crown this far either side is rounded


def _scan_row(fr, y, h, reach, joints):
    """One sideways scan at descent y toward side h: (x, "edge" | "step" | "joint") of the first edge, or None. An
    eased arris or a corner joint reads as a groove the face never comes back from: the edge is where it starts."""
    ref = fr.sample(0.0, y)
    if ref is None or ref[1] == OTHER:
        return None
    d0 = ref[0]
    run = None
    for i in range(1, int(reach / FINE) + 1):
        x = h * i * FINE
        s = fr.sample(x, y)
        if s is None or s[1] == OTHER or s[0] > d0 + TOL or s[0] < d0 - FORWARD:
            kind = "step" if s is not None and s[0] < d0 - FORWARD else "edge"
            return (run if run is not None else x - h * FINE / 2), kind
        groove = s[1] == JOINT or s[0] > d0 + GROOVE
        if groove and run is None:
            run = x
        elif not groove and run is not None:
            if joints:
                return (run + x - h * FINE) / 2, "joint"
            run = None
    return None


def round_corner(bvh, codes, c, P):
    """A slab corner rounded on plan (the balcony slabs' fillets) has no arris: its streak runs down the round's crown,
    within a few centimetres of it, in a frame square to the bisector. Returns that frame, or None for a sharp fold
    (the face falls away by more than FORWARD within ROUND_TEST either side of the crown)."""
    if "apex" not in c:
        return None
    fr = locate(bvh, codes, {"p": c["apex"][0], "n": c["apex"][1], "z": c["z"]})
    if fr is None:
        return None
    for y in HUG_ROWS:
        ref = fr.sample(0.0, y)
        if ref is None or ref[1] == OTHER:
            return None
        for x in (-ROUND_TEST, ROUND_TEST):
            s = fr.sample(x, y)
            if s is None or s[1] == OTHER or abs(s[0] - ref[0]) > FORWARD:
                return None
    P["off"], P["drift"], P["hug"] = _lerp((-0.03, 0.03), _seed(c["id"], "crown")), 0.0, "round"
    return fr


def hug(fr, P, c):
    """The edge the streak runs down: the first arris, step or (slab ends, sill corners) vertical joint toward the
    source's side, found on at least two of the HUG_ROWS scans. Sets P's offset off it and its drift away from it;
    returns False when the kind needs an edge and none is in reach."""
    h, kind = c["hug"], c["kind"]
    if not h:
        return True
    found = [f for f in (_scan_row(fr, y, h, HUG_REACH[kind], kind in ("slab_end", "sill_corner"))
                         for y in HUG_ROWS) if f is not None]
    best = None
    for f in found:
        agree = [g for g in found if abs(g[0] - f[0]) < 0.015]
        if len(agree) >= 2 and (best is None or h * f[0] < h * best[0]):
            best = (float(np.median([g[0] for g in agree])), f[1])
    P["drift"] = -h * P["hdrift"]
    if best is None:
        if KINDS[kind]["need"]:
            return False
        P["off"], P["hug"] = h * (NOMINAL - P["gap"]), "line"   # the plan's junction line, 2.5-5.5 cm off it
        return True
    x, P["hug"] = best
    P["off"] = x - h * (P["jgap"] if P["hug"] == "joint" else P["gap"])
    return True


def _hemisphere(n=48):
    """n fixed cosine-weighted directions over the upper hemisphere (a Fibonacci spiral, no randomness)."""
    out = []
    for i in range(n):
        u = (i + 0.5) / n
        r, phi = math.sqrt(u), i * math.pi * (3.0 - math.sqrt(5.0))
        out.append(Vector((r * math.cos(phi), r * math.sin(phi), math.sqrt(1.0 - u))))
    return out


SKY_DIRS = _hemisphere()


def exposure(fr, P):
    """The share of SKY_DIRS that leave the building from 5 cm in front of the drip (a direction behind the face counts
    as blocked): about 0.5 on an open wall, less under a slab or in a recess."""
    o = fr.B + fr.n * 0.05 + fr.t * P["off"] - Vector((0.0, 0.0, 0.03))
    hits = sum(1 for d in SKY_DIRS if d.dot(fr.n) > 0.0 and fr.bvh.ray_cast(o, d, 80.0)[0] is None)
    return hits / len(SKY_DIRS)


def face_depth(fr, x):
    """The face's distance at the drip, x across: the nearest stone sample within 15 mm, so a drip point beside a joint
    never takes the groove's floor for the face. None when the drip is not over stone."""
    c = fr.sample(x, 0.0)
    if c is None or c[1] == OTHER:
        return None
    ds = [s[0] for s in (fr.sample(x + dx, 0.0) for dx in (-0.015, 0.015)) if s is not None and s[1] != OTHER]
    return min([c[0]] + [d for d in ds if d > c[0] - FORWARD])     # a groove's floor, never a step beside it


def fine_scans(fr, P, ymax):
    """Along the drip line: where the face ends (an edge or an obstacle) and its bed joints; across, near the top: the
    vertical joints. Returns (y_end, stop, bed joint descents, the vertical joint the streak follows or None)."""
    d0 = face_depth(fr, P["off"])
    if d0 is None:
        return 0.0, "none", [], None
    beds, run, y_end, stop = [], None, ymax, "length"
    for i in range(int(ymax / FINE) + 1):
        y = i * FINE
        s = fr.sample(P["off"] + P["drift"] * y, y)
        if s is not None and s[0] < d0 - FORWARD:
            y_end, stop = max(y - FINE, 0.0), "obstacle"            # something stands in front: a lantern, a rod
            break
        if s is None or s[1] == OTHER or s[0] > d0 + TOL:
            y_end, stop = max(y - FINE, 0.0), "edge"                # an arris, a recess, the storefront head
            break
        groove = s[1] == JOINT or s[0] > d0 + GROOVE
        if groove and run is None:
            run = y
        elif not groove and run is not None:
            beds.append((run + y - FINE) / 2)
            run = None
    verts = []
    run = None
    y = min(0.03, y_end / 2)
    for i in range(int(2 * ATTRACT / FINE) + 1):
        x = P["off"] - ATTRACT + i * FINE
        s = fr.sample(x, y)
        groove = s is not None and s[1] != OTHER and (s[1] == JOINT or d0 + GROOVE < s[0] < d0 + TOL)
        if groove and run is None:
            run = x
        elif not groove and run is not None:
            verts.append((run + x - FINE) / 2)
            run = None
    vj = min(verts, key=lambda x: abs(x - P["off"])) if verts and not P.get("hug") else None   # a hugged edge leads
    return y_end, stop, [b for b in beds if 0.02 < b < y_end - 0.01], vj


# ---------------------------------------------------------------------------------------------------- the streak
def centre(P, vj, y):
    meander = np.sin(2 * math.pi * y / P["wave"] + P["phase"]) * np.minimum(1.0, y / 0.1)
    c = P["off"] + P["drift"] * y + P["wander"] * meander
    if vj is not None:
        c = c + (vj - P["off"]) * (1.0 - np.exp(-y / 0.12))
    return c


def half_width(P, beds, y):
    hw = P["w0"] * np.maximum(0.35, 1.0 + P["spread"] * y)
    for b in beds:
        hw = hw * (1.0 + JOINT_SPREAD * np.where(y > b, np.exp(-np.maximum(y - b, 0.0) / 0.06), 0.0))
    return hw


def extent(P, vj, beds, y_end):
    y = np.linspace(0.0, y_end, 64)
    c, hw = centre(P, vj, y), half_width(P, beds, y)
    return float(np.max(np.abs(c) + 2.6 * hw)) + DX


def mask(P, vj, beds, y_end, stop, X, Y):
    """The streak's value (0..1) on a grid of lateral offsets X and descents Y (m)."""
    c, hw = centre(P, vj, Y), half_width(P, beds, Y)
    lat = np.exp(-(np.abs(X - c) / hw) ** LAT_P)
    riv, wsum = np.zeros_like(X), 0.0
    for at, w, k in P["rivulets"]:
        riv = np.maximum(riv, k / (1.0 + (np.abs(X - c - at * hw) / (w * hw)) ** 4))
        wsum = max(wsum, k)
    lat = lat * ((1.0 - RIV_SHARE) + RIV_SHARE * riv / wsum)
    L = P["length"]
    dep = np.clip(Y / 0.012, 0.0, 1.0) * np.exp(-Y / P["efold"]) * (1.0 + P["head"] * np.exp(-Y / 0.03))
    t = np.clip((Y - 0.7 * L) / (0.3 * L), 0.0, 1.0)
    dep = dep * (1.0 - t * t * (3.0 - 2.0 * t))
    for b in beds:
        dep = dep * (1.0 + JOINT_HOLD * np.exp(-((Y - b) / 0.008) ** 2))
    if stop == "edge" and y_end < L:
        dep = dep * (1.0 + LIP * np.exp(-np.maximum(y_end - Y, 0.0) / 0.012))
    return np.clip(P["amount"] * dep * lat, 0.0, 1.0)


def trace(fr, P, vj, beds, y_end, X):
    """The decal grid: rows down to y_end, columns across +-X; per sample the distance to the face (nan = not on it).
    The vertex distance is the nearest face of its 3 x 3 neighbourhood (bridging joint grooves, never inside a step)."""
    ys = list(np.arange(0.0, y_end - 1e-6, DZ)) + [y_end]
    xs = np.linspace(-X, X, max(3, int(math.ceil(2 * X / DX)) + 1))
    d0 = face_depth(fr, P["off"])
    dist = np.full((len(ys), len(xs)), np.nan)
    for i, y in enumerate(ys):
        for j, x in enumerate(xs):
            s = fr.sample(float(x), float(y))
            if s is not None and s[1] != OTHER and d0 - FORWARD <= s[0] <= d0 + TOL:
                dist[i, j] = s[0]
    near = dist.copy()
    pad = np.pad(dist, 1, constant_values=np.nan)
    for di in (-1, 0, 1):
        for dj in (-1, 0, 1):
            near = np.fmin(near, pad[1 + di:1 + di + len(ys), 1 + dj:1 + dj + len(xs)])
    near[np.isnan(dist)] = np.nan
    return np.array(ys), xs, near


# ---------------------------------------------------------------------------------------------------- atlas, material
def pack(sizes, width):
    """Shelf packing: [(w, h)] -> ([(x, y)] from the bottom-left, atlas height)."""
    order = sorted(range(len(sizes)), key=lambda i: -sizes[i][1])
    at, x, y, shelf = [None] * len(sizes), 0, 0, 0
    for i in order:
        w, h = sizes[i]
        if x + w > width:
            x, y, shelf = 0, y + shelf + 2, 0
        at[i] = (x, y)
        x += w + 2
        shelf = max(shelf, h)
    return at, y + shelf


def write_atlas(path, tiles, sizes, at, height):
    """The atlas as an 8-bit PNG (R = G = B = mask), loaded back as a file image (Non-Color)."""
    H = 1 << max(6, int(math.ceil(math.log2(max(height, 1)))))
    img = np.zeros((H, ATLAS_W), dtype=np.float32)
    for tile, (x, y) in zip(tiles, at):
        img[y:y + tile.shape[0], x:x + tile.shape[1]] = tile
    os.makedirs(os.path.dirname(path), exist_ok=True)
    old = bpy.data.images.get(os.path.basename(path))
    if old is not None:
        bpy.data.images.remove(old)
    gen = bpy.data.images.new("runoff_streaks_tmp", ATLAS_W, H, alpha=False)
    px = np.ones((H, ATLAS_W, 4), dtype=np.float32)
    px[..., 0] = px[..., 1] = px[..., 2] = img
    gen.pixels.foreach_set(px.ravel())
    gen.filepath_raw = path
    gen.file_format = 'PNG'
    gen.save()
    bpy.data.images.remove(gen)
    image = bpy.data.images.load(path, check_existing=False)
    image.name = os.path.basename(path)
    image.colorspace_settings.name = 'Non-Color'
    return image, H


def material(image):
    """The decals' material: a Transparent BSDF tinted 1 - k * DIRT (RUST on a rust streak), k = mask * strength, for
    camera rays only; k = 0 with the switch off or the strength 0. Debug: the mask in DEBUG_RGB."""
    mat = bpy.data.materials.get(MATERIAL) or bpy.data.materials.new(MATERIAL)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    b = nodes.Builder(nt)
    out = b.node('ShaderNodeOutputMaterial')
    tex = b.node('ShaderNodeTexImage', interpolation='Linear', extension='CLIP')
    tex.image = image
    m = b.sep(tex.outputs['Color'])[0]
    mode = b.attr("tm_wear", 'VIEW_LAYER')
    strength = b.attr("tm_wear_" + NAME, 'VIEW_LAYER')
    cam = b.node('ShaderNodeLightPath').outputs['Is Camera Ray']
    on = b.mul(b.mul(b.gt(mode, 0.5), b.one_minus(b.gt(mode, 1.5))), cam)
    k = b.mul(b.mul(m, strength), on)
    dark = b.mix(DIRT, RUST, b.attr("tm_wear_runoff_rust", 'OBJECT'), 'VECTOR')
    shade = b.node('ShaderNodeVectorMath', operation='SCALE')
    b.set(shade.inputs[0], dark)
    b.set(shade.inputs['Scale'], k)
    filt = b.node('ShaderNodeVectorMath', operation='SUBTRACT')
    b.set(filt.inputs[0], (1.0, 1.0, 1.0))
    b.set(filt.inputs[1], shade.outputs['Vector'])
    floor = b.node('ShaderNodeVectorMath', operation='MAXIMUM')         # a strength well over 1 never goes negative
    b.set(floor.inputs[0], filt.outputs['Vector'])
    b.set(floor.inputs[1], (0.0, 0.0, 0.0))
    clear = b.node('ShaderNodeBsdfTransparent')
    b.set(clear.inputs['Color'], floor.outputs['Vector'])
    dbg = b.node('ShaderNodeBsdfPrincipled')
    dbg.inputs['Base Color'].default_value = (*DEBUG_RGB, 1.0)
    dbg.inputs['Roughness'].default_value = 0.85
    dfac = b.mul(b.mul(b.clamp(b.mul(m, 6.0)), b.gt(strength, 0.0)), b.mul(b.gt(mode, 1.5), cam))
    mix = b.node('ShaderNodeMixShader')
    b.set(mix.inputs['Fac'], dfac)
    nt.links.new(clear.outputs['BSDF'], mix.inputs[1])
    nt.links.new(dbg.outputs['BSDF'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    mat.surface_render_method = 'BLENDED'         # EEVEE: a smooth streak, not dithered dots (Cycles ignores it)
    mat["tm_wear_overlay"] = NAME
    return mat


def decal_mesh(name, fr, ys, xs, near, uv_rect):
    """The decal from the trace grid: a vertex per sample on the face (PROUD off its nearest neighbourhood face), a quad
    where all four corners are on the face, UVs into the atlas tile."""
    u0, v0, u1, v1 = uv_rect
    idx = -np.ones(near.shape, dtype=np.int64)
    verts, uvs = [], []
    X, Y = xs[-1], ys[-1]
    for i, y in enumerate(ys):
        for j, x in enumerate(xs):
            if np.isnan(near[i, j]):
                continue
            idx[i, j] = len(verts)
            p = fr.origin(float(x), float(y)) - fr.n * (near[i, j] - PROUD)
            verts.append(tuple(p))
            uvs.append((u0 + (u1 - u0) * (x + X) / (2 * X), v1 - (v1 - v0) * y / Y))
    faces = []
    for i in range(len(ys) - 1):
        for j in range(len(xs) - 1):
            q = (idx[i, j], idx[i + 1, j], idx[i + 1, j + 1], idx[i, j + 1])
            if min(q) >= 0:
                faces.append(q)
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    used = sorted({v for f in faces for v in f})
    lay = me.uv_layers.new(name="UVMap")
    loop_v = np.empty(len(me.loops), dtype=np.int64)
    me.loops.foreach_get("vertex_index", loop_v)
    uv = np.array(uvs, dtype=np.float32)[loop_v]
    lay.data.foreach_set("uv", uv.ravel())
    if len(used) < len(verts):                       # samples on the face that no quad uses
        import bmesh
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        bm.to_mesh(me)
        bm.free()
    me.update()
    return me


# ---------------------------------------------------------------------------------------------------- the feature
def shader(b, ins):
    """No shader part: the streaks are overlays (see the header)."""
    return {}


def overlays(ctx):
    plan = ctx.plan
    bvh, codes = surfaces(building_path(ctx), plan)
    cands = candidates(plan)
    kept = select(cands)
    built, skipped, tiles, sizes, items = [], [], [], [], []
    for c in kept:
        fr = locate(bvh, codes, c)
        if fr is None:
            skipped.append((c["id"], "not over stone"))
            continue
        P = params(c)
        crown = round_corner(bvh, codes, c, P)
        if crown is not None:
            fr = crown
        elif not hug(fr, P, c):
            skipped.append((c["id"], "no edge in reach"))
            continue
        P["sky"] = exposure(fr, P)                             # lighter where sheltered: less rain reaches it
        P["amount"] *= SHELTER[0] + (1.0 - SHELTER[0]) * min(1.0, P["sky"] / SHELTER[1])
        P["shift"] = P["off"]                                  # centre the frame on the streak: a small decal and tile
        fr, P["off"] = Frame(bvh, codes, fr.B + fr.t * P["off"], (fr.n.x, fr.n.y)), 0.0
        y_end, stop, beds, vj = fine_scans(fr, P, P["length"] * 1.02)
        if y_end < 0.08:
            skipped.append((c["id"], f"face ends after {y_end:.2f} m"))
            continue
        X = extent(P, vj, beds, y_end)
        ys, xs, near = trace(fr, P, vj, beds, y_end, X)
        w, h = int(math.ceil(2 * X / PX)), int(math.ceil(y_end / PX))
        gx = -X + (np.arange(w) + 0.5) * (2 * X / w)
        gy = y_end * (1.0 - (np.arange(h) + 0.5) / h)          # tile rows from the bottom: the streak's end first
        tile = mask(P, vj, beds, y_end, stop, gx[None, :], gy[:, None])
        tiles.append(tile.astype(np.float32))
        sizes.append((w, h))
        items.append((c, P, fr, ys, xs, near, y_end, stop, beds, vj))
    at, height = pack(sizes, ATLAS_W)
    image, H = write_atlas(os.path.join(ctx.image_dir, ATLAS), tiles, sizes, at, height)
    mat = material(image)
    for (c, P, fr, ys, xs, near, y_end, stop, beds, vj), (w, h), (x, y) in zip(items, sizes, at):
        name = "wear_runoff_" + c["id"].replace(":", "_")
        me = decal_mesh(name, fr, ys, xs, near, (x / ATLAS_W, y / H, (x + w) / ATLAS_W, (y + h) / H))
        me.materials.append(mat)
        ob = ctx.add(name, me)
        ob["tm_wear_runoff_rust"] = 1.0 if P["rust"] else 0.0
        ob["tm_wear_runoff_kind"] = c["kind"]
        ob["tm_element"], ob["tm_role"] = "TM_WEAR", f"runoff_{c['kind']}"
        for flag in ("visible_shadow", "visible_diffuse", "visible_glossy", "visible_transmission",
                     "visible_volume_scatter"):
            setattr(ob, flag, False)
        built.append({"id": c["id"], "kind": c["kind"], "amount": round(P["amount"], 3),
                      "length": round(P["length"], 2),
                      "ran_m": round(y_end, 3), "stop": stop, "width_m": round(2 * P["w0"], 3),
                      "beds": len(beds), "follows_joint": vj is not None, "hug": P["hug"],
                      "off_m": round(P["shift"], 3), "sky": round(P["sky"], 2), "faces": len(me.polygons),
                      "at": [round(v, 2) for v in fr.origin(P["off"], 0.0) - fr.n * D]})
    by_kind = {}
    for c in cands:
        by_kind.setdefault(c["kind"], [0, 0, 0])[0] += 1
    for c in kept:
        by_kind[c["kind"]][1] += 1
    for s in built:
        by_kind[s["kind"]][2] += 1
    return {"candidates_kept_built": by_kind, "streaks": len(built), "skipped": skipped,
            "atlas": [ATLAS_W, H], "faces": sum(s["faces"] for s in built), "built": built}
