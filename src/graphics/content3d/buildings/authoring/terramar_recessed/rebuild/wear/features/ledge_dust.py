# ledge_dust -- the fine dust that drifts into the edges and inside corners of the sheltered floors (2026-10-14,
# reworked the same day: edges, not surfaces).
#
# The first version greyed every up-facing floor and ledge it found sheltered; the user rejected whole-surface wear: it
# read as a change of the paving's colour, not as dust. Dust blown over a balcony or a terrace settles where the air
# stops: along the foot of the window wall and the pilasters, against the guard shoes and the pots, packed deepest into
# the inside corners, while the open floor between stays clean. So the feature now lives only in those junctions, on
# the floors above the street (splash_zone owns the street's), and only where rain does not wash it out. From the model,
# never from noise:
#   edge     (this feature's attribute, FACE) the face's role at a junction with a walking surface above the street
#            (the entrance top, the podium terrace, the balconies, the roof deck): 1 a WALL whose lowest corner reaches
#            it, 2 a FLOOR lying on it (splash_zone.junction_faces, the same test)
#   edge_h   (CORNER) a wall face's corner height over its walking surface (exact over the face)
#   edge_rain (CORNER, on those faces) how much rain reaches the junction: the weighted share of RAIN (vertical to 36
#            deg, every azimuth) escaping the ray scene from each corner's sample point (signals.corner_origins: 5 cm in
#            from the corner, 2 cm off the face), over the share an unobstructed face of that orientation gets. The
#            corners of these coarse faces all sit in the junctions, so the value is the junctions' own: about 0.05 on
#            the balconies under the slab above, 0.6-1 on the open roof deck. A sheltered junction keeps all its dust,
#            a rinsed one EXPOSED of it
#   junction Cycles' Ambient Occlusion over a short reach (REACH, ~22 cm: dust drifts wider than the street's grime) at
#            render time, the distance to the junction on both sides of it (see splash_zone: the faces are coarse
#            n-gons, and the pots standing on the building's floors are another part's). The floor's response is
#            concentrated in the inside corners (OCC: a straight foot reaches 0.75 of it, a corner all of it); the wall
#            keeps WALL_SHARE of it and only its first centimetres (WALL_TOP). The glazing's panes cast transparent
#            shadows, so the occlusion sees only their frames' sills: the dust along a window's foot stays thin
#   stretch  splash_zone.stretch: one seeded triple (present, amount, width) per rotated plan cell and storey, so every
#            junction varies stretch by stretch and some stretches stay clean; an inside corner keeps CORNER_KEEP
# Look: the surface mixed toward DUST_RGB (a mid grey, darker than the pale limestone and the paving, lighter than the
# charcoal planters) by 1 - exp(-GAIN * k), k = mask (rinse included) * amount * strength (it never clamps), and toward
# MATTE roughness. On an average sheltered stretch the line of a straight foot takes 0.83 of the dust, an inside corner
# 0.9, 5 cm out about 0.65, 10 cm out 0.25; AgX keeps a fraction of it on the pale paving, so it reads as a soft grey
# drift in the junction while the open floor stays as it was. Classes: paving (the balcony, terrace and roof paving,
# the slab-top lips, the thresholds), stone (the pilasters', columns' and penthouse walls' feet), joint, planter (pots
# and planters), concrete (the exposed roof slab tops). The guard shoes and frames (steel) are left out (their AO would
# be evaluated on every frame); the floor along them takes the dust.
import numpy as np

from . import splash_zone as J

NAME = "ledge_dust"
LABEL = "fine dust drifted into the edges and inside corners of the sheltered floors above the street, by stretches"
ORDER = 110
CLASSES = ("stone", "paving", "joint", "planter", "concrete")
SIGNALS = ()
ATTRIBUTES = {"edge": 2.0, "edge_h": 0.3, "edge_rain": 1.0}
DEBUG_RGB = (0.20, 0.70, 0.95)
DEFAULT_STRENGTH = 1.0

RAIN = ((0.0, 1.0), (12.0, 0.8), (24.0, 0.55), (36.0, 0.3))   # (tilt from vertical deg, weight); 8 azimuths per tilt
RAIN_LIFT = 0.01               # the rain's origins this far above the corner sample point (clear of a floor's texture)
RINSE = (0.25, 0.75)           # edge_rain where the rinse starts / is complete
EXPOSED = 0.45                 # the share of the dust a fully rinsed junction keeps
REACH = 0.22                   # the occlusion's reach (m) at width 1
AO_SAMPLES = 6
OCC = (0.08, 0.70)             # occlusion where the dust starts / is full (straight foot 0.5, inside corner 0.75)
WALL_SHARE = 0.40              # a wall's foot keeps this share (dust lies on the floor; the wall takes a thin line)
WALL_TOP = (0.03, 0.08)        # and only below these heights over its walking surface (the fade)
CORNER_OCC = (0.52, 0.70)
CORNER_KEEP = 0.7
SALT = 17.0                    # the stretch draws differ from splash_zone's
PRESENT = (0.20, 0.36)
AMOUNT_RANGE = (0.55, 1.25)
WIDTH = (0.75, 1.40)
GAIN = 2.6                     # the mix toward the dust colour: 1 - exp(-GAIN * mask * amount * strength)
DUST_RGB = (0.22, 0.205, 0.185)  # the dust packed in a junction (linear albedo): a mid grey, darker than the pale stone
MATTE = 0.92                   # the dust's roughness
ROUGH_SHARE = 0.6              # the roughness moves this share of the colour's mix toward MATTE


