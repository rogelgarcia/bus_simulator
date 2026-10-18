# Small chips on the upper trim (AI 609, the fifth step of the weathering-realism group AI 605-610). Up high nobody
# knocks the stone, but frost, wind-driven rain and a century of settling break small pieces off the most exposed arrises
# of a terracotta facade: the nose of a course where one block meets the next, the outer corners of the sills. The owner's
# suggested weathered version of the top floor (2026-10-10) shows "worn edges"; the arrises' wear itself is the edge
# band's upper term (wear/edges.py, edge_worn_upper), and this feature adds the few broken pieces.
#
# THE SITES, each found on the model: the NOSE arris -- the outermost convex edge where a top meets a face turned to the
# street -- of the crown cornice's projecting member (ge_crown_c2), of the band's top moulding (ge_cornice45_top) and of
# the impost course, at every block joint along it (the 0.76 m blocks of AI 607, measured along each facade); and every
# sill's nose at its two outer corners and its two joints (a sill is three blocks). A weak point is where a piece comes
# off: a block's end at a joint, a trihedral corner.
#
# RARE AND UNIQUE: each site draws from its own seed (sha256 of "upper_chips:" and its place) whether it lost a piece at
# all -- P_JOINT, P_CORNER: a few percent, so a few dozen chips on the whole block, never one at every window -- and the
# chip's own size, outline, facets and age (AI 570's chip_shape, scaled by SIZE_UP), so no two are alike and a rebuild
# draws the same. A joint's chip runs from the joint along the arris to one side, which side its own draw.
#
# THE GEOMETRY (as AI 570's chips): a chipped copy of each piece that lost one, cut with one exact boolean, shown while
# the feature is on and the group switch is on, the original otherwise (controls.REALISM_GEO). The scar is fresh clay:
# the shader lifts its colour in its own hue by up to FRESH_GAIN and makes it matter, scaled by its age.
#
# CONTROLS: the strength wear_upper_chips (0: the originals, the look before AI 609 exactly; it also scales the scars'
# freshness) and the group switch wear_realism.
import hashlib, math
import numpy as np
from .. import classes
from ..geometry import FACADES, facade_of
from . import edge_wear as ew
from .piece_tone import BLOCK_L

NAME = "upper_chips"
AI = 609
LABEL = "small chips on the upper trim"
ORDER = 112                       # a fabric feature, after AI 570's edge wear (110) and AI 607's tones (105)
DEFAULT_STRENGTH = 1.0
DEBUG_COLOR = (1.00, 0.45, 0.65)

NOSES = ("ge_crown_c2", "ge_cornice45_top", "impost_course")
NOSE_TOL = 0.02                   # an arris within this of a facade's outermost one is the nose
END_CLEAR = 0.06                  # a joint site keeps this far from the ends of its arris edge
P_JOINT = dict(ge_crown_c2=0.040, ge_cornice45_top=0.035, impost_course=0.025, sill=0.15)
P_CORNER = 0.0                    # a sill's outer corner: none, since a sill's ends are built into its jambs (the first
                                  # build spent most of its chips on corners nobody can see); the code stays for a free end
RISK = (0.30, 0.75)               # a site's risk (AI 570's measure of how big a piece comes off), drawn per site
SIZE_UP = 0.85                    # up high the pieces are a little smaller than the street's knocks
FRESH_GAIN = 0.22                 # a fresh scar's colour, this much lighter in its own hue at full freshness
FRESH_ROUGH = 0.90


def draw(key, n):
    out, i = [], 0
    while len(out) < n:
        h = hashlib.sha256(("upper_chips:" + key + (f"#{i}" if i else "")).encode()).digest()
        out += [int.from_bytes(h[2 * j:2 * j + 2], "big") / 65535.0 for j in range(16)]
        i += 1
    return out[:n]


def build(ctx):
    ctx.log(f"   upper_chips: block joints on the noses of {', '.join(NOSES)} and the sills, their outer corners; "
            f"cut in apply()")


