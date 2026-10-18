# joint_dirt -- dirt lodged in the stone joints and the paving joints (2026-10-14).
#
# Dust and the street's grime collect in a joint's groove and on the 3 mm lower bevel of a horizontal joint, the lip of
# the stone below it, which faces up: a horizontal joint holds more than a vertical one, which the rain runs down and
# keeps clean, and a sheltered joint (under a soffit, in a recess) more than one the rain rinses. Paving joints fill
# with the grit the rain washes into them, open or not. The building is new and pale (b8 shows its joints as fine pale
# lines), so the joints only read a touch greyer and darker than the stone, and differ run to run. From the model only:
#   jrun     (this feature's attribute, FACE) on the joint floors (TM_RB_stone_joint, cut by layer_materials.py) and on
#            the up-facing lower bevels next to them: how much that joint run holds. Each floor face is sorted by the
#            run it belongs to: a course joint (runs level along a wall) 1.0, a joint on a top 1.0, a vertical joint
#            VERTICAL, a joint on a soffit SOFFIT, a crossing 1.0. A run's floor faces of one
#            kind joined edge to edge (a course joint between two vertical ones: one stone's top edge; a vertical
#            joint between two courses) take one seeded value within +-RUN_VAR/2 from the run's own ids (the object
#            and its lowest corner), never from noise; a lower bevel takes its floor's value
#   shelter  the framework's sky signal over what an open surface of the point's tilt sees ((1 + nz) / 2 of the
#            hemisphere, at least OPEN_SKY_FLOOR): a sheltered joint keeps it all, a rinsed one EXPOSED of it. The
#            look was first calibrated while the sky signal still read 0 (sheltered) on every joint; with the signal
#            fixed (2026-10-14, per face corner off the true normal) an open wall's joints read about 0.5 = rinsed, so
#            the amounts were raised by 1.5 and EXPOSED to 0.6: an open facade's joints look as calibrated (0.9 of
#            it), a sheltered joint (in a loggia, under a soffit, in a storefront recess) 1.5 times that
#   tile / tjoint  (FACE) the tile size and the joint width of the faces dressed as square tiles (plan["materials"]
#            families with tile_m: the roof deck, the sidewalk), whose joints are drawn by their material, not cut:
#            the feature finds them again from the object's x / y exactly as layer_materials.dress_tiles does, and
#            darkens them, a hair past their edge (SPREAD, the grit at the tiles' arrises), by TILE of the stone
#            joints' amount, each joint line within +-RUN_VAR/2 from its own index (an exact integer hash, no noise)
# Look, at strength 1 in a full run: DESAT toward the surface's own grey, DARKEN darker, ROUGH more matte; the bevels
# take BEVEL of it. Classes: joint (the joint floors), stone (the bevels), paving (the tile joints).
import bmesh
import numpy as np

from .. import classes

NAME = "joint_dirt"
LABEL = "dirt in the stone and paving joints: horizontal and sheltered runs hold more, each run its own amount"
ORDER = 130
CLASSES = ("joint", "stone", "paving")
SIGNALS = ("sky",)
ATTRIBUTES = {"jrun": 1.5, "tile": 1.0, "tjoint": 0.01}
DEBUG_RGB = (0.95, 0.15, 0.45)
DEFAULT_STRENGTH = 1.0

JOINT_SLOT = "TM_RB_stone_joint"
SEED = 1430
VERTICAL = 0.45                # a vertical joint's share (rain runs down it)
SOFFIT = 0.50                  # a joint on a soffit (faces down: soot, little dust)
CROSS = 0.012                  # a floor face under this in both directions is a crossing (it counts as the course)
BEVEL_NZ = (0.5, 0.97)         # a stone face next to a joint floor facing up this much is its lower bevel ...
BEVEL_WIDTH = 0.010            # ... if it is this narrow (area / longest edge; the bevel's slant is 6.7 mm)
RUN_VAR = 0.50                 # run-to-run spread of the amount
RINSE = (0.40, 0.90)           # rinse (sky over an open surface's sky) where the shelter starts to fade / is gone
EXPOSED = 0.60                 # a fully rinsed joint keeps this share
OPEN_SKY_FLOOR = 0.2
BEVEL = 0.45                   # the lower bevels take this share of their joint's amount
TILE = 0.57                    # the paving joints' share (0.85 before the amounts rose by 1.5: the same look)
SPREAD = 0.0015                # the paving dirt reaches this far past the joint's drawn edge (m)
DESAT = 0.52                   # at a full, sheltered run, strength 1
DARKEN = 0.21
ROUGH = 0.075
HASH = ((37.0, 113.0, 71.0), (53.0, 89.0, 17.0))   # (a, b, c): (a i^2 + b i + c) mod 257, for the x and the y lines


