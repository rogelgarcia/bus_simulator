# The framework's geometry signals: FLOAT attributes tm_wear_<signal> the wear pass writes on the exterior meshes
# (extra data only; the geometry is untouched). A feature lists the ones it reads in SIGNALS; the pass computes each
# signal only on the meshes that carry a class one of those features acts on (signals=all computes all of them on
# every exterior mesh, for the debug view). Shaders read them with b.signal(name) (an Attribute node, Geometry type;
# absent reads 0).
#
#   ground  POINT  height (m) above the walking surface the point stands over (context.WearContext.walking_level)
#   level   POINT  z (m) of that walking surface: < 1.0 at street level (the street, the sidewalk, the pits' and the
#                  entrance pots' soil), 5.82 the entrance top, 10.2 the podium terrace, the balconies, 27.3 the roof
#   sky     CORNER upward sky exposure 0..1: the share of SKY_RAYS cosine-weighted directions over the upper hemisphere
#                  that leave the ray scene unoccluded (an open top reads about 1, an open wall about 0.5: the half of
#                  the sky behind its own face is blocked by it; a sill under a slab much less). Sampled per face
#                  corner, from a point SKY_INSET in from the corner along its bisector (inside the face) and SKY_OFFSET
#                  out along the face's TRUE normal, never from the vertex itself: the vertices of these coarse faces
#                  all sit in junctions (a floor's against its frames and guard shoe, a wall's foot 5 cm under the
#                  paving that abuts it), where an averaged vertex normal sends the rays into the neighbour and every
#                  floor and junction read sheltered. A direction behind the face's own plane counts as blocked by the
#                  face; a ray whose first hit is a back face nearer than SKY_SKIP started inside a neighbour (the
#                  paving over a wall's foot) and goes on past it (fixed 2026-10-14)
#   panel   FACE   a seeded value in [0, 1) per stone panel (faces bounded by the joint floors) or, on a mesh without
#                  joints, per loose island: a stable per-instance id for per-panel variation (never per-pixel noise)
#   indoor  CORNER 1 where a face looks into a room: from the corner's sample point (as for sky) no direction in front
#                  of the face leaves the ray scene without the guards (the glazing counts as a wall, a guard's glass,
#                  free at its top, does not; a back face nearer than SKY_SKIP is passed through). The exterior
#                  objects of the building part reach indoors in places: the wood reveals straddle the glazing line,
#                  the frames, the podium piers and the penthouse walls have room sides. The layer gates the wear off
#                  there (TM_WEAR_layer), except on the glass, whose film is seen through either face. Written by the
#                  pass on the building part's worn meshes (INDOOR_PARTS) whatever the features read, and only on
#                  meshes with an indoor corner (no attribute, no mesh copy otherwise)
# The object flags tm_wear_exposed (1 on exterior objects) and tm_wear_seed (a seeded value in [0, 1) per object, for
# per-instance variation on shared meshes) are set by the pass on every exterior object; shaders read them with
# b.object(name).
#
# Vertices and corners on the coarse facades (panels ~0.6-1.2 m between joints) carry broad gradients only: a value
# linear in z (ground) interpolates exactly over a planar face, a sky exposure only approximately. Sharp marks belong
# to overlays.
import math

import bmesh
import numpy as np

from . import classes

SIGNALS = {"ground": 'POINT', "level": 'POINT', "sky": 'CORNER', "panel": 'FACE', "indoor": 'CORNER'}
PER_OBJECT = ("ground", "level", "sky", "indoor")   # depend on where the object stands: a shared mesh is copied first
DEBUG_SCALE = {"ground": 1.0, "level": 30.0, "sky": 1.0, "panel": 1.0, "indoor": 1.0}   # the debug ramp's full scale
INDOOR_PARTS = ("building",)                     # the parts with rooms (props and site stand outdoors)
NOT_WALLS = ("guard",)                           # rb_element values the indoor test sees through (balcony guards)
INDOOR_ELEVATIONS = (-60.0, -35.0, -15.0, -2.0, 2.0, 15.0, 35.0, 60.0)   # deg; 16 azimuths each, plus up and down
SKY_RAYS = 64
SKY_OFFSET = 0.02                                # a corner's rays start this far out along the face's true normal ...
SKY_INSET = 0.05                                 # ... from a point this far in along the corner's bisector (at most
                                                 # half its shorter edge: an 8 mm joint floor is sampled mid-strip)
SKY_SKIP = 0.12                                  # a back face hit nearer than this is a neighbour the origin is inside
SKY_MAX = 120.0
JOINT_SLOT = "TM_RB_stone_joint"
PANEL_SEED = 1014


