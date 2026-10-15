# cavity_soot -- soot and dust in the building's inside corners and junctions (2026-10-14).
#
# Airborne soot and street dust settle where the air stalls: in the inside corners where two surfaces meet. On a
# limestone tower a few years old that is a soft grey deepening along the junctions: the soffits meeting the glazing
# heads, the columns and the pilasters, the inner corners of the loggias' wood reveals, the podium's piers meeting the
# storefront heads, the foot of the walls on the terraces, the paving round a planter's base, while the open faces
# around them stay clean. It comes from the GEOMETRY, never from noise:
#   occlusion  Cycles' Ambient Occlusion node at render time over REACH metres (inside off, the whole scene). Only a
#              point inside a concave junction is occluded that much, and only the occlusion above OCC[0] counts (full
#              at OCC[1]), so a thin rail, a chair leg or a leaf near a wall leaves nothing and an open face nothing at
#              all. A baked per-vertex occlusion was not an option: the faces are large n-gons (stone panels 0.6-1.2 m,
#              a terrace's paving one ring-shaped face) whose vertices all sit IN the junctions, so a vertex value
#              could only draw metre-wide gradients or none; the node draws the band at the junction's own width.
#              Cost, measured interleaved off / on (2026-10-14): +3-5 % on the GPU (OptiX, b8 13.3 -> 13.8 s, a
#              close-up 21.4 -> 22.6 s, plus ~4 s once per session for the ray-tracing kernels), +7 % on the CPU; at
#              strength 0 Cycles folds the node away (the render is bit for bit the one without the feature).
#   shelter    this feature's attribute soot_shelter (FACE CORNER): how little rain reaches the air of the junction a
#              face corner sits in. From each corner of a face of the feature's classes, the point SHELTER_OUT out
#              along that face's normal (LIFT up, off the floor), the weighted share of RAIN directions (vertical to
#              36 deg, every azimuth) blocked by the ray scene. A sheltered corner (under a soffit, in a loggia, a
#              reveal under its head) keeps all of the soot, a rinsed one (a terrace wall's foot under the open sky)
#              RINSED_SHARE of it. The framework's per-vertex sky signal cannot say this: a junction vertex's own
#              averaged normal points into the junction, so it reads sheltered everywhere.
#   per stone  each stone panel (signal panel, seeded per panel) takes it within +-PANEL_VAR/2: stones absorb
#              differently, so the same junction differs panel to panel without any pattern.
# Look, at strength 1 in a full, sheltered corner: DARKEN darker, DESAT toward the surface's own grey with a touch of
# the street's dust (TINT), ROUGH more matte. b8 shows a new, pale building, so it is light: up close the corners read a
# touch deeper and greyer, never outlined; from the b8 camera it is barely there. Classes: stone, soffit, paving (the
# floor at a wall's foot, round a planter), wood_ext (the teak reveals' inner corners).
import math

import numpy as np

from .. import classes

NAME = "cavity_soot"
LABEL = "soot and dust in the inside corners and junctions, from the geometry's own occlusion, less where rain rinses"
ORDER = 120
CLASSES = ("stone", "soffit", "paving", "wood_ext")
SIGNALS = ("panel",)
ATTRIBUTES = {"soot_shelter": 1.0}
DEBUG_RGB = (0.55, 0.22, 0.85)
DEFAULT_STRENGTH = 1.0

REACH = 0.30                   # the occlusion's reach (m): a junction's band is about this wide
AO_SAMPLES = 4                 # rays per shading point (the camera samples average them; the denoiser does the rest)
OCC = (0.08, 0.42)             # occlusion (1 - AO) where the soot starts / is full (an open 90 deg corner reads ~0.5)
SHELTER = (0.30, 0.80)         # shelter below the first: fully rinsed; above the second: fully sheltered
RINSED_SHARE = 0.40            # a fully rinsed corner keeps this share
PANEL_VAR = 0.30
DARKEN = 0.18
DESAT = 0.30
TINT = (1.0, 0.97, 0.92)       # a touch warm: the street's dust in the soot
ROUGH = 0.06
SHELTER_OUT = 0.25             # a corner's junction air: this far out along the face normal ...
LIFT = 0.15                    # ... and this far up unless the face looks down (clear of the floor: a wall runs
                               # 5 cm under the paving that abuts it)
RAIN = ((0.0, 1.0), (12.0, 0.8), (24.0, 0.55), (36.0, 0.3))   # (tilt from vertical deg, weight); 8 azimuths per tilt


