# fabric_fade -- dirt at the café umbrellas' canvas EDGES: the drip line along the hems and valance bottoms, the
# seams over the ribs, the vent edge (the wear module, 2026-10-14; reworked to edges only after the user's review
# rejected whole-surface wear: "if the wear or dirt is applied over an entire surface, instead of edges, or forming a
# pattern, then it has no value". The sun-faded canopy tops went: a fade over a whole panel is a whole-surface change;
# the name stays, for the switch's tm_wear_fabric_fade).
#
# The cream canvas (TM_RB_cafe_canopy, class "fabric") stays clean on its panels. Dirt collects only where something
# stops it, each from the geometry, no noise:
#   drip line  rain runs off the canvas at its lowest edges and dries there, leaving a thin line of the street's dust:
#              along the valance flaps' bottoms, the canopy's hem between the flaps, the vent cap's hem and its flaps.
#              fabric_hem (POINT) is the height (m) of each fabric vertex over the lowest point of its own piece of
#              canvas (a flap, the canopy sheet, the vent cap) within LOCAL_R horizontally, so it follows the sagging,
#              scalloped hems; the line is full at the edge and gone at EDGE_H (per flap EDGE_VAR x)
#   seams      the stitched seams over the ribs hold dust in the stitch holes and the doubled band, and stay damp
#              longest: a narrow line within SEAM_W of each seam, read from the umbrella's own rb_seam UV map (x = the
#              canvas distance to the nearest stitched seam, cafe_umbrella.py), on the canopy and the vent cap's sheets.
#              Each seam (fabric_seam, FACE: a seeded value per seam, 0 off the sheets) has its own amount and runs
#              from the hem up a seeded share of its length (fabric_r, POINT: 0 at the sheet's inner edge, 1 at the
#              rib tips), where the runoff carries the dust down to it
#   vent edge  the air leaves through the vent, and the cap above keeps the rain off its edge: a ring of dust within
#              VENT_W (in fabric_r) of the main canopy's vent opening (and of the vent cap's spindle hole, hidden)
#   fabric_piece (FACE) a seeded value in (0.05, 1] per umbrella: how old its canvas is (PIECE); also the feature's
#                presence flag (absent reads 0)
#   per flap   the framework's panel signal (a seeded value per loose island) shuffled by the piece: each flap's line
#              takes its own height and amount, so the eight flaps of an umbrella never match
# Mostly on the outside: the canvas's back (the valance's inside, the canopy's underside) takes BACK_SHARE of the seam
# and vent dirt and BACK_LINE of the drip line (a wet hem soils through).
# Strength 1 at an average piece: the drip line goes LINE of the way to DUST_RGB at the edge, a seam SEAM, the vent edge
# VENT, roughness +ROUGH x that. b8 shows clean, new umbrellas, so even concentrated they stay light.
import math

import numpy as np
from mathutils.kdtree import KDTree

from .. import classes

NAME = "fabric_fade"
LABEL = "umbrella canvas dirt at its edges only: the drip line along the hems and flaps, the rib seams, the vent edge"
ORDER = 30
CLASSES = ("fabric",)
SIGNALS = ("panel",)
ATTRIBUTES = {"fabric_hem": 0.1, "fabric_piece": 1.0, "fabric_seam": 1.0, "fabric_r": 1.0}
DEBUG_RGB = (0.85, 0.10, 0.08)            # red (debug colours are distinct across the features)
DEFAULT_STRENGTH = 1.0

SEAM_MAP = "rb_seam"                    # cafe_umbrella.py's UV map: x = the distance to the nearest stitched seam
DUST_RGB = (0.30, 0.29, 0.27)           # the street's dust
LINE = 0.55                             # the drip line's mix toward DUST_RGB at the edge, strength 1
EDGE_H = 0.016                          # the line's height over the drip edge (m)
EDGE_VAR = (0.6, 1.4)                   # per flap / hem: the line's height
LINE_VAR = (0.5, 1.3)                   # per flap / hem: its amount
SEAM = 0.50                             # a seam line's mix at the seam
SEAM_W = 0.016                          # m either side of the seam (the doubled band is 19 mm, the stitches at 12 mm)
SEAM_REACH = (0.25, 0.85)               # per seam: the share of its length from the hem up that the line runs
SEAM_VAR = (0.45, 1.20)                 # per seam: its amount
VENT = 0.40                             # the vent edge's mix
VENT_W = 0.035                          # its reach in fabric_r (~3 cm on the main canopy)
BACK_SHARE = 0.4                        # the canvas's back takes this share of the seam and vent dirt ...
BACK_LINE = 0.7                         # ... and this of the drip line (the wet hem soils through)
ROUGH = 0.25                            # roughness added x the mix
PIECE = (0.65, 1.30)                    # per umbrella: newer .. older
LOCAL_R = 0.15                          # the umbrellas' drip edge: the lowest point of the piece within this radius
FAR = 1.0                               # fabric_hem where there is no drip edge below; fabric_r off the sheets
SHEET_NZ = 0.4                          # a piece of canvas whose area-weighted normal z exceeds this is a sheet