def _rain(ctx, jobs):
    """Per corner of the role faces of every job: rain reaching the junction over an open face's share."""
    from .. import signals
    dirs, w = J.rain_directions(RAIN)
    darr, warr = np.asarray(dirs), np.asarray(w)
    keys, origins = {}, []
    for job in jobs:
        ob, role, lp = job["ob"], job["role"], job["lp"]
        org, nrm = signals.corner_origins(ctx, ob)
        loops = np.nonzero(role[lp] > 0.0)[0]
        o = org[loops] + np.array([0.0, 0.0, RAIN_LIFT])
        n = nrm[loops]
        kidx = np.empty(len(loops), dtype=np.int64)
        opens = np.empty(len(loops))
        for j, (p, q) in enumerate(zip(np.round(o, 3), np.round(n, 2))):
            key = (*p, *q)
            k = keys.get(key)
            if k is None:
                k = keys[key] = len(origins)
                origins.append(o[j])
            kidx[j] = k
            opens[j] = warr[darr @ q >= -1e-6].sum() / warr.sum()
        job["loops"], job["kidx"], job["open"] = loops, kidx, opens
    if not origins:
        return np.zeros(0)
    return ctx.exposure(np.array(origins), dirs, w)


def attributes(ctx):
    """tm_wear_edge (FACE), tm_wear_edge_h and tm_wear_edge_rain (CORNER) on the meshes with junctions above the
    street."""
    jobs = []
    for ob in ctx.meshes(CLASSES):
        role, h, fn, lp, lv, co, level = J.junction_faces(ctx, ob, CLASSES, street=False)
        if role.any():
            jobs.append({"ob": ob, "role": role, "h": h, "lp": lp})
    if not jobs:
        return {"objects": 0}
    expo = _rain(ctx, jobs)
    stats = []
    for job in jobs:
        ob = job["ob"]
        ctx.own_mesh(ob)
        ctx.set_attribute(ob, "edge", job["role"], 'FACE')
        ctx.set_attribute(ob, "edge_h", job["h"], 'CORNER')
        rain = np.zeros(len(job["lp"]), dtype=np.float32)
        rain[job["loops"]] = np.clip(expo[job["kidx"]] / np.maximum(job["open"], 1e-6), 0.0, 1.0)
        ctx.set_attribute(ob, "edge_rain", rain, 'CORNER')
        r = job["role"]
        s = rain[job["loops"]]
        stats.append((ob.name, int((r == 1).sum()), int((r == 2).sum()), round(float(s.min()), 2),
                      round(float(s.mean()), 2), round(float(s.max()), 2)))
    return {"objects": len(jobs), "wall_faces": sum(s[1] for s in stats), "floor_faces": sum(s[2] for s in stats),
            "rain_origins": len(expo), "per_object (walls, floors, rain min/mean/max)": stats}


def shader(b, ins):
    role = b.signal("edge")
    wall, floor = b.eq(role, 1.0, 0.25), b.eq(role, 2.0, 0.25)
    h = b.signal("edge_h")
    pres, amt, wid = J.stretch(b, salt=SALT, present=PRESENT, amount=AMOUNT_RANGE, width=WIDTH)
    occ = b.one_minus(b.ao(b.mul(REACH, wid), AO_SAMPLES))
    prof = b.smooth(OCC[0], OCC[1], occ)
    wall_m = b.mul(b.mul(WALL_SHARE, prof), b.one_minus(b.smooth(WALL_TOP[0], WALL_TOP[1], h)))
    m = b.add(b.mul(wall, wall_m), b.mul(floor, prof))
    film = b.sub(1.0, b.mul(1.0 - EXPOSED, b.smooth(RINSE[0], RINSE[1], b.signal("edge_rain"))))
    keep = b.mx(pres, b.mul(CORNER_KEEP, b.smooth(CORNER_OCC[0], CORNER_OCC[1], occ)))
    m = b.mul(b.mul(b.mul(m, keep), film), b.is_class(*CLASSES))
    k = b.mul(b.mul(m, amt), ins["Strength"])
    f = b.one_minus(b.math('EXPONENT', b.mul(-GAIN, k)))
    col = b.mix(ins["Color"], DUST_RGB, f, 'RGBA')
    rough = b.mix(ins["Roughness"], MATTE, b.mul(ROUGH_SHARE, f))
    return {"Color": col, "Roughness": rough, "Mask": m}
