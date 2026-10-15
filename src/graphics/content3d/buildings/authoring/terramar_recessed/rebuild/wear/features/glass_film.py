# glass_film -- the grime margin along the panes' edges, where water and dust dry against the frame (the wear module,
# 2026-10-14; reworked the same day to act at the edges only: the user rejected wear over whole surfaces).
#
# Rain and the night's dew run down a pane and stop at the gasket of the frame below it. The water dries there and
# leaves its dust in a thin margin along the bottom edge: densest right at the gasket and in the two bottom corners,
# where the water from the sides gathers, and gone a few centimetres up. The side edges against the jambs take a fainter
# margin, strongest low down; the top edge under the head takes none. The pane's field stays clear. The first version
# (one even film per pane) changed whole panes, which "has no value" (the user, 2026-10-14).
# The margin darkens and dulls the glass, it never lightens it: a diffuse dust veil reads as the "whitening" the user
# rejected on the Bradbury (2026-09-23), so the dirt here only takes light away (a darker, warmer transmission, a weaker
# reflection). Where and how much comes from the model, never from noise:
#   pane     each glass island of a mesh is one pane (the boxes the layers build: a slider, a fixed light, a storefront
#            light, a guard panel, the bent panels on the rounded corners). Its two broad sides carry the margin: the
#            vertical faces joined by folds under FOLD_DEG (the thin end faces meet them at 90 degrees)
#   frame    the margin is measured in the pane's own surface, per face corner (the attributes below): the height over
#            the pane's lowest point (its bottom edge on the sill, the transom or the guard shoe) and the distance along
#            the pane, around the bend of a bent panel, to each of its two vertical edges. These are linear over every
#            face, so the corner values interpolate exactly and the shader draws the profiles at any distance
#   per pane how long since it was cleaned: a share CLEAN_SHARE of the panes were cleaned lately and keep CLEAN_TRACE,
#            the others AGE (the mean of two seeded uniforms). Each margin has its own spread (SPREAD_BOTTOM,
#            SPREAD_SIDE: one side of a pane wider than the other). All are seeded on the object and the pane's rounded
#            world corner
#   street   street-level glass gathers more of the traffic's grit and splash: up to STREET_EXTRA more and a bottom
#            margin up to STREET_WIDEN wider, both fading out by STREET_FADE[1] m up
#   shelter  a pane the rain rarely reaches dries more dust against its frame than a rinsed one. Its exposure is the
#            weighted share of the RAIN directions (vertical to 45 degrees) leaving the ray scene from RINSE_OUT in
#            front of the pane's centre (its more open side); it takes the amount from KEEP[0] (sheltered) to KEEP[1]
#            (open)
#   free     a guard panel's vertical edges are free glass, with no jamb to dry against: SIDE_FREE of the side margin
# This feature's attributes:
#   pane_grime   FACE    clean * street * shelter on the broad faces of the panes, 0 elsewhere (also the presence flag)
#   pane_bottom  CORNER  the height (m) over the pane's bottom edge, divided by the pane's bottom spread
#   pane_left    CORNER  the distance (m) along the pane to its first vertical edge, divided by that side's spread
#   pane_right   CORNER  ... to its other vertical edge
# The shader, with k = pane_grime * Strength and b, s the bottom and the nearer side distance:
#   bottom   1 - smoothstep(0, BOTTOM_W * widen, b), widen = 1 + CORNER_WIDEN * exp(-s / NEAR_CORNER): the margin grows
#            toward the corners
#   sides    SIDE * (1 - smoothstep(0, SIDE_W, s)) * (SIDE_LOW + (1 - SIDE_LOW) * exp(-b / SIDE_FADE)): faint,
#            strongest low down
#   corners  CORNER * (1 - smoothstep(0, CORNER_W, |(b, s)|)): the bottom corners' gathering
#   look     g = the three screened. The transmission DARK * g * k darker and DUST_TINT warmer, the specular level
#            SPEC * g * k lower, roughness + ROUGH * g * k (a touch only: more spreads the bright sky's reflection into
#            a pale haze). Each is capped, so no strength paints an opaque or a pale band.
# Shadow rays keep the clear transparent path of layer_materials.dress_glass (the layer sits before the glass's
# Principled only).
import math

import numpy as np

from .. import classes

NAME = "glass_film"
LABEL = "grime margin along the panes' bottom and side edges against the frame, densest in the bottom corners"
ORDER = 300
CLASSES = ("glass_ext",)
SIGNALS = ()
ATTRIBUTES = {"pane_grime": 1.5, "pane_bottom": 0.1, "pane_left": 0.1, "pane_right": 0.1}
DEBUG_RGB = (0.10, 0.75, 0.85)
DEFAULT_STRENGTH = 1.0