def _islands(me, faces):
    """Connected pieces of the given faces (shared vertices): [(vertex index array, face index array)]."""
    parent = {}

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for f in faces:
        vs = me.polygons[f].vertices
        for v in vs:
            parent.setdefault(v, v)
        r0 = find(vs[0])
        for v in vs[1:]:
            r = find(v)
            if r != r0:
                parent[r] = r0
    groups, gfaces = {}, {}
    for v in parent:
        groups.setdefault(find(v), []).append(v)
    for f in faces:
        gfaces.setdefault(find(me.polygons[f].vertices[0]), []).append(f)
    return [(np.array(sorted(groups[r])), np.array(sorted(gfaces.get(r, [])))) for r in groups]


def _local_min_heights(co, island):
    """Heights over the lowest vertex of the island within LOCAL_R horizontally."""
    pts = co[island]
    kd = KDTree(len(pts))
    for i, p in enumerate(pts):
        kd.insert((p[0], p[1], 0.0), i)
    kd.balance()
    z = pts[:, 2]
    out = np.empty(len(pts))
    for i, p in enumerate(pts):
        near = [j for _, j, _ in kd.find_range((p[0], p[1], 0.0), LOCAL_R)]
        out[i] = z[i] - z[near].min()
    return out


def attributes(ctx):
    """tm_wear_fabric_hem, _r (POINT) and tm_wear_fabric_piece, _seam (FACE) on the fabric meshes."""
    stats = []
    for ob in ctx.meshes(CLASSES):
        me = ob.data
        fab = [i for i, m in enumerate(me.materials) if m is not None and classes.classify(m)[1] in CLASSES]
        nf = len(me.polygons)
        mi = np.empty(nf, dtype=np.int64)
        me.polygons.foreach_get("material_index", mi)
        faces = np.nonzero(np.isin(mi, fab))[0]
        if not len(faces):
            continue
        ctx.own_mesh(ob)                                       # world heights: per object
        me = ob.data
        co, _ = ctx.world(ob)
        nv = len(me.vertices)
        area = np.empty(nf)
        me.polygons.foreach_get("area", area)
        fnz = np.empty(nf * 3)
        me.polygons.foreach_get("normal", fnz)
        fnz = fnz.reshape(nf, 3) @ np.linalg.inv(np.array(ob.matrix_world, dtype=np.float64)[:3, :3])
        fnz = fnz[:, 2] / np.maximum(np.linalg.norm(fnz, axis=1), 1e-12)
        fcen = np.empty(nf * 3)
        me.polygons.foreach_get("center", fcen)
        mw = np.array(ob.matrix_world, dtype=np.float64)
        fcen = fcen.reshape(nf, 3) @ mw[:3, :3].T + mw[:3, 3]
        ls = np.empty(nf, dtype=np.int64)
        me.polygons.foreach_get("loop_start", ls)
        lt = np.empty(nf, dtype=np.int64)
        me.polygons.foreach_get("loop_total", lt)
        lv = np.empty(len(me.loops), dtype=np.int64)
        me.loops.foreach_get("vertex_index", lv)
        seam_uv = me.uv_layers.get(SEAM_MAP)
        sx = None
        if seam_uv is not None:
            sx = np.empty(len(me.loops) * 2)
            seam_uv.data.foreach_get("uv", sx)
            sx = sx.reshape(-1, 2)[:, 0]
        piece = np.zeros(nf, dtype=np.float32)
        piece[faces] = 0.05 + 0.95 * ctx.seed(NAME, "piece", ob.name)
        hem = np.full(nv, FAR, dtype=np.float32)
        rr = np.full(nv, FAR, dtype=np.float32)
        seam = np.zeros(nf, dtype=np.float32)
        isl = _islands(me, faces)
        sheets = [(vs, fs) for vs, fs in isl
                  if len(fs) and float((area[fs] * fnz[fs]).sum() / area[fs].sum()) > SHEET_NZ]
        sheets.sort(key=lambda s: -float(area[s[1]].sum()))
        lines = 0
        for vs, fs in isl:
            h = _local_min_heights(co, vs)
            hem[vs] = h
            lines += int((h < EDGE_H).sum())
        for rank, (vs, fs) in enumerate(sheets):
            cx, cy = co[vs, 0].mean(), co[vs, 1].mean()
            r = np.hypot(co[vs, 0] - cx, co[vs, 1] - cy)
            rr[vs] = (r - r.min()) / max(float(r.max() - r.min()), 1e-6)
            if sx is None:
                continue
            on = [li for f in fs for li in range(ls[f], ls[f] + lt[f]) if sx[li] < 1e-5]   # corners on a seam
            if not on:
                continue
            ang = np.arctan2(co[lv[on], 1] - cy, co[lv[on], 0] - cx)
            a0 = math.atan2(float(np.sin(8.0 * ang).sum()), float(np.cos(8.0 * ang).sum())) / 8.0
            fa = np.arctan2(fcen[fs, 1] - cy, fcen[fs, 0] - cx)
            k = np.round((fa - a0) / (math.pi / 4.0)).astype(int) % 8
            for kk in range(8):
                seam[fs[k == kk]] = 0.05 + 0.95 * ctx.seed(NAME, "seam", ob.name, rank, kk)
        ctx.set_attribute(ob, "fabric_hem", hem, 'POINT')
        ctx.set_attribute(ob, "fabric_r", rr, 'POINT')
        ctx.set_attribute(ob, "fabric_piece", piece, 'FACE')
        ctx.set_attribute(ob, "fabric_seam", seam, 'FACE')
        stats.append((ob.name, len(faces), len(isl), len(sheets), lines, round(float(piece[faces].max()), 3)))
    return {"objects": stats}