def hemisphere(n=SKY_RAYS):
    """n cosine-weighted directions over the upper hemisphere on a golden-angle spiral (fixed: rebuilds are exact)."""
    golden = math.pi * (3.0 - math.sqrt(5.0))
    out = []
    for i in range(n):
        u = (i + 0.5) / n
        r, phi = math.sqrt(u), golden * i
        out.append((r * math.cos(phi), r * math.sin(phi), math.sqrt(max(0.0, 1.0 - u))))
    return out


def ground_level(ctx, ob):
    co, nr = ctx.world(ob)
    level = ctx.walking_level(co, nr)
    return co[:, 2] - level, level


def corner_origins(ctx, ob):
    """Per face corner (loop order): the sample point SKY_INSET in from the corner along its interior bisector and
    SKY_OFFSET out along the face's true normal, and that normal (world space, numpy (L, 3) each)."""
    me = ob.data
    nf, nl = len(me.polygons), len(me.loops)
    co, _ = ctx.world(ob)
    mw = np.array(ob.matrix_world, dtype=np.float64)
    fn = np.empty(nf * 3)
    me.polygons.foreach_get("normal", fn)
    fn = fn.reshape(nf, 3) @ np.linalg.inv(mw[:3, :3])                 # (M^-1)^T applied to row vectors
    fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
    start = np.empty(nf, dtype=np.int64)
    me.polygons.foreach_get("loop_start", start)
    total = np.empty(nf, dtype=np.int64)
    me.polygons.foreach_get("loop_total", total)
    lv = np.empty(nl, dtype=np.int64)
    me.loops.foreach_get("vertex_index", lv)
    face = np.repeat(np.arange(nf), total)
    k = np.arange(nl) - start[face]
    nxt = start[face] + (k + 1) % total[face]
    prv = start[face] + (k - 1) % total[face]
    v = co[lv]
    e1, e2 = co[lv[prv]] - v, co[lv[nxt]] - v
    l1 = np.linalg.norm(e1, axis=1, keepdims=True)
    l2 = np.linalg.norm(e2, axis=1, keepdims=True)
    e1, e2 = e1 / np.maximum(l1, 1e-12), e2 / np.maximum(l2, 1e-12)
    n = fn[face]
    left = np.cross(n, e2)                       # the interior lies left of each edge (counter-clockwise about n)
    b = e1 + e2
    flat = np.linalg.norm(b, axis=1) < 1e-6      # a straight corner: the bisector is the edge's left
    b[flat] = left[flat]
    b *= np.where(np.einsum("ij,ij->i", b, left) < 0.0, -1.0, 1.0)[:, None]   # a reflex corner's bisector turns inward
    b /= np.maximum(np.linalg.norm(b, axis=1, keepdims=True), 1e-12)
    inset = np.minimum(SKY_INSET, 0.5 * np.minimum(l1, l2))
    return v + b * inset + n * SKY_OFFSET, n


def sky_exposure(bvh, origins, normals, dirs):
    """Per origin: the share of the hemisphere directions dirs (cosine-weighted, equal weights) that escape bvh; a
    direction behind the origin's face (d . n <= 0) is blocked by the face, and a back face nearer than SKY_SKIP is
    passed through (the origin is inside a neighbour)."""
    from mathutils import Vector
    darr = np.asarray(dirs, dtype=np.float64)
    vecs = [Vector(d) for d in dirs]
    out = np.empty(len(origins))
    for i, (o, n) in enumerate(zip(origins, normals)):
        esc = 0
        for j in np.nonzero(darr @ n > 0.0)[0]:
            d, p, travelled = vecs[j], Vector(o), 0.0
            while True:
                loc, nh, _, dist = bvh.ray_cast(p, d, SKY_MAX - travelled)
                if loc is None:
                    esc += 1
                    break
                if nh.dot(d) > 0.0 and travelled + dist < SKY_SKIP:
                    travelled += dist + 1e-4
                    p = loc + d * 1e-4
                    continue
                break
        out[i] = esc / len(dirs)
    return out


def sky(ctx, ob):
    """Per face corner: the upward sky exposure (see the header). Identical sample points (shared corners of
    coplanar faces) are cast once."""
    origins, normals = corner_origins(ctx, ob)
    if not len(origins):
        return np.zeros(0)
    keys = np.round(np.hstack([origins * 1000.0, normals * 100.0])).astype(np.int64)
    uniq, first, inv = np.unique(keys, axis=0, return_index=True, return_inverse=True)
    vals = sky_exposure(ctx.ray_scene(), origins[first], normals[first], hemisphere())
    return vals[np.asarray(inv).ravel()]