def _kinds(bm, joint_idx):
    """Per joint floor face: (kind, weight). Kinds: course | top | vertical | soffit | cross."""
    out = {}
    for f in bm.faces:
        if f.material_index not in joint_idx:
            continue
        n = f.normal
        if n.z > 0.7:
            out[f.index] = ("top", 1.0)
            continue
        if n.z < -0.7:
            out[f.index] = ("soffit", SOFFIT)
            continue
        t = np.array((-n.y, n.x, 0.0))
        t /= max(np.linalg.norm(t), 1e-12)
        co = np.array([v.co[:] for v in f.verts])
        s_ext = float(np.ptp(co @ t))
        z_ext = float(np.ptp(co[:, 2]))
        if s_ext < CROSS and z_ext < CROSS:
            out[f.index] = ("cross", 1.0)
        elif z_ext < s_ext:
            out[f.index] = ("course", 1.0)
        else:
            out[f.index] = ("vertical", VERTICAL)
    return out


def _runs(ctx, ob):
    """Per face of a jointed mesh: jrun (0 off the joints)."""
    me = ob.data
    joint_idx = {i for i, m in enumerate(me.materials) if m is not None and classes.base_name(m.name) == JOINT_SLOT}
    out = np.zeros(len(me.polygons), dtype=np.float32)
    if not joint_idx:
        return out, 0, 0
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.transform(ob.matrix_world)
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    kind = _kinds(bm, joint_idx)
    # runs: floor faces of one kind joined edge to edge, one seeded value each (the crossings, 8 x 8 mm and the 3 mm
    # pieces where a bevel crosses a floor, are runs of their own: they part the courses stone by stone)
    seen, runs = set(), 0
    for i in kind:
        if i in seen:
            continue
        stack, region = [i], []
        seen.add(i)
        while stack:
            g = stack.pop()
            region.append(g)
            for e in bm.faces[g].edges:
                for h in e.link_faces:
                    if h.index in kind and h.index not in seen and kind[h.index][0] == kind[i][0]:
                        seen.add(h.index)
                        stack.append(h.index)
        lo = min(tuple(round(c, 3) for c in v.co) for g in region for v in bm.faces[g].verts)
        val = kind[i][1] * (1.0 - RUN_VAR / 2 + RUN_VAR * ctx.seed(SEED, ob.name, kind[i][0], lo))
        for g in region:
            out[g] = val
        runs += 1
    # the lower bevels: narrow up-facing stone faces next to a floor take its value
    bevels = 0
    for f in bm.faces:
        if f.index in kind or not (BEVEL_NZ[0] < f.normal.z < BEVEL_NZ[1]):
            continue
        longest = max(e.calc_length() for e in f.edges)
        if longest <= 0 or f.calc_area() / longest > BEVEL_WIDTH:
            continue
        nb = [out[h.index] for e in f.edges for h in e.link_faces if h.index in kind]
        if nb:
            out[f.index] = max(nb)
            bevels += 1
    bm.free()
    return out, runs, bevels


