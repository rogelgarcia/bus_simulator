# splash_zone -- street grime collected in the junction where a wall meets the pavement (2026-10-14, reworked the same
# day: edges, not surfaces).
#
# The first version tinted a 0.2-0.6 m band over the whole foot of every wall and pit; the user rejected it: "if the
# wear or dirt is applied over an entire surface, instead of edges, or forming a pattern, then it has no value". Real
# street grime collects where something stops it: the line where a wall, a pier, a tree pit or a pot stands on the
# paving, deepest in the inside corners. So the feature now lives only in that junction: a narrow gradient a few
# centimetres up the vertical face and a few centimetres out on the paving, varying stretch by stretch along the line,
# absent on some. Every term comes from the model, never from noise:
#   foot     (this feature's attribute, FACE) the face's role at a street-level junction: 1 a WALL, a near-vertical
#            face of the feature's classes whose lowest corner reaches the walking surface in front of it (from BURY
#            under it, as the walls run under the paving, to GAP over it); 2 a FLOOR, an up-facing face lying on a
#            walking surface (tested at its first triangle's centroid, inside the face even for a ring). Only where that
#            walking surface is the street's (between STREET_MIN and STREET_LEVEL: the sidewalk, the bays' slab, the
#            pits' and pots' soil; not the road itself); ledge_dust owns the floors above
#   foot_h   (CORNER) a wall face's corner height over its own walking surface: linear in z, so it interpolates exactly
#            over the face (the framework's per-vertex ground reads a tall face's top over another surface)
#   splash   (CORNER, wall faces) the splash exposure: over a strip of pavement in front of the face (STRIP out, ALONG
#            either side, nearer points weighing more), the share of RAIN that reaches open paving (a ground point under
#            a pot or a pit gives nothing). Rain bouncing off open paving carries the grime higher up the wall
#   junction Cycles' Ambient Occlusion over a SHORT reach (REACH, ~12 cm) at render time: the distance to the junction,
#            at the junction's own scale, on both sides of it. The faces are coarse n-gons (a stone panel 0.6-1.2 m, the
#            sidewalk one 108-corner face for 39 x 15 m, every vertex in a junction), so no per-vertex or per-corner
#            value could draw a gradient centimetres wide; and the occlusion sees the composed scene, so the junctions
#            across part files (the site's sidewalk against the building's piers) come out exact. An inside corner (two
#            walls and the floor) occludes half again as much as a straight foot, so the corners collect the most
#   stretch  one seeded triple (present or not, amount, width) per plan cell (CELL, rotated by ANGLE, per storey), an
#            exact integer hash of the cell's indices (as joint_dirt's lines), blended over BLEND of a cell at its
#            borders: along any junction the crossings give stretches of irregular length (0.3-2 m), each with its own
#            amount and width, and about a quarter of them absent. The wall and the paving at one place share their
#            stretch, so the grime reads as one fillet in the junction; an inside corner keeps CORNER_KEEP of an absent
#            stretch
# Look: the surface mixed toward GRIME_RGB (a grey-brown: darker than the pale stone, a dusty rim on the charcoal pots)
# by 1 - exp(-GAIN * k), k = mask * amount * strength (it never clamps, so a strength over 1 still deepens it), and
# ROUGH more matte. On an average stretch the line of a straight foot takes 0.79 of the grime, an inside corner 0.87,
# 2 cm out 0.6, 5 cm out 0.25; the splash band adds a softer 3-6 cm up an exposed wall. AgX keeps a fraction of an
# albedo change on the pale stone, so up close it reads as a soft grey line where things meet the paving, from b8
# barely. Classes: stone (piers, jambs), paving (the sidewalk, the tree pits), joint (the joints' floors at the foot),
# planter (the entrance pots), wood_ext (the entrance lining's foot). The frames (steel) are left out: their AO would be
# evaluated on every frame of the tower; the paving along them still takes the grime.
import math

import numpy as np