SEED = "glass_film_edges"
FOLD_DEG = 60.0                # broad faces of one pane side meet at folds under this (the bent panels: 2-4 deg)
CLEAN_SHARE = 0.22             # this share of the panes were cleaned lately ...
CLEAN_TRACE = (0.10, 0.30)     # ... and keep this much
AGE = (0.65, 1.30)             # the others: their grime since the last cleaning (mean of two seeded uniforms)
SPREAD_BOTTOM = (0.70, 1.45)   # each pane's bottom margin spread (its distances are divided by it)
SPREAD_SIDE = (0.60, 1.40)     # ... and each side's, drawn separately
STREET_EXTRA = 0.25            # at the street: this much more grime ...
STREET_WIDEN = 0.50            # ... and a bottom margin this much wider ...
STREET_FADE = (2.0, 12.0)      # ... fading over this band of pane-centre heights above the street (m, smoothstep)
RINSE_OUT = 0.15               # the rain is sampled this far in front of the pane's centre (clear of its frame bars)
RAIN = ((0.0, 1.0), (15.0, 0.85), (30.0, 0.6), (45.0, 0.35))   # (tilt from vertical deg, weight); 8 azimuths each
RINSE_OPEN = (0.04, 0.45)      # the rain exposure from sheltered to open (smoothstep) ...
KEEP = (1.25, 0.85)            # ... takes the amount from this share to this
GRIME_MAX = 1.5
SIDE_FREE = 0.35               # a guard panel's free vertical edges: this share of a jamb's side margin
FAR = 9.0                      # the stored distance where a face has no pane frame (it carries no grime anyway)

BOTTOM_W = 0.028               # the bottom margin falls from full at the gasket to nothing over this (m, smoothstep)
CORNER_WIDEN = 0.8             # ... up to this much wider toward a corner ...
NEAR_CORNER = 0.06             # ... within about this of it (m, e-fold)
CORNER_W = 0.045               # the corners' own gathering: gone this far from the corner (m, smoothstep)
CORNER = 0.70                  # its peak
SIDE = 0.55                    # the side margins' peak (of the bottom's)
SIDE_W = 0.008                 # their width (m, smoothstep)
SIDE_LOW = 0.30                # high up a side keeps this share ...
SIDE_FADE = 0.45               # ... of its margin at the bottom, with this e-fold (m) up the side
DARK = 0.75                    # per unit of grime at strength 1: the transmission this much darker ...
DARK_MAX = 0.85
DUST_TINT = (1.0, 0.94, 0.84)  # ... and this much warmer at full (street dust and salt are a warm grey)
SPEC = 0.80                    # the specular level this much lower (the dirt is matt)
SPEC_MAX = 0.90
ROUGH = 0.03                   # roughness up (the glass's own is 0.02)
ROUGH_MAX = 0.06