def _tiles(ctx, ob):
    """Per face: (tile size, joint width) of the faces dressed as square tiles, else 0."""
    fams = [f for f in ctx.plan["materials"].values() if isinstance(f, dict) and "tile_m" in f]
    slot = {s: (f["tile_m"], f["joint_m"]) for f in fams for s in f["slots"]}
    me = ob.data
    per_mat = [slot.get(classes.base_name(m.name), (0.0, 0.0)) if m is not None else (0.0, 0.0) for m in me.materials]
    if not any(t for t, _ in per_mat):
        return None, None
    mi = np.empty(len(me.polygons), dtype=np.int64)
    me.polygons.foreach_get("material_index", mi)
    table = np.array(per_mat, dtype=np.float32).reshape(-1, 2)
    vals = table[np.clip(mi, 0, len(table) - 1)]
    return vals[:, 0], vals[:, 1]


def attributes(ctx):
    """tm_wear_jrun on the jointed stone meshes; tm_wear_tile / tm_wear_tjoint on the tiled paving."""
    stats = {"jointed_objects": 0, "runs": 0, "bevels": 0, "tiled_objects": 0}
    for ob in ctx.meshes(CLASSES):
        vals, runs, bevels = _runs(ctx, ob)
        if vals.any():
            ctx.own_mesh(ob)
            ctx.set_attribute(ob, "jrun", vals, 'FACE')
            stats["jointed_objects"] += 1
            stats["runs"] += runs
            stats["bevels"] += bevels
        tile, width = _tiles(ctx, ob)
        if tile is not None:
            ctx.own_mesh(ob)
            ctx.set_attribute(ob, "tile", tile, 'FACE')
            ctx.set_attribute(ob, "tjoint", width, 'FACE')
            stats["tiled_objects"] += 1
    return stats


def _line_hash(b, i, abc):
    """An exact integer hash of a joint line's index i (a float holding an integer): (a i^2 + b i + c) mod 257 / 257."""
    a, bb, c = abc
    h = b.add(b.add(b.mul(a, b.mul(i, i)), b.mul(bb, i)), c)
    return b.div(b.math('FLOORED_MODULO', h, 257.0), 257.0)


def shader(b, ins):
    # shelter: the sky a point sees over the sky an open surface of its tilt sees
    open_sky = b.mx(b.mul(0.5, b.add(1.0, b.nz())), OPEN_SKY_FLOOR)
    rinse = b.clamp(b.div(b.signal("sky"), open_sky))
    expo = b.sub(1.0, b.mul(1.0 - EXPOSED, b.smooth(RINSE[0], RINSE[1], rinse)))
    run = b.signal("jrun")
    stone_k = b.mul(b.mul(run, expo), b.add(b.is_class("joint"), b.mul(BEVEL, b.is_class("stone"))))
    # the paving's drawn joints, found again from the object's x / y (layer_materials.dress_tiles)
    tile, width = b.signal("tile"), b.signal("tjoint")
    tc = b.node('ShaderNodeTexCoord')
    x, y, _ = b.xyz(tc.outputs['Object'])
    seed = b.object("seed")
    lines = None
    for coord, abc in ((x, HASH[0]), (y, HASH[1])):
        u = b.div(coord, tile)
        f = b.math('FRACT', u)
        d = b.mul(b.mn(f, b.one_minus(f)), tile)                         # metres to the nearest joint line
        half = b.mul(0.5, width)
        on = b.one_minus(b.smooth(half, b.add(half, SPREAD), d))
        h = b.math('FRACT', b.add(_line_hash(b, b.math('ROUND', u), abc), seed))
        val = b.mul(on, b.add(1.0 - RUN_VAR / 2, b.mul(RUN_VAR, h)))
        lines = val if lines is None else b.mx(lines, val)
    tile_k = b.mul(b.mul(lines, TILE), b.mul(b.gt(tile, 0.0), b.is_class("paving")))
    m = b.clamp(b.add(stone_k, tile_k))
    k = b.mul(b.add(stone_k, tile_k), ins["Strength"])
    col = b.desaturate(ins["Color"], b.mul(DESAT, k))
    col = b.scale_rgb(col, b.mx(b.one_minus(b.mul(DARKEN, k)), 0.0))
    return {"Color": col, "Roughness": b.add(ins["Roughness"], b.mul(ROUGH, k)), "Mask": m}