NAME = "splash_zone"
LABEL = "street grime in the junctions where walls, pits and pots meet the paving, by stretches, deepest in corners"
ORDER = 100
CLASSES = ("stone", "paving", "joint", "planter", "wood_ext")
SIGNALS = ()
ATTRIBUTES = {"foot": 2.0, "foot_h": 0.3, "splash": 0.6}
DEBUG_RGB = (0.90, 0.45, 0.08)
DEFAULT_STRENGTH = 1.0

# junction faces (attributes)
STREET_MIN, STREET_LEVEL = 0.05, 1.0   # the walking surfaces between these z are the street's (not the road at 0.0)
FLOOR_NZ = 0.9                 # a floor faces up at least this much ...
FLOOR_TOL = 0.03               # ... and lies within this of the walking surface under it
WALL_NZ = 0.35                 # a wall's |normal z| stays under this
OUT, LIFT = 0.05, 0.15         # a wall's walking surface: tested this far out from its lowest corner and this far up
BURY, GAP = 0.12, 0.05         # its lowest corner from this far under the walking surface to this far over it
# splash exposure (attributes)
STRIP = ((0.12, 1.0), (0.30, 0.7), (0.55, 0.45))   # (distance out from the wall, weight)
ALONG = (-0.35, 0.0, 0.35)
RAIN = ((0.0, 1.0), (12.0, 0.8), (24.0, 0.55), (36.0, 0.3))   # (tilt from vertical deg, weight); 8 azimuths per tilt
EXPOSED_FULL = 0.55            # the exposure that counts as fully exposed (an open rounded corner reads ~0.5)
# the junction (shader)
REACH = 0.12                   # the occlusion's reach (m) at width 1: the gradient fades out about this far
AO_SAMPLES = 6
OCC = (0.07, 0.70)             # occlusion where the grime starts / is full: a straight foot reads 0.5 (0.75 of it), an
                               # inside corner 0.75 (all of it), 2 cm out from a wall 0.39, 5 cm out 0.24 (reach 0.12)
WALL_TOP = (0.08, 0.14)        # nothing on a wall above this height over its walking surface (the fade)
SPLASH_H = (0.015, 0.06)       # the splash's reach up the wall at width 1: no rain on the strip .. fully exposed
SPLASH_AMP = 0.62              # the splash band's share at the foot (the occlusion's own line is 0.76 there)
CORNER_OCC = (0.52, 0.70)      # occlusion that only an inside corner reaches
CORNER_KEEP = 0.6              # what an inside corner keeps of an absent stretch
# the stretches (shader; shared with ledge_dust)
CELL = 1.35                    # plan cell (m)
ANGLE = 27.0                   # the cells' rotation in plan (deg): no wall runs along their borders
BLEND = 0.22                   # share of a cell on each side of a border over which two cells' values blend
STOREY, Z_REF = 3.35, -1.0     # the storey index floor((z - Z_REF) / STOREY): every walking surface sits mid-storey
PRESENT = (0.22, 0.38)         # a cell's presence draw below the first: absent; above the second: present
AMOUNT = (0.55, 1.30)          # a present stretch's amount
WIDTH = (0.70, 1.35)           # its width (scales the reach and the splash's height)
SALT = 3.0
Q = ((37.0, 113.0, 71.0), (53.0, 89.0, 17.0), (97.0, 61.0, 29.0), (71.0, 43.0, 13.0), (109.0, 23.0, 7.0),
     (83.0, 31.0, 19.0))       # (a, b, c): (a n^2 + b n + c) mod 257, every step exact in float32 (n < 370)
# look
GRIME_RGB = (0.20, 0.18, 0.15)   # the street's grime (linear albedo): darker than the pale stone, lighter than the pots
GAIN = 2.2                     # the mix toward it: 1 - exp(-GAIN * mask * amount * strength)
ROUGH = 0.06