def rain_directions():
    dirs, w = [], []
    for tilt, wt in RAIN:
        n = 1 if tilt == 0.0 else 8
        t = math.radians(tilt)
        for k in range(n):
            a = 2 * math.pi * (k + 0.5) / n
            dirs.append((math.sin(t) * math.cos(a), math.sin(t) * math.sin(a), math.cos(t)))
            w.append(wt)
    return dirs, w


def attributes(ctx):
    """tm_wear_soot_shelter (FACE CORNER) on the faces of the feature's classes (0 on the mesh's other faces)."""
    dirs, w = rain_directions()
    keys, origins, jobs = {}, [], []
    for ob in ctx.meshes(CLASSES):
        me = ob.data
        ours = np.array([m is not None and classes.classify(m)[1] in CLASSES for m in me.materials] or [False])
        npoly, nloop = len(me.polygons), len(me.loops)
        if not npoly:
            continue
        mi = np.empty(npoly, dtype=np.int64)
        me.polygons.foreach_get("material_index", mi)
        sel_poly = ours[np.clip(mi, 0, len(ours) - 1)]
        if not sel_poly.any():
            continue
        co, _ = ctx.world(ob)
        mw = np.array(ob.matrix_world, dtype=np.float64)
        fn = np.empty(npoly * 3)
        me.polygons.foreach_get("normal", fn)
        fn = fn.reshape(npoly, 3) @ np.linalg.inv(mw[:3, :3])
        fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
        total = np.empty(npoly, dtype=np.int64)
        me.polygons.foreach_get("loop_total", total)
        lv = np.empty(nloop, dtype=np.int64)
        me.loops.foreach_get("vertex_index", lv)
        lp = np.repeat(np.arange(npoly), total)                  # loops are stored polygon by polygon
        lsel = np.nonzero(sel_poly[lp])[0]
        n = fn[lp[lsel]]
        o = co[lv[lsel]] + n * SHELTER_OUT
        o[:, 2] += np.where(n[:, 2] > -0.5, LIFT, 0.0)
        idx = np.empty(len(lsel), dtype=np.int64)
        for j, (p, q) in enumerate(zip(np.round(o, 3), np.round(n, 2))):
            key = (*p, *q)
            k = keys.get(key)
            if k is None:
                k = keys[key] = len(origins)
                origins.append(o[j])
            idx[j] = k
        jobs.append((ob, nloop, lsel, idx))
    if not origins:
        return {"corners": 0}
    shelter = 1.0 - ctx.exposure(np.array(origins), dirs, w)
    stats, written = [], 0
    for ob, nloop, lsel, idx in jobs:
        vals = np.zeros(nloop, dtype=np.float32)
        vals[lsel] = shelter[idx]
        ctx.own_mesh(ob)
        ctx.set_attribute(ob, "soot_shelter", vals, 'CORNER')
        written += len(lsel)
        v = vals[lsel]
        stats.append((ob.name, round(float(v.min()), 2), round(float(v.mean()), 2), round(float(v.max()), 2)))
    return {"corners": written, "origins": len(origins),
            "shelter_min_mean_max": [round(float(f(shelter)), 3) for f in (np.min, np.mean, np.max)],
            "objects": len(stats)}


def shader(b, ins):
    ao = b.node('ShaderNodeAmbientOcclusion', samples=AO_SAMPLES, inside=False, only_local=False)
    b.set(ao.inputs['Color'], (1.0, 1.0, 1.0, 1.0))
    b.set(ao.inputs['Distance'], REACH)
    cav = b.smooth(OCC[0], OCC[1], b.one_minus(ao.outputs['AO']))
    expo = b.add(RINSED_SHARE, b.mul(1.0 - RINSED_SHARE, b.smooth(SHELTER[0], SHELTER[1], b.signal("soot_shelter"))))
    var = b.add(1.0 - PANEL_VAR / 2, b.mul(PANEL_VAR, b.signal("panel")))
    m = b.mul(b.mul(cav, expo), b.is_class(*CLASSES))
    k = b.mul(b.mul(m, var), ins["Strength"])
    col = b.desaturate(ins["Color"], b.mul(DESAT, k))
    col = b.mix(col, b.tint(col, TINT), k, 'RGBA')
    col = b.scale_rgb(col, b.one_minus(b.mul(DARKEN, k)))
    return {"Color": col, "Roughness": b.add(ins["Roughness"], b.mul(ROUGH, k)), "Mask": m}