def shader(b, ins):
    fab = b.is_class(*CLASSES)
    piece = b.signal("fabric_piece")
    present = b.mul(fab, b.gt(piece, 0.0))
    pv = b.add(PIECE[0], b.mul((PIECE[1] - PIECE[0]) / 0.95, b.sub(piece, 0.05)))
    flap = b.math('FRACT', b.add(b.signal("panel"), b.mul(piece, 5.31)))
    # the drip line along the lowest edge of each piece
    eh = b.mul(EDGE_H, b.add(EDGE_VAR[0], b.mul(EDGE_VAR[1] - EDGE_VAR[0],
                                                 b.math('FRACT', b.add(b.mul(flap, 3.7), 0.2)))))
    line = b.mul(b.smooth(eh, b.mul(eh, 0.2), b.signal("fabric_hem")),
                 b.add(LINE_VAR[0], b.mul(LINE_VAR[1] - LINE_VAR[0], flap)))
    # the seams over the ribs
    sv = b.signal("fabric_seam")
    seam_attr = b.node('ShaderNodeAttribute', attribute_type='GEOMETRY', attribute_name=SEAM_MAP)
    sd = b.xyz(seam_attr.outputs['Vector'])[0]
    reach = b.add(SEAM_REACH[0], b.mul(SEAM_REACH[1] - SEAM_REACH[0], b.math('FRACT', b.mul(sv, 4.3))))
    start = b.one_minus(reach)
    along = b.smooth(start, b.add(start, 0.2), b.signal("fabric_r"))
    seam = b.mul(b.mul(b.smooth(SEAM_W, SEAM_W * 0.2, sd), along),
                 b.mul(b.gt(sv, 0.0), b.add(SEAM_VAR[0], b.mul(SEAM_VAR[1] - SEAM_VAR[0], sv))))
    # the vent edge
    vent = b.mul(b.smooth(VENT_W, 0.0, b.signal("fabric_r")), b.gt(sv, 0.0))
    back = b.geometry('Backfacing')
    side = b.one_minus(b.mul(1.0 - BACK_SHARE, back))
    line_side = b.one_minus(b.mul(1.0 - BACK_LINE, back))
    amt = b.mx(b.mx(b.mul(b.mul(line, LINE), line_side), b.mul(b.mul(seam, SEAM), side)),
               b.mul(b.mul(vent, VENT), side))
    k = b.mul(b.mul(amt, pv), b.mul(present, ins["Strength"]))
    col = b.mix(ins["Color"], DUST_RGB, k, 'RGBA')
    rough = b.add(ins["Roughness"], b.mul(ROUGH, k))
    mask = b.mul(b.mx(b.mx(b.clamp(line), seam), vent), present)
    return {"Color": col, "Roughness": rough, "Mask": mask}
