# WearContext: what the wear pass and a feature's attributes(ctx) see of the part being worn.
#
#   ctx.part / ctx.plan / ctx.root      the part (building | props | site), the plan, its root collection
#   ctx.exterior                        the part's exterior objects (everything under the root but the interiors)
#   ctx.meshes(classes)                 its exterior mesh objects carrying a material of one of `classes`
#   ctx.world(ob)                       (co, normals) of a mesh's vertices in world space, numpy (N, 3)
#   ctx.walking_level(co, normals)      z of the walking surface each point stands over (see SURFACES below)
#   ctx.ray_scene(without=())           a BVHTree of the part's own fixed geometry plus plan proxies of the other parts
#                                       (without: rb_element values to leave out, e.g. ("guard",) for the indoor test)
#   ctx.exposure(origins, dirs, w)      the weighted share of directions that escape the ray scene, per origin
#   ctx.covered(points, level)          1 where something stands on the walking surface at a point (a pot, a pit)
#   ctx.own_mesh(ob)                    give ob its own mesh before per-object data (undone by the strip)
#   ctx.set_attribute(ob, name, values, domain)   write tm_wear_<name> (FLOAT) on ob's mesh
#   ctx.seed(*parts)                    a deterministic value in [0, 1) from any stable ids (no noise: one per instance)
#
# Walking surfaces (from the plan, so every part sees the same ones whichever part it is): the street (plan street
# level, 0.0), the sidewalk on it (its footprint, at its z) and the ground slab (the podium and entrance outlines at the
# ground floor level: the storefront bays' recesses), the tree pits' and the entrance pots' soil, the entrance
# volume's top, the podium terrace, the balconies and the roof deck (the balcony edge / roof edge outlines at their
# slab tops plus the paving). A point stands over the highest surface below it whose outline holds it, tested a few
# centimetres out along its normal, so a wall's foot stands over the pavement in front of it, not over the floor
# behind, and a slab fascia overhanging the street stands over the street.
#
# The ray scene: the part's own exterior meshes except the movable furniture (the cafe sets and the roof furniture:
# umbrellas are furled in the rain and chairs move), plus plan proxies of what the other parts hold: the building's
# massing (podium, entrance volume, slabs, tower, roof, penthouse), the storefront canopies, the tree pits and the
# entrance pots. Proxies keep a part's signals independent of the other parts' saved files and of the build order.
import hashlib
import math

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from . import classes

PART_ROOTS = {"building": "TM_BUILDING", "props": "TM_PROPS", "site": "RB_SITE"}
INTERIOR_COLLECTIONS = ("RB_INTERIOR",)                       # and everything under them: never exposed
MOVABLE_COLLECTIONS = ("RB_SITE_CAFE", "RB_ROOF_FURNITURE")   # not occluders in the ray scene
OUT_TEST = 0.08                # a point's outline tests are made this far out along its horizontal normal
SOIL_DROP = 0.06               # a pit's or pot's soil sits this far under its rim


def collection_tree(coll):
    out = [coll]
    for c in coll.children:
        out += collection_tree(c)
    return out


def inside(poly, x, y, chunk=8192):
    """Even-odd point-in-polygon for arrays of points (x, y) against one outline (M, 2)."""
    poly = np.asarray(poly, dtype=np.float64)
    px, py = poly[:, 0], poly[:, 1]
    qx, qy = np.roll(px, -1), np.roll(py, -1)
    dy = np.where(np.abs(qy - py) < 1e-30, 1e-30, qy - py)
    out = np.zeros(len(x), dtype=bool)
    for i in range(0, len(x), chunk):
        xs, ys = x[i:i + chunk, None], y[i:i + chunk, None]
        cross = (py[None, :] > ys) != (qy[None, :] > ys)
        xint = (qx - px)[None, :] * (ys - py[None, :]) / dy[None, :] + px[None, :]
        out[i:i + chunk] = (np.count_nonzero(cross & (xs < xint), axis=1) % 2) == 1
    return out


def circle(at, r, n=12):
    return [(at[0] + r * math.cos(2 * math.pi * k / n), at[1] + r * math.sin(2 * math.pi * k / n)) for k in range(n)]


