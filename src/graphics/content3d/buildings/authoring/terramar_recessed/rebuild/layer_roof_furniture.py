# layer_roof_furniture.py -- AI 630: the roof terrace's furniture after the aerial, from plan["props"]["roof_furniture"].
#
# Run through build.py (layers=roof_furniture; needs the roof and roof_planters layers). Builds RB_PROPS/RB_ROOF_FURNITURE
# under TERRAMAR_REBUILD, one object per group, modelled as prisms in each item's own frame (local +v = its front):
#   rb_roof_furniture_dining        a 2.4 m teak table on charcoal legs and eight chairs (teak seat and back, cushion)
#   rb_roof_furniture_lounge        a three-seat sofa, two armchairs (teak frames, cushions), a coffee table, side tables
#   rb_roof_furniture_front_centre  two armchairs round a low table, two sun loungers with a raised back
# Materials: TM_RB_teak, TM_RB_cushion_<offwhite|ecru|greige> (the group's seeded tone), TM_RB_charcoal_metal.
# The paving tiles are the materials pass's roof_paving family on the deck's own face set (TM_RB_roof_paving).
# Every object is tagged rb_hide_from_b8: check_layers.py renders them red from CAM_B8 and must find 0 pixels. The layer
# also checks each footprint: at least clear_of_guard_m inside the guard shoe's inner line, clear of AI 629's islands and
# of the penthouse and its annex.
import importlib
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import rb_lib as L  # noqa: E402
import layer_balcony_plants as BP  # noqa: E402  (PARENT, plain materials)

importlib.reload(L)
importlib.reload(BP)

COLLECTION = "RB_ROOF_FURNITURE"
LAYER = "roof_furniture"
TEAK, METAL = "TM_RB_teak", "TM_RB_charcoal_metal"
LOOKS = {TEAK: ((0.30, 0.165, 0.085), 0.55), METAL: ((0.045, 0.045, 0.05), 0.40),
         "TM_RB_cushion_offwhite": ((0.80, 0.78, 0.73), 0.90), "TM_RB_cushion_ecru": ((0.76, 0.71, 0.61), 0.90),
         "TM_RB_cushion_greige": ((0.62, 0.59, 0.54), 0.90)}


