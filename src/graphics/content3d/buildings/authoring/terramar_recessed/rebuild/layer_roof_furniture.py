# layer_roof_furniture.py -- AI 630: the roof terrace's furniture after the aerial, from plan["props"]["roof_furniture"]
# -- and the detailed-furniture placement every furnished layer shares (2026-10-14).
#
# Run through build.py (layers=roof_furniture; needs the roof and roof_planters layers). Builds RB_PROPS/RB_ROOF_FURNITURE
# under its part root, one object per item (rb_roof_furniture_<group>_<n>_<kind>):
#   dining        a 2.4 m teak dining table and eight slat-back teak dining chairs with seat pads
#   lounge        a three-seat sofa and two armchairs on open teak frames (outdoor), a coffee table, two side tables
#   front_centre  two teak-framed armchairs round a slatted low table, two sun loungers with their feet towards the view
# Materials: the detailed furniture's (furniture_materials.py): TM_RB_furn_teak, TM_RB_furn_metal and the group's seeded
# cushion tone, TM_RB_furn_fabric_<offwhite|ecru|greige>. The paving tiles are the materials pass's roof_paving family
# on the deck's own face set (TM_RB_roof_paving).
# Every object is tagged rb_hide_from_b8: check_layers.py renders them red from CAM_B8 and must find 0 pixels. The layer
# also checks each footprint: at least clear_of_guard_m inside the guard shoe's inner line, clear of AI 629's islands and
# of the penthouse and its annex.
#
# The shared placement (the restaurant, the upper dining room, the residential units, the penthouse, the café):
#   furnish(coll, items, prefix, tagger, z=None) -> (objects, stats)
#       one object per item. Its mesh comes from furniture_chairs.py (dining_chair, cafe_chair, bar_stool) or
#       furniture_tables_seating.py (the tables, sofa, armchair, lounger), built at the origin in the item's own frame
#       (+v its front, u = (face.y, -face.x)) and placed by the object's location and turn about z, so the footprint
#       checks on the plan's items stay valid. Items with the same geometry (kind, size, variant, cushion, heights,
#       frame) share one mesh as linked duplicates: the 330 dining chairs store a handful of meshes, the materials
#       shift their UVs per object so the grain does not repeat. Seeded upholstery (sofa, armchair and lounger
#       cushions) keeps one mesh per item, seeded by its place. Every object is a MESH, so the collision audit pairs
#       it like any other. Nothing goes through rb_lib.finish: its coplanar dissolve and box UVs would undo the
#       rounded sections and the grain and weave UVs.
#   clear(coll)       empty a collection like rb_lib.clear_collection, removing each shared mesh once
#   materials()       the furniture materials (shared ones and the chairs' own)
#   Frame, corners()  an item's frame and footprint, for the layers' checks
import importlib
import math
import os
import sys

import bmesh
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import rb_lib as L  # noqa: E402
import layer_balcony_plants as BP  # noqa: E402  (PARENT)
import furniture_materials as FM  # noqa: E402  (the shared furniture materials)
import furniture_chairs as FC  # noqa: E402  (dining_chair, cafe_chair, bar_stool)
import furniture_tables_seating as FT  # noqa: E402  (tables, sofa, armchair, lounger)

for _mod in (L, BP, FM, FC, FT):
    importlib.reload(_mod)

COLLECTION = "RB_ROOF_FURNITURE"
LAYER = "roof_furniture"
TEAK, METAL = FM.PLAIN_TEAK, FM.PLAIN_METAL         # the plain teak / charcoal slots of the box-built pieces
SEEDED = ("sofa", "armchair", "lounger")            # seeded cushions: one mesh per item
CUSHIONED = ("dining_chair", "bar_stool") + SEEDED  # the kinds whose mesh depends on the cushion colour
GEOMETRY = ("variant", "seat_h", "back_h", "h", "top_r", "hole_r", "frame", "seed")
ROOF_CHAIR = "slat"                                 # the terrace's dining chairs: slat-back teak, an outdoor classic


def tags(element, name):
    return {"rb_layer": LAYER, "rb_element": element, "tm_element": COLLECTION, "tm_role": element, "rb_name": name,
            "rb_hide_from_b8": True}


def materials():
    FC.materials()                                  # furniture_materials.py's shared set and the chairs' own
    FT.materials()