def rain_directions(rain=RAIN):
    """(directions, weights): straight down once, each tilt at 8 azimuths (fixed: rebuilds are exact)."""
    dirs, w = [], []
    for tilt, wt in rain:
        n = 1 if tilt == 0.0 else 8
        t = math.radians(tilt)
        for k in range(n):
            a = 2 * math.pi * (k + 0.5) / 8
            dirs.append((math.sin(t) * math.cos(a), math.sin(t) * math.sin(a), math.cos(t)))
            w.append(wt)
    return dirs, w


# ------------------------------------------------------------------------------------------------ junction faces
def junction_faces(ctx, ob, cls_names, street):
    """The faces of `cls_names` at a junction with a walking surface, street=True those whose surface is the street's
    (STREET_MIN..STREET_LEVEL), False those above. Returns (role per face: 0, 1 wall, 2 floor; height per corner over
    its face's walking surface, 0 off the walls; the face normals (world); the face of each loop; the loop vertices;
    the world coordinates; the walking level per face)."""
    from .. import classes
    me = ob.data
    nf, nl = len(me.polygons), len(me.loops)
    co, _ = ctx.world(ob)
    m3 = np.array(ob.matrix_world, dtype=np.float64)[:3, :3]
    fn = np.empty(nf * 3)
    me.polygons.foreach_get("normal", fn)
    fn = fn.reshape(nf, 3) @ np.linalg.inv(m3)                          # (M^-1)^T applied to row vectors
    fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
    mi = np.empty(nf, dtype=np.int64)
    me.polygons.foreach_get("material_index", mi)
    ours = np.array([m is not None and classes.classify(m)[1] in cls_names for m in me.materials] or [False])
    ours = ours[np.clip(mi, 0, len(ours) - 1)]
    total = np.empty(nf, dtype=np.int64)
    me.polygons.foreach_get("loop_total", total)
    start = np.empty(nf, dtype=np.int64)
    me.polygons.foreach_get("loop_start", start)
    lv = np.empty(nl, dtype=np.int64)
    me.loops.foreach_get("vertex_index", lv)
    lp = np.repeat(np.arange(nf), total)                                 # loops are stored polygon by polygon
    # floors: up-facing, on the walking surface under the centroid of the face's first triangle
    me.calc_loop_triangles()
    nt = len(me.loop_triangles)
    tp = np.empty(nt, dtype=np.int64)
    me.loop_triangles.foreach_get("polygon_index", tp)
    tv = np.empty(nt * 3, dtype=np.int64)
    me.loop_triangles.foreach_get("vertices", tv)
    _, first = np.unique(tp, return_index=True)
    cen = np.zeros((nf, 3))
    cen[tp[first]] = co[tv.reshape(-1, 3)[first]].mean(axis=1)
    flo = ours & (fn[:, 2] > FLOOR_NZ)
    lvl_f = np.full(nf, np.nan)
    if flo.any():
        idx = np.nonzero(flo)[0]
        lvl_f[idx] = ctx.walking_level(cen[idx])
        flo[idx] &= np.abs(cen[idx, 2] - lvl_f[idx]) < FLOOR_TOL
    # walls: near-vertical faces whose lowest corner reaches the walking surface in front of it
    wal = ours & (np.abs(fn[:, 2]) < WALL_NZ) & ~flo
    lvl_w = np.full(nf, np.nan)
    if wal.any():
        z = co[lv, 2]
        order = np.lexsort((z, lp))                                     # per face, its loops by z
        low = lv[order[start]]                                          # the lowest corner's vertex, per face
        idx = np.nonzero(wal)[0]
        hn = fn[idx, :2]
        hn = hn / np.maximum(np.linalg.norm(hn, axis=1, keepdims=True), 1e-12)
        test = co[low[idx]] + np.column_stack([hn * OUT, np.full(len(idx), LIFT)])
        lvl_w[idx] = ctx.walking_level(test)
        zl = co[low[idx], 2]
        wal[idx] &= (zl >= lvl_w[idx] - BURY) & (zl <= lvl_w[idx] + GAP)
    level = np.where(flo, lvl_f, np.where(wal, lvl_w, np.nan))
    with np.errstate(invalid="ignore"):
        here = (level > STREET_MIN) & (level < STREET_LEVEL) if street else (level >= STREET_LEVEL)
    role = np.where(here & wal, 1.0, np.where(here & flo, 2.0, 0.0)).astype(np.float32)
    h = np.where(role[lp] == 1.0, co[lv, 2] - np.nan_to_num(level)[lp], 0.0).astype(np.float32)
    return role, h, fn, lp, lv, co, level