def tags(element, name):
    return {"rb_layer": LAYER, "rb_element": element, "tm_element": COLLECTION, "tm_role": element, "rb_name": name,
            "rb_hide_from_b8": True}


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

    def disc(self, r, n=20):
        return [self.pt(r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def legs(fr, z0, z1, w, d, inset, size, out):
    for su in (-1, 1):
        for sv in (-1, 1):
            cu, cv = su * (w / 2 - inset), sv * (d / 2 - inset)
            out.append(L.piece(fr.box(cu - size / 2, cu + size / 2, cv - size / 2, cv + size / 2), [(z0, z1)], METAL))


def model(item, z):
    """The item's pieces (L.pieces items)."""
    fr = Frame(item)
    w, d = item["size"]
    cushion = f"TM_RB_cushion_{item['cushion']}"
    k, out = item["kind"], []
    if k in ("dining_table", "coffee_table", "low_table"):
        h = {"dining_table": 0.74, "coffee_table": 0.38, "low_table": 0.40}[k]
        out.append(L.piece(fr.box(-w / 2, w / 2, -d / 2, d / 2), [(z + h - 0.04, z + h)], TEAK))
        legs(fr, z, z + h - 0.04, w, d, 0.10, 0.06 if k == "dining_table" else 0.04, out)
    elif k == "side_table":
        out.append(L.piece(fr.disc(w / 2), [(z + 0.48, z + 0.51)], TEAK))
        out.append(L.piece(fr.disc(0.025, 10), [(z + 0.02, z + 0.48)], METAL))
        out.append(L.piece(fr.disc(0.16), [(z, z + 0.02)], METAL))
    elif k == "dining_chair":
        legs(fr, z, z + 0.43, w, d, 0.03, 0.03, out)
        out.append(L.piece(fr.box(-w / 2, w / 2, -d / 2, d / 2), [(z + 0.43, z + 0.46)], TEAK))
        out.append(L.piece(fr.box(-w / 2 + 0.02, w / 2 - 0.02, -d / 2 + 0.06, d / 2 - 0.02), [(z + 0.46, z + 0.50)], cushion))
        out.append(L.piece(fr.box(-w / 2, w / 2, -d / 2, -d / 2 + 0.04), [(z + 0.46, z + 0.86)], TEAK))
    elif k in ("sofa", "armchair"):
        legs(fr, z, z + 0.10, w, d, 0.06, 0.05, out)
        out.append(L.piece(fr.box(-w / 2, w / 2, -d / 2, d / 2), [(z + 0.10, z + 0.36)], TEAK))
        arm = 0.12
        out.append(L.piece(fr.box(-w / 2 + arm, w / 2 - arm, -d / 2 + 0.20, d / 2), [(z + 0.36, z + 0.50)], cushion))
        out.append(L.piece(fr.box(-w / 2 + arm, w / 2 - arm, -d / 2, -d / 2 + 0.20), [(z + 0.36, z + 0.80)], cushion))
        for u0 in (-w / 2, w / 2 - arm):
            out.append(L.piece(fr.box(u0, u0 + arm, -d / 2, d / 2), [(z + 0.36, z + 0.60)], TEAK))
    elif k == "lounger":
        legs(fr, z, z + 0.22, w, d, 0.06, 0.04, out)
        out.append(L.piece(fr.box(-w / 2, w / 2, -d / 2, d / 2), [(z + 0.22, z + 0.32)], TEAK))
        out.append(L.piece(fr.box(-w / 2 + 0.03, w / 2 - 0.03, -d / 2 + 0.03, d / 2 - 0.58), [(z + 0.32, z + 0.38)], cushion))
        out.append(L.piece(fr.box(-w / 2 + 0.03, w / 2 - 0.03, d / 2 - 0.55, d / 2 - 0.03), [(z + 0.32, z + 0.68)], cushion))
    else:
        raise ValueError(f"unknown furniture kind {k}")
    return out


def corners(item):
    fr = Frame(item)
    w, d = item["size"]
    return fr.box(-w / 2, w / 2, -d / 2, d / 2)


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
    clear = plan["props"]["roof_furniture"]["clear_of_guard_m"]
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
            if d < clear:
                problems.append(f"{it['group']}:{it['kind']} {d:.2f} m from the guard")
                break
        for name, rect, margin in obstacles:
            if overlaps(poly, rect, margin):
                problems.append(f"{it['group']}:{it['kind']} within {margin} m of {name}")
    return problems, closest


def build(plan):
    root = L.ensure_collection(L.ROOT)
    coll = L.ensure_collection(COLLECTION, L.ensure_collection(BP.PARENT, root))
    L.clear_collection(coll)
    for name, (rgb, rough) in LOOKS.items():
        mat = BP.plain_material(name, rgb, rough)
        if name == METAL:                                             # a satin powder-coated metal
            next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Metallic"].default_value = 0.3
    rf = plan["props"]["roof_furniture"]
    made = []
    for g in rf["groups"]:
        items = [it for it in rf["items"] if it["group"] == g]
        pieces = [p for it in items for p in model(it, rf["z"])]
        made.append(L.pieces(f"rb_roof_furniture_{g}", coll, pieces, tags("furniture", g)))
    problems, closest = checks(plan, rf["items"])
    for p in problems:
        print("WARNING roof furniture:", p)
    return {"collection": COLLECTION, "objects": len(made), "items": len(rf["items"]),
            "kinds": {k: sum(1 for it in rf["items"] if it["kind"] == k) for k in sorted({it["kind"] for it in rf["items"]})},
            "footprint_problems": problems, "closest_to_guard_m": round(closest, 3), "names": [o.name for o in made]}