class WearContext:
    def __init__(self, part, plan, log=print):
        assert part in PART_ROOTS, f"wear: no exterior part {part!r} (one of {sorted(PART_ROOTS)})"
        self.part, self.plan, self.log = part, plan, log
        self.root = bpy.data.collections.get(PART_ROOTS[part])
        assert self.root is not None and self.root.library is None, f"wear: no local collection {PART_ROOTS[part]}"
        hidden = set()
        for c in collection_tree(self.root):
            if c.name in INTERIOR_COLLECTIONS:
                hidden |= {x.name for x in collection_tree(c)}
        self.interior = hidden
        self.exterior = sorted({o for c in collection_tree(self.root) if c.name not in hidden for o in c.objects},
                               key=lambda o: o.name)
        self._bvh = {}
        self.surfaces = self._surfaces()

    # ---------------------------------------------------------------- objects and data
    def meshes(self, cls_names=None):
        """Exterior mesh objects (with a material of one of cls_names, if given)."""
        out = []
        for o in self.exterior:
            if o.type != 'MESH':
                continue
            names = {classes.classify(m)[1] for m in o.data.materials if m is not None}
            if cls_names is None or names & set(cls_names):
                out.append(o)
        return out

    def world(self, ob):
        me = ob.data
        n = len(me.vertices)
        co = np.empty(n * 3, dtype=np.float64)
        me.vertices.foreach_get("co", co)
        nr = np.empty(n * 3, dtype=np.float64)
        me.vertices.foreach_get("normal", nr)
        mw = np.array(ob.matrix_world, dtype=np.float64)
        co = co.reshape(n, 3) @ mw[:3, :3].T + mw[:3, 3]
        nm = np.linalg.inv(mw[:3, :3]).T
        nr = nr.reshape(n, 3) @ nm.T
        ln = np.linalg.norm(nr, axis=1, keepdims=True)
        return co, nr / np.where(ln < 1e-12, 1.0, ln)

    def own_mesh(self, ob):
        """Give ob its own copy of a shared mesh (per-object data); the strip puts the shared one back."""
        me = ob.data
        if me.users > 1:
            copy = me.copy()
            copy.name = f"{me.name}~{ob.name}"
            ob["tm_wear_shared_mesh"] = me.name
            ob.data = copy
        return ob.data

    def set_attribute(self, ob, name, values, domain='POINT'):
        me = ob.data
        nm = "tm_wear_" + name
        if nm in me.attributes:
            me.attributes.remove(me.attributes[nm])
        a = me.attributes.new(nm, 'FLOAT', domain)
        values = np.asarray(values, dtype=np.float32).ravel()
        assert len(values) == len(a.data), f"wear {name}: {len(values)} values for {len(a.data)} {domain} elements"
        a.data.foreach_set("value", values)
        return a

    @staticmethod
    def seed(*parts):
        h = hashlib.md5(":".join(str(p) for p in parts).encode()).hexdigest()
        return int(h[:12], 16) / float(16 ** 12)

    # ---------------------------------------------------------------- walking surfaces
    def _surfaces(self):
        p = self.plan
        lv, lay = p["levels_m"], p["layers"]
        pave = p["balconies"]["paving"]
        sd = p["props"]["street_dressing"]
        sw = p["props"]["sidewalk_cafe"]
        ground = p["structure"]["ground_floor_level"]
        s = [("sidewalk", sw["sidewalk"]["footprint"], sw["z"]),
             ("ground_slab", lay["podium"]["outline"], ground),         # the storefront bays' recesses, the interior
             ("entrance_slab", lay["entrance"]["outline"], ground),
             ("entrance_top", lay["entrance"]["outline"], lay["entrance"]["z"][1] + p["podium"]["paving"]),
             ("podium_terrace", lay["balcony_edge"]["outline"], lv["podium_top"] + pave)]
        s += [(f"balcony_{t}", lay["balcony_edge"]["outline"], t + pave) for t in lv["balcony_slab_tops"]]
        s.append(("roof", lay["roof_edge"]["outline"], lv["roof_slab_top"] + p["roof"]["paving"]))
        s += [(f"pit_{i}", pit["loop"], pit["z"] + pit["height"] - SOIL_DROP) for i, pit in enumerate(sd["pits"])]
        s += [(f"pot_{i}", circle(pot["at"], pot["radius"]), pot["z"] + pot["height"] - SOIL_DROP)
              for i, pot in enumerate(sd["pots"])]
        return [(name, np.asarray(loop, dtype=np.float64), float(z)) for name, loop, z in s]

    def walking_level(self, co, normals=None):
        """z of the walking surface each point (N, 3) stands over: the highest surface at or below it (2 cm slack)
        whose outline holds the point moved OUT_TEST out along its horizontal normal."""
        co = np.asarray(co, dtype=np.float64)
        x, y = co[:, 0].copy(), co[:, 1].copy()
        if normals is not None:
            h = np.asarray(normals, dtype=np.float64)[:, :2]
            ln = np.linalg.norm(h, axis=1)
            ok = ln > 0.2
            x[ok] += h[ok, 0] / ln[ok] * OUT_TEST
            y[ok] += h[ok, 1] / ln[ok] * OUT_TEST
        level = np.full(len(co), float(self.plan["levels_m"]["street"]))
        for _, loop, z in self.surfaces:
            cand = co[:, 2] >= z - 0.02
            if not cand.any():
                continue
            idx = np.nonzero(cand)[0]
            hit = inside(loop, x[idx], y[idx])
            sel = idx[hit]
            level[sel] = np.maximum(level[sel], z)
        return level

    # ---------------------------------------------------------------- ray scene
    def _proxy_prisms(self):
        """(loop, z0, z1) prisms and (corner quads) of the other parts, from the plan."""
        p = self.plan
        lv, lay = p["levels_m"], p["layers"]
        prisms, quads = [], []
        if self.part != "building":
            edge = lay["balcony_edge"]["outline"]
            prisms.append((lay["podium"]["outline"], 0.0, lv["podium_top"]))
            prisms.append((lay["entrance"]["outline"], 0.0, lay["entrance"]["z"][1]))
            for t in lv["balcony_slab_tops"]:
                prisms.append((edge, t - lv["slab_edge"], t))
            prisms.append((lay["tower_wall_line"]["outline"], lv["podium_top"], lv["roof_slab_bottom"]))
            prisms.append((lay["roof_edge"]["outline"], lv["roof_slab_bottom"], lv["roof_slab_top"]))
            prisms.append((lay["penthouse"]["outline"], lay["penthouse"]["z"][0], lay["penthouse"]["z"][1]))
        if self.part != "props":
            for c in p["props"]["storefront_awnings"]["canopies"]:
                a, o, q = Vector((*c["along"], 0.0)), Vector((*c["outward"], 0.0)), Vector((*c["p"], 0.0))
                (s0, s1), (v0, v1), (z0, z1) = c["s"], c["v"], c["z_top"]
                corners = ((s0, v0, z0), (s1, v0, z0), (s1, v1, z1), (s0, v1, z1))
                quads.append([q + a * s + o * v + Vector((0, 0, z)) for s, v, z in corners])
        if self.part != "site":
            sd = p["props"]["street_dressing"]
            for pit in sd["pits"]:
                prisms.append((pit["loop"], pit["z"], pit["z"] + pit["height"]))
            for pot in sd["pots"]:
                prisms.append((circle(pot["at"], pot["radius"]), pot["z"], pot["z"] + pot["height"]))
        return prisms, quads

    def ray_scene(self, without=()):
        key = tuple(sorted(without))
        if key in self._bvh:
            return self._bvh[key]
        verts, polys = [], []
        movable = set()
        for c in collection_tree(self.root):
            if c.name in MOVABLE_COLLECTIONS:
                movable |= {o.name for x in collection_tree(c) for o in x.objects}
        for ob in self.exterior:
            if ob.type != 'MESH' or ob.name in movable or not ob.data.polygons or ob.get("rb_element") in key:
                continue
            me = ob.data
            me.calc_loop_triangles()
            n = len(me.vertices)
            co = np.empty(n * 3, dtype=np.float64)
            me.vertices.foreach_get("co", co)
            mw = np.array(ob.matrix_world, dtype=np.float64)
            co = co.reshape(n, 3) @ mw[:3, :3].T + mw[:3, 3]
            tri = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
            me.loop_triangles.foreach_get("vertices", tri)
            base = len(verts)
            verts.extend(map(tuple, co))
            polys.extend(map(tuple, tri.reshape(-1, 3) + base))
        prisms, quads = self._proxy_prisms()
        for loop, z0, z1 in prisms:
            loop = [tuple(q) for q in loop]
            k, base = len(loop), len(verts)
            verts += [(x, y, z0) for x, y in loop] + [(x, y, z1) for x, y in loop]
            polys.append(tuple(range(base + k, base + 2 * k)))
            polys.append(tuple(reversed(range(base, base + k))))
            polys += [(base + i, base + (i + 1) % k, base + k + (i + 1) % k, base + k + i) for i in range(k)]
        for pts in quads:
            base = len(verts)
            verts += [tuple(v) for v in pts]
            polys.append((base, base + 1, base + 2, base + 3))
        self._bvh[key] = BVHTree.FromPolygons(verts, polys, all_triangles=False, epsilon=0.0)
        self.log(f"wear: ray scene {len(polys)} polygons ({len(prisms)} proxy prisms, {len(quads)} canopy quads)"
                 + (f" without {', '.join(key)}" if key else ""))
        return self._bvh[key]

    def exposure(self, origins, dirs, weights=None, max_dist=120.0):
        """Per origin, the weighted share of the directions whose ray escapes the ray scene."""
        bvh = self.ray_scene()
        dirs = [Vector(d).normalized() for d in dirs]
        w = np.ones(len(dirs)) if weights is None else np.asarray(weights, dtype=np.float64)
        total = float(w.sum())
        out = np.empty(len(origins))
        for i, o in enumerate(origins):
            o = Vector(o)
            out[i] = sum(wk for d, wk in zip(dirs, w) if bvh.ray_cast(o, d, max_dist)[0] is None) / total
        return out

    def covered(self, points, level, above=0.10, probe=1.6):
        """1 where a ray dropped from `probe` above the walking surface meets something standing on it (more than
        `above` over it, so a sill or a threshold does not count) before the surface: the ground there is a pot's, a
        pit's or a planter's, not open paving."""
        bvh = self.ray_scene()
        down = Vector((0.0, 0.0, -1.0))
        out = np.zeros(len(points))
        for i, (p, z) in enumerate(zip(points, level)):
            hit = bvh.ray_cast(Vector((p[0], p[1], z + probe)), down, probe)
            if hit[0] is not None and hit[0].z > z + above:
                out[i] = 1.0
        return out