class Frame:
    """An item's frame: local (u, v) -> world (x, y), +v the item's front."""

    def __init__(self, item):
        self.c = item["at"]
        f = item["face"]
        self.v = (f[0], f[1])
        self.u = (f[1], -f[0])

    def pt(self, u, v):
        return (self.c[0] + self.u[0] * u + self.v[0] * v, self.c[1] + self.u[1] * u + self.v[1] * v)

    def box(self, u0, u1, v0, v1):
        return [self.pt(u0, v0), self.pt(u1, v0), self.pt(u1, v1), self.pt(u0, v1)]


def corners(item):
    fr = Frame(item)
    w, d = item["size"]
    return fr.box(-w / 2, w / 2, -d / 2, d / 2)


# ---------------------------------------------------------------- the shared placement


def clear(coll):
    """Empty coll (objects, child collections, the data left without users) as rb_lib.clear_collection does, removing
    every mesh its objects share only once."""
    datas = {ob.data.as_pointer(): ob.data for ob in coll.all_objects if ob.data is not None}
    for ob in list(coll.all_objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    blocks = ((bpy.types.Mesh, bpy.data.meshes), (bpy.types.Curve, bpy.data.curves),
              (bpy.types.Camera, bpy.data.cameras), (bpy.types.Light, bpy.data.lights))
    for d in datas.values():
        if d.users:
            continue
        for kind, block in blocks:
            if isinstance(d, kind):
                block.remove(d)
                break
    L.clear_collection(coll)


def local_item(item):
    """The item at the origin facing +y, its variant resolved where it stands (a chair set keeps matching) and, for the
    seeded upholstery, a seed from its place (its cushions differ from its neighbours')."""
    kind = item["kind"]
    loc = {k: v for k, v in item.items() if k not in ("at", "face", "z", "group")}
    loc.update({"at": [0.0, 0.0], "face": [0.0, 1.0]})
    if kind in FC.KINDS:
        loc["variant"] = FC.variant(item)
    if kind in SEEDED:
        loc["seed"] = f"{item['at'][0]:.3f},{item['at'][1]:.3f}"
    if kind not in CUSHIONED:
        loc.pop("cushion", None)
    return loc


def mesh_key(loc):
    return (loc["kind"], tuple(round(float(s), 4) for s in loc.get("size", ())), loc.get("cushion")) + tuple(
        (k, loc[k]) for k in GEOMETRY if k in loc)


def build_mesh(name, loc):
    """The item's mesh at the origin: (mesh, triangles, the chair's footprint fit)."""
    bm, names = bmesh.new(), []

    def slot(n):
        if n not in names:
            names.append(n)
        return names.index(n)

    mod = FC if loc["kind"] in FC.KINDS else FT
    res = mod.build(bm, loc, 0.0, slot)
    bm.normal_update()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for n in names:
        me.materials.append(bpy.data.materials.get(n) or bpy.data.materials.new(n))
    return me, res["tris"], tuple(res.get("fit", (1.0, 1.0)))


def furnish(coll, items, prefix, tagger, z=None):
    """One object per item (floor: the item's z, else z) sharing meshes by geometry; returns (objects, stats)."""
    meshes, made, kinds, squeezed = {}, [], {}, []
    placed = 0
    for i, it in enumerate(items):
        kind = it["kind"]
        loc = local_item(it)
        key = mesh_key(loc)
        if key not in meshes:
            meshes[key] = build_mesh(f"{prefix}_mesh_{len(meshes):02d}_{kind}", loc)
            me, _, fit = meshes[key]
            me["rb_furniture_key"] = repr(key)
            if fit != (1.0, 1.0):
                squeezed.append(f"{kind} {loc.get('size')} fit {fit}")
        me, tris, _ = meshes[key]
        name = f"{prefix}_{i:03d}_{kind}"
        ob = bpy.data.objects.new(name, me)
        fx, fy = it["face"]
        ob.location = (it["at"][0], it["at"][1], it.get("z", z))
        ob.rotation_euler = (0.0, 0.0, math.atan2(-fx, fy))         # local +y onto the face, local +x onto u
        for k, v in {**tagger("furniture", name), "rb_kind": kind}.items():
            ob[k] = v
        coll.objects.link(ob)
        made.append(ob)
        placed += tris
        kinds[kind] = kinds.get(kind, 0) + 1
    for s in squeezed:
        print(f"WARNING {prefix}: a chair needed a footprint fit: {s}")
    return made, {"objects": len(made), "meshes": len(meshes), "tris_placed": placed,
                  "tris_stored": sum(m[1] for m in meshes.values()), "kinds": kinds, "squeezed": squeezed}


# ---------------------------------------------------------------- the roof terrace


def inside(loop, q):
    n, c = len(loop), False
    for i in range(n):
        (ax, ay), (bx, by) = loop[i], loop[(i + 1) % n]
        if (ay > q[1]) != (by > q[1]) and q[0] < ax + (q[1] - ay) * (bx - ax) / (by - ay):
            c = not c
    return c


def edge_distance(loop, q):
    best = 1e9
    n = len(loop)
    for i in range(n):
        (ax, ay), (bx, by) = loop[i], loop[(i + 1) % n]
        dx, dy = bx - ax, by - ay
        t = max(0.0, min(1.0, ((q[0] - ax) * dx + (q[1] - ay) * dy) / max(dx * dx + dy * dy, 1e-12)))
        best = min(best, math.hypot(q[0] - ax - t * dx, q[1] - ay - t * dy))
    return best


def overlaps(poly, rect, margin):
    """Separating-axis test of a convex polygon against an axis-aligned rect grown by margin."""
    x0, x1, y0, y1 = rect[0] - margin, rect[1] + margin, rect[2] - margin, rect[3] + margin
    box = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    for shape in (poly, box):
        for i in range(len(shape)):
            (ax, ay), (bx, by) = shape[i], shape[(i + 1) % len(shape)]
            nx, ny = by - ay, ax - bx
            pa = [nx * x + ny * y for x, y in poly]
            pb = [nx * x + ny * y for x, y in box]
            if max(pa) < min(pb) or max(pb) < min(pa):
                return False
    return True


def checks(plan, items):
    rf = plan["roof"]
    loop = [tuple(q) for q in plan["props"]["roof_planters"]["keep_inside"]]
    clear_m = plan["props"]["roof_furniture"]["clear_of_guard_m"]
    obstacles = [(i["id"], i["rect"], 0.25) for i in plan["props"]["roof_planters"]["islands"]]
    px, py = rf["penthouse_rect"]["x"], rf["penthouse_rect"]["y"]
    an = rf["annex"]
    obstacles += [("penthouse", [px[0], px[1], py[0], py[1]], 0.5), ("annex", [an["x"][0], an["x"][1], an["y"][0], an["y"][1]], 0.5)]
    problems, closest = [], 1e9
    for it in items:
        poly = corners(it)
        for q in poly:
            d = edge_distance(loop, q) if inside(loop, q) else -edge_distance(loop, q)
            closest = min(closest, d)
            if d < clear_m:
                problems.append(f"{it['group']}:{it['kind']} {d:.2f} m from the guard")
                break
        for name, rect, margin in obstacles:
            if overlaps(poly, rect, margin):
                problems.append(f"{it['group']}:{it['kind']} within {margin} m of {name}")
    return problems, closest


def roof_item(it):
    """The terrace's look on a plan item: slat-back dining chairs (one set), the sofa and armchairs on teak frames."""
    it = dict(it)
    if it["kind"] == "dining_chair":
        it.update(variant=ROOF_CHAIR, set=f"roof_{it['group']}")
    elif it["kind"] in ("sofa", "armchair"):
        it["frame"] = "teak"
    return it


def build(plan):
    root = L.ensure_collection(L.ROOT)
    coll = L.ensure_collection(COLLECTION, L.ensure_collection(BP.PARENT, root))
    clear(coll)
    materials()
    rf = plan["props"]["roof_furniture"]
    made, stats = [], []
    for g in rf["groups"]:
        items = [roof_item(it) for it in rf["items"] if it["group"] == g]
        obs, st = furnish(coll, items, f"rb_roof_furniture_{g}", tags, rf["z"])
        made += obs
        stats.append(st)
    problems, closest = checks(plan, rf["items"])
    for p in problems:
        print("WARNING roof furniture:", p)
    return {"collection": COLLECTION, "objects": len(made), "items": len(rf["items"]),
            "meshes": sum(s["meshes"] for s in stats), "tris_placed": sum(s["tris_placed"] for s in stats),
            "tris_stored": sum(s["tris_stored"] for s in stats),
            "kinds": {k: sum(1 for it in rf["items"] if it["kind"] == k) for k in sorted({it["kind"] for it in rf["items"]})},
            "footprint_problems": problems, "closest_to_guard_m": round(closest, 3), "names": [o.name for o in made]}