def _splash(ctx, jobs):
    """Per wall corner of every job: the splash exposure of the pavement strip in front of its face."""
    dirs, w = rain_directions()
    keys, pts = {}, []
    for job in jobs:
        role, fn, lp, lv, co, level = job["role"], job["fn"], job["lp"], job["lv"], job["co"], job["level"]
        loops = np.nonzero(role[lp] == 1.0)[0]
        kidx = np.empty(len(loops), dtype=np.int64)
        for j, li in enumerate(loops):
            f = lp[li]
            p = co[lv[li]]
            hn = fn[f, :2] / max(np.linalg.norm(fn[f, :2]), 1e-12)
            key = (round(p[0], 3), round(p[1], 3), round(level[f], 3), round(hn[0], 2), round(hn[1], 2))
            k = keys.get(key)
            if k is None:
                k = keys[key] = len(keys)
                tx, ty = -hn[1], hn[0]
                for d, _ in STRIP:
                    for a in ALONG:
                        pts.append((p[0] + hn[0] * d + tx * a, p[1] + hn[1] * d + ty * a, level[f]))
            kidx[j] = k
        job["loops"], job["kidx"] = loops, kidx
    if not keys:
        return np.zeros(0)
    pts = np.array(pts)
    cov = ctx.covered(pts[:, :2], pts[:, 2])
    open_pts = np.nonzero(cov < 0.5)[0]
    rain = np.zeros(len(pts))
    rain[open_pts] = ctx.exposure(pts[open_pts] + np.array([0.0, 0.0, 0.02]), dirs, w)
    wts = np.array([wd for _, wd in STRIP for _ in ALONG])
    return (rain.reshape(len(keys), -1) * wts).sum(axis=1) / wts.sum()


def attributes(ctx):
    """tm_wear_foot (FACE), tm_wear_foot_h and tm_wear_splash (CORNER) on the meshes with street-level junctions."""
    jobs = []
    for ob in ctx.meshes(CLASSES):
        role, h, fn, lp, lv, co, level = junction_faces(ctx, ob, CLASSES, street=True)
        if role.any():
            jobs.append({"ob": ob, "role": role, "h": h, "fn": fn, "lp": lp, "lv": lv, "co": co, "level": level})
    if not jobs:
        return {"objects": 0}
    per_key = _splash(ctx, jobs)
    stats = []
    for job in jobs:
        ob = job["ob"]
        ctx.own_mesh(ob)
        ctx.set_attribute(ob, "foot", job["role"], 'FACE')
        ctx.set_attribute(ob, "foot_h", job["h"], 'CORNER')
        sp = np.zeros(len(job["lp"]), dtype=np.float32)
        if len(job["loops"]):
            sp[job["loops"]] = per_key[job["kidx"]]
        ctx.set_attribute(ob, "splash", sp, 'CORNER')
        r = job["role"]
        s = sp[job["loops"]] if len(job["loops"]) else np.zeros(1)
        stats.append((ob.name, int((r == 1).sum()), int((r == 2).sum()), round(float(s.mean()), 3)))
    return {"objects": len(jobs), "wall_faces": sum(s[1] for s in stats), "floor_faces": sum(s[2] for s in stats),
            "splash_mean": round(float(per_key.mean()), 3) if len(per_key) else 0.0,
            "per_object (walls, floors, splash mean)": stats}


# ------------------------------------------------------------------------------------------------ shader
def _q(b, n, abc):
    a, bb, c = abc
    return b.math('FLOORED_MODULO', b.add(b.add(b.mul(a, b.mul(n, n)), b.mul(bb, n)), c), 257.0)