def _arrises(o):
    """The object's convex top-front arris edges in world space: (a, b, n_top, n_front, facade, d_out)."""
    import bmesh
    from mathutils import Vector
    M = o.matrix_world; R = M.to_3x3().inverted().transposed()
    bm = bmesh.new(); bm.from_mesh(o.data); bm.normal_update()
    out = []
    for e in bm.edges:
        if len(e.link_faces) != 2 or not e.is_convex: continue
        fa, fb = e.link_faces
        na, nb = (R @ fa.normal).normalized(), (R @ fb.normal).normalized()
        a, b = M @ e.verts[0].co, M @ e.verts[1].co
        mid = (a + b) / 2
        f = facade_of(mid.x, mid.y); F = FACADES[f]; fn = Vector((F.n[0], F.n[1], 0.0))
        if na.z > 0.7 and nb.dot(fn) > 0.7: top, front, mi = na, nb, fa.material_index
        elif nb.z > 0.7 and na.dot(fn) > 0.7: top, front, mi = nb, na, fb.material_index
        else: continue
        out.append(dict(a=np.array(a), b=np.array(b), top=np.array(top), front=np.array(front), f=f,
                        d=F.sdz(mid.x, mid.y, mid.z)[1], mi=mi))
    bm.free()
    return out


def _nose(arr):
    best = {}
    for x in arr: best[x["f"]] = max(best.get(x["f"], -1e9), x["d"])
    return [x for x in arr if x["d"] >= best[x["f"]] - NOSE_TOL]


def _frame(x):
    a, b = x["a"], x["b"]
    t = (b - a) / max(np.linalg.norm(b - a), 1e-9)
    uA = np.cross(x["top"], t); uA = uA / np.linalg.norm(uA)
    if uA @ x["front"] > 0: uA = -uA                   # into the top face, away from the front
    uB = np.cross(x["front"], t); uB = uB / np.linalg.norm(uB)
    if uB @ x["top"] > 0: uB = -uB                     # down the front face, away from the top
    return t, uA, uB


def _lens(key, x, O, run, kind="joint"):
    t, uA, uB = _frame(x)
    u = draw(key, 4)
    risk = RISK[0] + (RISK[1] - RISK[0]) * u[0]
    sh = ew.chip_shape("upper:" + key, risk, kind)
    sh["L"] *= SIZE_UP; sh["D"] *= SIZE_UP
    DA, DB = sh["D"] * (1.0 - 0.3 * sh["asym"]), sh["D"] * (1.0 + sh["asym"])
    pts = ew.lens_points(np.asarray(O), run * t, uA, uB, max(DA, 0.002), max(DB, 0.002), sh, 0.002, 0.0)
    return pts, sh


def _corner(key, x, O, inward):
    t, uA, uB = _frame(x)
    u = draw(key, 4)
    risk = RISK[0] + (RISK[1] - RISK[0]) * u[0]
    sh = ew.chip_shape("upper:" + key, risk, "corner")
    L, D = sh["L"] * SIZE_UP, sh["D"] * SIZE_UP
    pts = ew.corner_points(np.asarray(O), [inward * t, uB, uA], (max(L * 0.6, 0.004), max(D, 0.002), max(D, 0.002)), sh)
    return pts, sh