def sphere():
    """The indoor test's directions: 16 azimuths at each of INDOOR_ELEVATIONS, plus straight up and down (fixed)."""
    out = [(0.0, 0.0, 1.0), (0.0, 0.0, -1.0)]
    for el in INDOOR_ELEVATIONS:
        c, s = math.cos(math.radians(el)), math.sin(math.radians(el))
        out += [(c * math.cos(2 * math.pi * (k + 0.5) / 16), c * math.sin(2 * math.pi * (k + 0.5) / 16), s)
                for k in range(16)]
    return np.array(out)


def escapes(bvh, p, d):
    """Whether the ray from p along d (mathutils Vectors) leaves the ray scene, passing through back faces nearer than
    SKY_SKIP (the origin started inside a neighbour)."""
    travelled = 0.0
    while True:
        loc, nh, _, dist = bvh.ray_cast(p, d, SKY_MAX - travelled)
        if loc is None:
            return True
        if nh.dot(d) > 0.0 and travelled + dist < SKY_SKIP:
            travelled += dist + 1e-4
            p = loc + d * 1e-4
            continue
        return False


def indoor(ctx, ob):
    """Per face corner: 1 where the corner's sample point is enclosed (no direction in front of its face escapes),
    else 0. The directions nearest the face normal are tried first, so an open corner costs a ray or two."""
    from mathutils import Vector
    origins, normals = corner_origins(ctx, ob)
    if not len(origins):
        return np.zeros(0, dtype=np.float32)
    keys = np.round(np.hstack([origins * 1000.0, normals * 100.0])).astype(np.int64)
    _, first, inv = np.unique(keys, axis=0, return_index=True, return_inverse=True)
    dirs = sphere()
    vecs = [Vector(d) for d in dirs]
    bvh = ctx.ray_scene(NOT_WALLS)
    vals = np.zeros(len(first), dtype=np.float32)
    for i, k in enumerate(first):
        n = normals[k]
        dots = dirs @ n
        order = np.argsort(-dots)
        o = Vector(origins[k])
        vals[i] = 0.0 if any(escapes(bvh, o, vecs[j]) for j in order if dots[j] > 0.0) else 1.0
    return vals[np.asarray(inv).ravel()]


def panel(ctx, ob):
    """Per face: one seeded value per region of faces bounded by joint-floor faces (or per loose island)."""
    me = ob.data
    names = [m.name if m else "" for m in me.materials]
    joint = {i for i, n in enumerate(names) if classes.base_name(n) == JOINT_SLOT}
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    out = np.zeros(len(bm.faces), dtype=np.float32)
    seen = set()
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, region = [f], []
        seen.add(f.index)
        is_joint = f.material_index in joint
        while stack:
            g = stack.pop()
            region.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen and (h.material_index in joint) == is_joint:
                        seen.add(h.index)
                        stack.append(h)
        lo = min(tuple(round(c, 3) for c in v.co) for g in region for v in g.verts)
        val = ctx.seed(PANEL_SEED, me.name, lo)
        for g in region:
            out[g.index] = val
    bm.free()
    return out


def write(ctx, need, log=print):
    """need: {object: set of signal names}. Computes and writes each; returns {signal: elements written}."""
    done = {k: 0 for k in SIGNALS}
    for ob, names in need.items():
        names = [n for n in SIGNALS if n in names]
        ind = None
        if "indoor" in names:
            ind = indoor(ctx, ob) if ctx.part in INDOOR_PARTS else np.zeros(0)
            if not ind.any():                    # nothing indoors: no attribute (absent reads 0), no mesh copy
                names.remove("indoor")
                ind = None
        if not names:
            continue
        if any(n in PER_OBJECT for n in names):
            ctx.own_mesh(ob)
        if "ground" in names or "level" in names:
            g, lv = ground_level(ctx, ob)
            if "ground" in names:
                ctx.set_attribute(ob, "ground", g, 'POINT')
                done["ground"] += len(g)
            if "level" in names:
                ctx.set_attribute(ob, "level", lv, 'POINT')
                done["level"] += len(lv)
        if "sky" in names:
            s = sky(ctx, ob)
            ctx.set_attribute(ob, "sky", s, 'CORNER')
            done["sky"] += len(s)
        if "panel" in names:
            p = panel(ctx, ob)
            ctx.set_attribute(ob, "panel", p, 'FACE')
            done["panel"] += len(p)
        if ind is not None:
            ctx.set_attribute(ob, "indoor", ind, 'CORNER')
            done["indoor"] += int(ind.sum())
    return done