def _cell(b, i, j, k, salt):
    """(presence, amount, width) draws in [0, 1) of plan cell (i, j) on storey k: an exact integer hash chain."""
    h = _q(b, _q(b, b.add(_q(b, i, Q[0]), j), Q[1]), Q[2])
    h = _q(b, b.add(h, b.add(b.mul(7.0, k), salt)), Q[3])
    return [b.div(_q(b, b.add(h, s), q), 257.0) for s, q in ((11.0, Q[4]), (101.0, Q[5]), (47.0, Q[0]))]


def stretch(b, salt=SALT, present=PRESENT, amount=AMOUNT, width=WIDTH):
    """(presence, amount, width) of the junction stretch at the shading point: one seeded triple per plan cell (CELL,
    rotated ANGLE, per storey), the four nearest cells blended bilinearly over BLEND at their borders."""
    x, y, z = b.xyz(b.geometry('Position'))
    ca, sa = math.cos(math.radians(ANGLE)), math.sin(math.radians(ANGLE))
    u = b.sub(b.div(b.add(b.mul(x, ca), b.mul(y, sa)), CELL), 0.5)    # cell centres at integer + 0.5
    v = b.sub(b.div(b.sub(b.mul(y, ca), b.mul(x, sa)), CELL), 0.5)
    k = b.math('FLOOR', b.div(b.sub(z, Z_REF), STOREY))
    i0, j0 = b.math('FLOOR', u), b.math('FLOOR', v)
    wu = b.smooth(0.5 - BLEND, 0.5 + BLEND, b.sub(u, i0))
    wv = b.smooth(0.5 - BLEND, 0.5 + BLEND, b.sub(v, j0))
    i1, j1 = b.add(i0, 1.0), b.add(j0, 1.0)
    c00, c10, c01, c11 = (_cell(b, i, j, k, salt) for i, j in ((i0, j0), (i1, j0), (i0, j1), (i1, j1)))
    out = []
    for n in range(3):
        out.append(b.mix(b.mix(c00[n], c10[n], wu), b.mix(c01[n], c11[n], wu), wv))
    pres = b.smooth(present[0], present[1], out[0])
    amt = b.add(amount[0], b.mul(amount[1] - amount[0], out[1]))
    wid = b.add(width[0], b.mul(width[1] - width[0], out[2]))
    return pres, amt, wid


def shader(b, ins):
    role = b.signal("foot")
    wall, floor = b.eq(role, 1.0, 0.25), b.eq(role, 2.0, 0.25)
    h = b.signal("foot_h")
    pres, amt, wid = stretch(b)
    occ = b.one_minus(b.ao(b.mul(REACH, wid), AO_SAMPLES))
    prof = b.smooth(OCC[0], OCC[1], occ)
    # the wall: the occlusion's band, and the splash's reach where the strip in front takes rain, cut off above WALL_TOP
    e = b.clamp(b.div(b.signal("splash"), EXPOSED_FULL))
    top = b.mul(b.add(SPLASH_H[0], b.mul(SPLASH_H[1] - SPLASH_H[0], e)), wid)
    band = b.mul(SPLASH_AMP, b.one_minus(b.map(h, 0.0, top, 0.0, 1.0, 'SMOOTHSTEP')))
    wall_m = b.mul(b.mx(prof, band), b.one_minus(b.smooth(WALL_TOP[0], WALL_TOP[1], h)))
    m = b.add(b.mul(wall, wall_m), b.mul(floor, prof))
    keep = b.mx(pres, b.mul(CORNER_KEEP, b.smooth(CORNER_OCC[0], CORNER_OCC[1], occ)))
    m = b.mul(b.mul(m, keep), b.is_class(*CLASSES))
    k = b.mul(b.mul(m, amt), ins["Strength"])
    col = b.mix(ins["Color"], GRIME_RGB, b.one_minus(b.math('EXPONENT', b.mul(-GAIN, k))), 'RGBA')
    return {"Color": col, "Roughness": b.add(ins["Roughness"], b.mul(ROUGH, k)), "Mask": m}