def _sites(o, kind):
    """The chips this object lost: [(points (world), at (world), kind, fresh, material index)]."""
    arr = _nose(_arrises(o))
    chips = []
    if kind == "sill":
        if not arr: return chips
        x = max(arr, key=lambda q: np.linalg.norm(q["b"] - q["a"]))     # the sill's nose: its longest outermost arris
        a, b = x["a"], x["b"]; t = (b - a) / np.linalg.norm(b - a); Ln = np.linalg.norm(b - a)
        for end, (O, inward) in (("start", (a, 1.0)), ("end", (b, -1.0))):
            key = f"{o.name}:corner:{end}"
            if draw(key, 1)[0] < P_CORNER:
                pts, sh = _corner(key, x, O, inward); chips.append((pts, O, "corner", sh["fresh"], x["mi"]))
        for j in (1, 2):
            key = f"{o.name}:joint:{j}"
            u = draw(key, 2)
            if u[0] < P_JOINT["sill"]:
                O = a + t * Ln * j / 3.0
                pts, sh = _lens(key, x, O, 1.0 if u[1] < 0.5 else -1.0); chips.append((pts, O, "joint", sh["fresh"], x["mi"]))
        return chips
    p = P_JOINT[kind]
    for x in arr:
        F = FACADES[x["f"]]
        s0 = F.sdz(*x["a"])[0]; s1 = F.sdz(*x["b"])[0]
        lo, hi = min(s0, s1), max(s0, s1)
        for k in range(int(math.ceil((lo + END_CLEAR) / BLOCK_L)), int(math.floor((hi - END_CLEAR) / BLOCK_L)) + 1):
            s = k * BLOCK_L
            key = f"{o.name}:{F.name}:{s:.2f}:{x['a'][2]:.3f}"
            u = draw(key, 2)
            if u[0] >= p: continue
            O = x["a"] + (x["b"] - x["a"]) * ((s - s0) / (s1 - s0))
            pts, sh = _lens(key, x, O, 1.0 if u[1] < 0.5 else -1.0); chips.append((pts, O, "joint", sh["fresh"], x["mi"]))
    return chips


def apply(actx):
    import bpy
    from mathutils import Vector, Matrix
    targets = []
    for o in [q for q in bpy.data.objects if q.type == 'MESH' and q.library is None]:
        if o.name.startswith("sill_"): targets.append((o, "sill"))
        else:
            for nm in NOSES:
                if o.name.startswith(nm): targets.append((o, nm)); break
    n_obj = n_chip = 0; by = {}
    for o, kind in targets:
        chips = _sites(o, kind)
        if not chips: continue
        Mi = o.matrix_world.inverted()
        entry = dict(use_self=False, chips=[], mat_index=[])
        for pts, O, k, fresh, mi in chips:
            entry["chips"].append(dict(points=[np.array(Mi @ Vector(tuple(p))) for p in pts], at=np.array(Mi @ Vector(tuple(O))),
                                       kind=k, fresh=float(fresh)))
            entry["mat_index"].append(mi)
        for pts, O, k, fresh_, mi in chips:
            actx.log(f"   upper_chips: {k} chip on {o.name} at ({O[0]:.2f}, {O[1]:.2f}, {O[2]:.2f})")
        me, fresh = ew._chipped(o, entry, actx.log)
        nm = "wear_" + NAME
        if nm in me.attributes: me.attributes.remove(me.attributes[nm])
        at = me.attributes.new(nm, 'FLOAT', 'FACE'); at.data.foreach_set("value", [float(v) for v in fresh])
        me.name = "WEAR_upper_" + o.name
        c = actx.add_object("WEAR_upper_" + o.name, me, replaces=o.name)
        c.matrix_world = o.matrix_world.copy()
        ew._copy_flags(o, c)
        n_obj += 1; n_chip += len(chips); by[kind] = by.get(kind, 0) + len(chips)
    actx.log(f"   upper_chips: {n_chip} chips on {n_obj} pieces (" + ", ".join(f"{k} {v}" for k, v in sorted(by.items())) + ")")


def shader(g):
    fresh = g.clamp(g.i("Attr"))
    k = g.mul(g.mul(fresh, g.i("Strength")), g.mul(g.attr("wear_realism"), g.is_class(*classes.MASONRY)))
    col = g.i("Color")
    lifted = g.mix(col, g.rgb(1.0 + FRESH_GAIN, 1.0 + FRESH_GAIN, 1.0 + FRESH_GAIN), 1.0, 'RGBA', 'MULTIPLY')
    g.o("Color", g.mix(col, lifted, g.clamp(k), 'RGBA'))
    g.o("Roughness", g.mix(g.i("Roughness"), g.mx(g.i("Roughness"), FRESH_ROUGH), g.clamp(k)))
    g.o("Debug", g.gt(g.i("Attr"), 0.0))