def smooth(e0, e1, x):
    t = np.clip((np.asarray(x, dtype=np.float64) - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def rain_directions():
    dirs, w = [], []
    for tilt, wt in RAIN:
        if tilt == 0.0:
            dirs.append((0.0, 0.0, 1.0))
            w.append(wt)
            continue
        t = math.radians(tilt)
        for k in range(8):
            a = 2 * math.pi * (k + 0.5) / 8
            dirs.append((math.sin(t) * math.cos(a), math.sin(t) * math.sin(a), math.cos(t)))
            w.append(wt)
    return dirs, w


def key(co):
    """A stable key for a pane: its rounded world corner, as plain floats (no -0.0)."""
    return tuple(round(float(x), 2) + 0.0 for x in co)


def mid(bounds, u, v):
    return bounds[0] + (bounds[1] - bounds[0]) * 0.5 * (u + v)


def islands(me, glass):
    """The glass islands of a mesh: [[face indices]], connected through shared vertices."""
    parent = {}

    def find(i):
        while parent.setdefault(i, i) != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    faces = [p for p in me.polygons if p.material_index in glass]
    for p in faces:
        vs = list(p.vertices)
        for v in vs[1:]:
            a, b = find(vs[0]), find(v)
            if a != b:
                parent[a] = b
    groups = {}
    for p in faces:
        groups.setdefault(find(p.vertices[0]), []).append(p.index)
    return list(groups.values())


def broad_sides(me, fs, fn, area):
    """The pane's two broad sides: [[face indices]] of its vertical faces joined across folds under FOLD_DEG (a bent
    panel's segments), the two largest groups by area (the thin end faces meet them at 90 degrees)."""
    vert = [f for f in fs if abs(fn[f][2]) < 0.3]
    by_edge = {}
    for f in vert:
        for ek in me.polygons[f].edge_keys:
            by_edge.setdefault(ek, []).append(f)
    parent = {f: f for f in vert}

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    cos_fold = math.cos(math.radians(FOLD_DEG))
    for fl in by_edge.values():
        for i in range(len(fl)):
            for j in range(i + 1, len(fl)):
                if float(fn[fl[i]] @ fn[fl[j]]) > cos_fold:
                    a, b = find(fl[i]), find(fl[j])
                    if a != b:
                        parent[a] = b
    groups = {}
    for f in vert:
        groups.setdefault(find(f), []).append(f)
    return sorted(groups.values(), key=lambda g: -sum(area[f] for f in g))[:2]


def along(me, side, co, zb):
    """Distance along a broad side, per vertex: the arc length from one vertical edge, walked along its bottom boundary
    (a bent panel's segments in turn); a top vertex takes the bottom vertex under it. Returns ({vertex: u}, length), or
    (None, 0) for a side that is not a vertical band."""
    bottom = {v for f in side for v in me.polygons[f].vertices if co[v][2] < zb + 0.002}
    nbr = {v: set() for v in bottom}
    for f in side:
        for a, b in me.polygons[f].edge_keys:
            if a in bottom and b in bottom:
                nbr[a].add(b)
                nbr[b].add(a)
    ends = sorted((v for v in bottom if len(nbr[v]) <= 1), key=lambda v: key(co[v]))
    if not ends:
        return None, 0.0
    u, prev, cur, acc = {ends[0]: 0.0}, None, ends[0], 0.0
    while True:
        nxt = [w for w in nbr[cur] if w != prev and w not in u]
        if not nxt:
            break
        acc += float(np.linalg.norm(co[nxt[0]][:2] - co[cur][:2]))
        u[nxt[0]] = acc
        prev, cur = cur, nxt[0]
    xy = {(round(float(co[v][0]), 4), round(float(co[v][1]), 4)): val for v, val in u.items()}
    out = {}
    for f in side:
        for v in me.polygons[f].vertices:
            val = xy.get((round(float(co[v][0]), 4), round(float(co[v][1]), 4)))
            if val is None:
                return None, 0.0
            out[v] = val
    return out, acc


def attributes(ctx):
    """tm_wear_pane_grime (FACE) and tm_wear_pane_bottom / _left / _right (CORNER) on the glass meshes."""
    dirs, w = rain_directions()
    street_z = ctx.plan["levels_m"]["street"]
    stats, amounts, n_panes, n_skipped = [], [], 0, 0
    for ob in ctx.meshes(CLASSES):
        me = ob.data
        glass = {i for i, m in enumerate(me.materials) if m is not None and classes.classify(m)[1] in CLASSES}
        groups = islands(me, glass)
        if not groups:
            continue
        co, _ = ctx.world(ob)
        mw = np.array(ob.matrix_world, dtype=np.float64)
        nf = len(me.polygons)
        fn = np.empty(nf * 3)
        me.polygons.foreach_get("normal", fn)
        fn = fn.reshape(nf, 3) @ np.linalg.inv(mw[:3, :3])                 # (M^-1)^T applied to row vectors
        fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
        area = np.empty(nf)
        me.polygons.foreach_get("area", area)
        free_sides = ob.get("rb_element") == "guard"
        panes = []
        for fs in groups:
            vids = sorted({v for f in fs for v in me.polygons[f].vertices})
            zb = float(co[vids, 2].min())
            sides = broad_sides(me, fs, fn, area)
            maps = [(s,) + along(me, s, co, zb) for s in sides]
            if len(maps) < 2 or any(m[1] is None for m in maps):
                n_skipped += 1
                continue
            big = max(sides[0], key=lambda f: area[f])
            panes.append((maps, co[vids].min(axis=0), co[vids].mean(axis=0), fn[big], zb))
        if not panes:
            continue
        centres = np.array([p[2] for p in panes])
        normals = np.array([p[3] for p in panes])
        both = np.concatenate([centres + normals * RINSE_OUT, centres - normals * RINSE_OUT])
        rain = ctx.exposure(both, dirs, w)
        rain = np.maximum(rain[:len(panes)], rain[len(panes):])
        low = 1.0 - smooth(*STREET_FADE, centres[:, 2] - street_z)        # 1 at the street, 0 from STREET_FADE[1] up
        keep = KEEP[0] + (KEEP[1] - KEEP[0]) * smooth(*RINSE_OPEN, rain)
        ctx.own_mesh(ob)
        me = ob.data
        nl = len(me.loops)
        grime = np.zeros(nf, dtype=np.float32)
        bottom, left, right = (np.full(nl, FAR, dtype=np.float32) for _ in range(3))
        lv = np.empty(nl, dtype=np.int64)
        me.loops.foreach_get("vertex_index", lv)
        amount = np.zeros(len(panes))
        for i, (maps, lo, _, _, zb) in enumerate(panes):
            pk = key(lo)
            sd = lambda *k: ctx.seed(SEED, ob.name, pk, *k)  # noqa: E731
            if sd("clean") < CLEAN_SHARE:
                age = CLEAN_TRACE[0] + (CLEAN_TRACE[1] - CLEAN_TRACE[0]) * sd("trace")
            else:
                age = mid(AGE, sd("age"), sd("age2"))
            amount[i] = min(age * (1.0 + STREET_EXTRA * low[i]) * keep[i], GRIME_MAX)
            sb = SPREAD_BOTTOM[0] + (SPREAD_BOTTOM[1] - SPREAD_BOTTOM[0]) * sd("spread_b")
            sb *= 1.0 + STREET_WIDEN * low[i]
            sl, sr = (SPREAD_SIDE[0] + (SPREAD_SIDE[1] - SPREAD_SIDE[0]) * sd(k) for k in ("spread_l", "spread_r"))
            if free_sides:
                sl, sr = sl * SIDE_FREE, sr * SIDE_FREE
            for side, umap, length in maps:
                for f in side:
                    p = me.polygons[f]
                    grime[f] = amount[i]
                    for li in range(p.loop_start, p.loop_start + p.loop_total):
                        v = lv[li]
                        bottom[li] = (co[v][2] - zb) / sb
                        left[li] = umap[v] / sl
                        right[li] = (length - umap[v]) / sr
        ctx.set_attribute(ob, "pane_grime", grime, 'FACE')
        ctx.set_attribute(ob, "pane_bottom", bottom, 'CORNER')
        ctx.set_attribute(ob, "pane_left", left, 'CORNER')
        ctx.set_attribute(ob, "pane_right", right, 'CORNER')
        n_panes += len(panes)
        amounts.append(amount)
        stats.append((ob.name, len(panes), round(float(rain.mean()), 3), round(float(amount.min()), 3),
                      round(float(amount.mean()), 3), round(float(amount.max()), 3)))
    if not amounts:
        return {"panes": 0}
    alla = np.concatenate(amounts)
    return {"panes": n_panes, "skipped (not a vertical band)": n_skipped,
            "grime_min_mean_max": [round(float(f(alla)), 3) for f in (np.min, np.mean, np.max)],
            "cleaned_lately": int((alla <= CLEAN_TRACE[1] * (1.0 + STREET_EXTRA) * KEEP[0]).sum()),
            "objects (panes, rain mean, grime min/mean/max)": stats}


def shader(b, ins):
    k0 = b.signal("pane_grime")
    gate = b.mul(b.gt(k0, 0.0), b.is_class(*CLASSES))
    bt = b.mx(b.signal("pane_bottom"), 0.0)
    sd = b.mx(b.mn(b.signal("pane_left"), b.signal("pane_right")), 0.0)
    widen = b.add(1.0, b.mul(CORNER_WIDEN, b.math('EXPONENT', b.mul(sd, -1.0 / NEAR_CORNER))))
    bottom = b.smooth(1.0, 0.0, b.div(bt, b.mul(widen, BOTTOM_W)))
    low = b.add(SIDE_LOW, b.mul(1.0 - SIDE_LOW, b.math('EXPONENT', b.mul(bt, -1.0 / SIDE_FADE))))
    side = b.mul(b.mul(SIDE, b.smooth(SIDE_W, 0.0, sd)), low)
    corner = b.mul(CORNER, b.smooth(CORNER_W, 0.0, b.math('SQRT', b.add(b.mul(bt, bt), b.mul(sd, sd)))))
    clear = b.mul(b.mul(b.one_minus(b.clamp(bottom)), b.one_minus(b.clamp(side))), b.one_minus(b.clamp(corner)))
    m = b.mul(b.mul(b.one_minus(clear), gate), k0)
    k = b.mul(m, ins["Strength"])
    dim = b.one_minus(b.mn(b.mul(DARK, k), DARK_MAX))
    tint = b.mix(b.rgb(1.0, 1.0, 1.0), b.rgb(*DUST_TINT), b.clamp(k), 'RGBA')
    col = b.tint(b.scale_rgb(ins["Color"], dim), tint)
    spec = b.mul(ins["Specular"], b.one_minus(b.mn(b.mul(SPEC, k), SPEC_MAX)))
    rough = b.add(ins["Roughness"], b.mn(b.mul(ROUGH, k), ROUGH_MAX))
    return {"Color": col, "Roughness": rough, "Specular": spec, "Mask": b.clamp(b.mul(m, 1.6))}
