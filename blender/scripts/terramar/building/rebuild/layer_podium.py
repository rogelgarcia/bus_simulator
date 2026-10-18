# layer_podium.py -- AI 646: the podium layer of the Terra & Mar rebuild, from plan["podium"].
#
# Run through build.py (layers=podium; needs the structure). Builds RB_PODIUM under its part root:
#   rb_podium_piers       stone (TM_RB_podium_stone): corner piers wrapping the podium's corners, sharp vertical edges
#                         since user fix 1, 2026-10-15 (on the front they reach the entrance volume), and a pier under
#                         every chamfer column; ground and upper storeys
#   rb_podium_lintels     stone bands over the storefronts and over the upper recesses, the entrance's sign band (its
#                         underside wood), and the front centre's upper jambs and the loggia head's body (underside wood)
#   rb_loggia_cover       (user fix 2, 2026-10-15) the curved stone cover over the loggia, its own piece and slot
#                         (TM_RB_cover_stone, no panel joints): in plan a straight front past the wall line (fix 2c)
#                         easing back to each jamb through a quarter clothoid (fix 2d), from the loggia head to the
#                         podium top in the podium roof slab's notch; a thin reveal (a dark backer strip at its floor)
#                         parts it from the jambs and the slab
#   rb_storefront_*       black-steel storefronts (frames, glass) set 0.30 m back: 2-3 large panes, transom band, head
#                         rail (user fix 4, 2026-10-15) under the head panel
#   rb_upper_*            the upper recesses' glazing 0.90 m back (transom 0.6 m below the head)
#   rb_podium_guards      glass guards at the upper recesses' fronts and round the entrance terrace (user fix 8,
#                         2026-10-15: flat panels, a slim post at every glass junction and at the terrace's corners)
#   rb_podium_paving      the upper recesses' floor strips and the entrance terrace (TM_RB_paving)
#   rb_entrance_*         the vestibule's glazing and transom row, and the loggia glazing above (1 m grid; user fix 16,
#                         2026-10-15: entrance_doors.Wall, the two centre bays open, glazing beads on every fixed pane)
#   rb_entrance_doors     (user fix 16: "these must be real doors ... Add handlers, rails, connectors") the vestibule's
#                         pair of glass swing doors with their hardware (entrance_doors.swing_pair), and their glass
#                         rb_entrance_door_glass
#   rb_loggia_sliders     (user fix 16: "in the second floor it can be automatic slide doors") the loggia's bi-parting
#                         automatic sliders onto the floor-1 terrace, header, sensors, guides and seals
#                         (entrance_doors.sliders), and their glass rb_loggia_slider_glass
#   rb_podium_wood        wood linings of the entrance and the loggia, and the wood panels beside the vestibule and
#                         loggia glazing (user fix 4c, 2026-10-15: fix 4b's stone sides reverted, "that stone is not
#                         needed")
#   rb_entrance_band      (user fix 4c) b8's wood cover over the entrance: a thin band across the portal under the sign
#                         band, from the jambs' returns, a little proud of the front stone wall
#   rb_entrance_downlight_<k>  (user fix 4c) the row of small warm downlights in the band's soffit; user fix 17
#                         (2026-10-15): one at the centre of each band plate ("use one light source on each plate,
#                         centralized"), each a linked copy of the building's one spotlight fitting (black trim ring,
#                         warm lens: layer_balconies.fitting(), shared with the balcony soffits)
#   rb_podium_lanterns    small dark lanterns on the entrance jambs and the chamfers' outer piers
# The entrance and loggia wood (linings, panels, the heads' soffits, the band) is TM_RB_veneer (user fix 4c: "a high
# luxury wood"), the materials pass's book-matched teak-walnut veneer under a satin coat; wear class wood_ext.
# User fix 15 (2026-10-15: "if adding subdivision the plates cannot have continuity"): every one of those faces is real
# plates (veneer_box: a 5 mm skin split per plan entrance_detail.veneer_panels, 5 mm reveals onto a dark core,
# TM_RB_veneer_reveal; inside corners and the band's arris stop short, so no plate wraps a corner); each plate's face
# carries its own map and the attributes rb_veneer_w / rb_veneer_seed (dress_panels), so its grain restarts.
#   rb_sign_<line>        TERRA & MAR / COASTAL KITCHEN as real letters (traced from the kit's masks by trace_sign.py,
#                         30 mm deep, 15 mm off the sign band), the kit's maps planar-mapped onto them
# Stone returns (2026-10-14, plan["returns"]): the entrance and loggia openings read as thick stone. Their jambs' front
# corners wrap into the opening (the structure's entrance jambs, the loggia jambs here: return_loop), the sign band and
# the loggia lintel are a stone face slab whose eased underside is the head's return, over a body with a recessed shadow
# gap before the wood soffit; the wood linings start behind a shadow gap whose floor is a dark backer strip.
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
from common.material_catalog import material
BP.add_import_paths(__file__)
import hashlib
import importlib
import math
import os
import random
import sys

import bmesh
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import entrance_doors as D  # noqa: E402
import layer_balconies as B  # noqa: E402  (the building's one downlight fitting, user fix 17)
import layer_materials as M  # noqa: E402
import layer_structure as S  # noqa: E402
import rb_lib as L  # noqa: E402

importlib.reload(L)
importlib.reload(D)
importlib.reload(B)

COLLECTION = "RB_PODIUM"
LAYER = "podium"


def tags(element, name):
    return {"rb_layer": LAYER, "rb_element": element, "tm_element": COLLECTION, "tm_role": element, "rb_name": name}


class Run:
    def __init__(self, r):
        self.p, self.U, self.N, self.length = r["p"], r["along"], r["outward"], r["length"]

    def pt(self, s, v):
        return (self.p[0] + self.U[0] * s + self.N[0] * v, self.p[1] + self.U[1] * s + self.N[1] * v)

    def box(self, s0, s1, v0, v1):
        return [self.pt(s0, v0), self.pt(s1, v0), self.pt(s1, v1), self.pt(s0, v1)]


def rect(x0, x1, y0, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


glass_frame = L.glass_frame                                         # shared with the roof layer (rb_lib)
STONE = "TM_RB_podium_stone"
WOOD = "TM_RB_veneer"                                               # the entrance's luxury wood (user fix 4c)


def eased_slab(loop, z0, z1, mats, top, bottom, arris, eased):
    """A prism (per-edge side materials) whose edges passing eased(p, q) get a chamfer of `arris`: an extra solid for
    pieces_with(), built straight into its bmesh (rb_lib's pieces only extrude plan loops)."""
    def add(bm, slots):
        before = set(bm.verts)
        L._add_solid(bm, slots, [(z0, z1)], [(loop, mats)], [([loop], top, bottom)])
        new = set(bm.verts) - before
        edges = [e for e in bm.edges if e.verts[0] in new and e.verts[1] in new and eased(e.verts[0].co, e.verts[1].co)]
        bmesh.ops.bevel(bm, geom=edges, offset=arris, offset_type="OFFSET", segments=1, profile=0.5, affect="EDGES",
                        clamp_overlap=True, material=slots.index(STONE))
    return add


def pieces_with(name, coll, items, extras, tg):
    """rb_lib.pieces() with extra solids added by callables (bm, slots) -> None."""
    bm = bmesh.new()
    slots = []
    for spans, boundary, regions in items:
        L._add_solid(bm, slots, spans, boundary, regions)
    for add in extras:
        add(bm, slots)
    return L.finish(name, coll, bm, slots, tg)


# ---------------------------------------------------------------- veneer plates (user fix 15, 2026-10-15)

SIDES = ("-x", "+x", "-y", "+y", "-z", "+z")
AXIS = {"x": 0, "y": 1, "z": 2}


def box_item(b, mats):
    """A pieces() item for the axis-aligned box b = ((x0, x1), (y0, y1), (z0, z1)), mats = {side: material}."""
    (x0, x1), (y0, y1), (z0, z1) = b
    loop = rect(x0, x1, y0, y1)                                        # edges: -y, +x, +y, -x
    return ([(z0, z1)], [(loop, [mats["-y"], mats["+x"], mats["+y"], mats["-x"]])], [([loop], mats["+z"], mats["-z"])])


def veneer_box(key, b, faces, vp, out, panels, other=None, core=True):
    """User fix 15 ("if adding subdivision the plates cannot have continuity"): an axis-aligned wood box b whose veneer
    faces are real plates. Each face of `faces` ({"side", "cuts": {axis: joint centres}, "along": the grain's axis,
    "stop": {(axis, 0 | 1)}: the face's edges where it meets another surface square}) gets a skin vp["depth"] thick
    split at its cuts into plates, a reveal vp["reveal"] wide between them; at a `stop` edge (an inside corner: the
    soffit over a wall, the panel beside a lining) and at an edge shared with another veneer face of the box (an outside
    arris: both stop, a square quirk) the plates stop vp["reveal"] short, elsewhere they run flush to the box's edge.
    The plates' faces: the outer one wood, their sides at a joint or stop the reveal's dark slot, at a flush edge wood.
    With `core` the box's inside is a core (the veneer faces' depth in; those faces in the dark slot, the others in
    other[side] or wood); without, the box is the skin alone (the head soffit's plates, on the lintel's dark piece).
    Appends the solids to `out` and a record per plate to `panels` (for dress_panels())."""
    t, r, slot = vp["depth"], vp["reveal"], vp["slot"]
    other = other or {}
    lo, hi = [a for a, _ in b], [h for _, h in b]
    veneer = {f["side"] for f in faces}
    assert len(veneer) == 1 or r >= t - 1e-9, "an outside arris's quirk needs reveal >= depth (the plates would overlap)"
    if core:
        clo, chi = list(lo), list(hi)
        for s in veneer:
            k = AXIS[s[1]]
            if s[0] == "-":
                clo[k] += t
            else:
                chi[k] -= t
        mats = {s: slot if s in veneer else other.get(s, WOOD) for s in SIDES}
        out.append(box_item(tuple(zip(clo, chi)), mats))
    for f in faces:
        n, sgn = AXIS[f["side"][1]], f["side"][0]
        a, c = [k for k in range(3) if k != n]
        stops = set(f.get("stop", ()))
        for k in (a, c):                                               # outside arrises shared with another veneer face
            for end, s in ((0, "-"), (1, "+")):
                if s + "xyz"[k] in veneer:
                    stops.add(("xyz"[k], end))
        p0, p1 = (lo[n], lo[n] + t) if sgn == "-" else (hi[n] - t, hi[n])
        spans = {}
        for k in (a, c):
            ax = "xyz"[k]
            e0 = lo[k] + (r if (ax, 0) in stops else 0.0)
            e1 = hi[k] - (r if (ax, 1) in stops else 0.0)
            cuts = [x for x in f["cuts"].get(ax, []) if e0 + r < x < e1 - r]
            edges = [(e0, (ax, 0) in stops)] + [(x, True) for x in cuts] + [(e1, (ax, 1) in stops)]
            spans[k] = [(edges[i][0] + (r / 2 if 0 < i else 0.0), edges[i + 1][0] - (r / 2 if i + 1 < len(edges) - 1 else 0.0),
                         edges[i][1], edges[i + 1][1]) for i in range(len(edges) - 1)]
        along = AXIS[f["along"]]
        across = c if along == a else a
        for sa in spans[a]:
            for sc in spans[c]:
                plo, phi, mats = [0.0] * 3, [0.0] * 3, {}
                plo[n], phi[n] = p0, p1
                for k, (s0, s1, j0, j1) in ((a, sa), (c, sc)):
                    plo[k], phi[k] = s0, s1
                    mats["-" + "xyz"[k]] = slot if j0 else WOOD
                    mats["+" + "xyz"[k]] = slot if j1 else WOOD
                mats[f["side"]] = WOOD
                mats[("+" if sgn == "-" else "-") + "xyz"[n]] = "TM_RB_hidden"
                out.append(box_item(tuple(zip(plo, phi)), mats))
                i = len(panels)
                rng = random.Random(hashlib.md5(f"{vp['seed']}:{key}:{f['side']}:{i}".encode()).hexdigest())
                panels.append({"lo": plo, "hi": phi, "side": f["side"], "across": across, "along": along,
                               "a0": plo[across], "w": phi[across] - plo[across], "seed": rng.random(),
                               "dv": rng.uniform(0.0, 3.0)})


def dress_panels(ob, panels):
    """User fix 15: each veneer plate's outer face gets its own map: UVs across the grain from the plate's edge (so its
    leaves divide the plate) and along it from a seeded offset, plus the face attributes rb_veneer_w (the plate's width
    across the grain) and rb_veneer_seed, which dress_veneer() reads (grain scale, tone, figure per plate). U / V follow
    the materials pass's box-UV convention (across, along) on walls, (along, across) on soffits. Returns the plates
    matched (one face each)."""
    me = ob.data
    wood = {i for i, m in enumerate(me.materials) if m and m.name == WOOD}
    seed = me.attributes.new("rb_veneer_seed", "FLOAT", "FACE")
    width = me.attributes.new("rb_veneer_w", "FLOAT", "FACE")
    uv = me.uv_layers.active.data
    hit = set()
    for poly in me.polygons:
        if poly.material_index not in wood:
            continue
        c, nrm = poly.center, poly.normal
        for i, p in enumerate(panels):
            k = AXIS[p["side"][1]]
            if (nrm[k] < 0.99 if p["side"][0] == "+" else nrm[k] > -0.99):
                continue
            if all(p["lo"][j] - 1e-4 <= c[j] <= p["hi"][j] + 1e-4 for j in range(3)):
                break
        else:
            continue
        hit.add(i)
        seed.data[poly.index].value = p["seed"]
        width.data[poly.index].value = p["w"]
        flat = abs(nrm.z) > 0.5
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            u, v = co[p["across"]] - p["a0"], co[p["along"]] + p["dv"]
            uv[li].uv = (v, u) if flat else (u, v)
    return len(hit)


def head(x_face, x_body, y_front, y_back, z0, z1, rt, joint, slot, face=True, soffit=None):
    """An opening's stone head (2026-10-14): a face slab rt["return"] deep between the jambs' returns (|x| <= x_face),
    whose eased underside is the head's stone return; it stops `slot` short of each return, a dark joint between their
    eased edges. Behind it the body (|x| <= x_body, back to y_back) with a shadow gap rt["gap"] wide recessed
    rt["gap_depth"] into its underside, then the wood soffit, flush with the return. face=False leaves the face slab's
    place to another piece (the loggia's curved cover). soffit (user fix 15) = (vp, cuts, wood, panels, key): the soffit's
    veneer plates go into the wood object (veneer_box) and the body's lowest piece, `depth` above the return's underside,
    is their dark core. Returns (items, extras) for pieces_with()."""
    x_face -= slot
    yr, yg, d = y_front + rt["return"], y_front + rt["return"] + rt["gap"], rt["gap_depth"]
    hid = "TM_RB_hidden"
    z_wood, under = z0, WOOD
    if soffit is not None:
        vp, cuts, wood, panels, key = soffit
        z_wood, under = z0 + vp["depth"], vp["slot"]
        veneer_box(key, ((-x_body, x_body), (yg, y_back), (z0, z_wood)), [{"side": "-z", "cuts": {"x": cuts},
                   "along": "x"}], vp, wood, panels, core=False)

    def eased(p, q):                                                   # the front's bottom edge and vertical ends
        front = abs(p.y - y_front) < 1e-6 and abs(q.y - y_front) < 1e-6
        return front and ((abs(p.z - z0) < 1e-6 and abs(q.z - z0) < 1e-6) or abs(p.x - q.x) < 1e-6)
    slab = eased_slab(rect(-x_face, x_face, y_front, yr), z0, z1, [STONE, STONE, joint, STONE], hid, STONE,
                      rt["arris"], eased)
    body = [(-x_body, yr), (x_body, yr), (x_body, yg), (x_body, y_back), (-x_body, y_back), (-x_body, yg)]
    upper = ([(z0 + d, z1)], [(body, [hid, hid, hid, STONE, hid, hid])],
             [([rect(-x_body, x_body, yr, yg)], hid, joint), ([rect(-x_body, x_body, yg, y_back)], hid, hid)])
    lower = ([(z_wood, z0 + d)], [(rect(-x_body, x_body, yg, y_back), [WOOD, hid, WOOD, hid])],
             [([rect(-x_body, x_body, yg, y_back)], hid, under)])
    return [upper, lower], [slab] if face else []


def clothoid_corner(projection, segments):
    """A quarter clothoid (user fix 2d) for the cover's right end, from where it leaves the straight front to where it
    meets the wall line square: [((du, dv), (nx, ny))], du along the front from the corner's start, dv back towards the
    wall (0 .. projection), (nx, ny) the outward plan normal. Its curvature grows linearly with arc length from zero,
    so it is tangent and curvature-continuous to the front; the angle is 90° * t^2 over the normalised length t."""
    def at(t, steps=64):                                               # the unit clothoid's point at t (midpoint sums)
        h = t / steps
        th = [math.pi / 2 * (h * (k + 0.5)) ** 2 for k in range(steps)]
        return sum(math.cos(a) for a in th) * h, sum(math.sin(a) for a in th) * h
    scale = projection / at(1.0)[1]
    out = []
    for k in range(segments + 1):
        u = k / segments
        t = (u + math.sqrt(u)) / 2                                     # finer where the curvature is high
        x, y = at(t)
        th = math.pi / 2 * t * t
        out.append(((x * scale, y * scale), (math.sin(th), -math.cos(th))))
    return out


def loggia_cover(coll, c, joint):
    """The loggia's curved cover (user fix 2, 2026-10-15), plan["podium"]["loggia_cover"]: a solid stacked from plan
    rings. In plan it is a straight front `projection` in front of the wall line y_wall (user fix 2c: "it should be
    straight in the middle. but curved on the sides"), easing back at each end through a quarter clothoid (fix 2d: "make
    the curve softer"; clothoid_corner) that meets the jamb square to the wall, then straight back to y_back; one
    curvature sign, no S (fix 2b). Each ring is that outline offset inwards along its normals by the profile's depth at
    its height: the bottom arrises rounded by `round`, the face vertical, the top arrises eased by `ease`. A U of the
    joint material (backer) fills the reveal behind its ends and its back, `reveal_depth` in from the faces."""
    hw, pr, y_wall, yb = c["half_width"], c["projection"], c["y_wall"], c["y_back"]
    (z0, z1), r, e, rv, rd = c["z"], c["round"], c["ease"], c["reveal"], c["reveal_depth"]
    yf = y_wall - pr                                                   # the straight front
    corner = clothoid_corner(pr, c["corner_segments"])
    xs = hw - corner[-1][0][0]                                         # where each corner leaves the straight front
    right = [((xs + du, yf + dv), n) for (du, dv), n in corner]
    left = [((-x, y), (-nx, ny)) for (x, y), (nx, ny) in reversed(right)]
    outline = [((-hw, yb), (-1.0, 0.0))] + left + right + [((hw, yb), (1.0, 0.0))]
    arc = [math.radians(-90.0 - 90.0 * k / 6) for k in range(7)]
    profile = [(r + r * math.cos(a), z0 + r + r * math.sin(a)) for a in arc] + [(0.0, z1 - e), (e, z1)]
    bm = bmesh.new()
    rings = [[bm.verts.new((x - d * nx, y - d * ny, z)) for (x, y), (nx, ny) in outline] for d, z in profile]
    m = len(outline)
    for a, b in zip(rings, rings[1:]):
        for k in range(m):
            bm.faces.new((a[k], a[(k + 1) % m], b[(k + 1) % m], b[k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    slots = [c["slot"]]
    xo = hw + rv                                                        # the jambs' returns, the slab notch's sides
    u = [(-xo, y_wall + rd), (-hw, y_wall + rd), (-hw, yb), (hw, yb), (hw, y_wall + rd), (xo, y_wall + rd),
         (xo, yb + rv), (-xo, yb + rv)]
    L._add_solid(bm, slots, [(z0, z1 - rd)], [(u, joint)], [([u], joint, joint)])
    bm.normal_update()
    return L.finish("rb_loggia_cover", coll, bm, slots, tags("loggia_cover", "rb_loggia_cover"))


def lining(sgn, x_face, y_front, y_end, z0, z1, lw, rt, joint, wood, plates):
    """A jamb's wood lining (lw thick on its face at sgn * x_face) held back behind the stone return by the shadow gap,
    whose floor is a dark backer strip rt["gap_depth"] under the lining's face (2026-10-14). plates (user fix 15) =
    (vp, cuts along y, rows, panels, key): its face is veneer plates, stopping short of the panel behind it and of the
    soffit over it (inside corners)."""
    y0, y1 = y_front + rt["return"], y_front + rt["return"] + rt["gap"]
    x0, x1 = sorted((sgn * x_face, sgn * (x_face - lw)))
    vp, cuts, rows, panels, key = plates
    veneer_box(key, ((x0, x1), (y1, y_end), (z0, z1)), [{"side": "-x" if sgn > 0 else "+x", "along": "z",
               "cuts": {"y": cuts, "z": rows}, "stop": {("y", 1), ("z", 1)}}], vp, wood, panels)
    x0, x1 = sorted((sgn * x_face, sgn * (x_face - lw + rt["gap_depth"])))
    wood.append(L.piece(rect(x0, x1, y0, y1), [(z0, z1)], joint))


def head_band(coll, hb, x_open, y_front, z_top, vp, dl):
    """The entrance's wood cover (user fix 4c, 2026-10-15; b8: a warm wood head band across the portal, a little proud
    of the stone, with small downlights in its soffit): a veneer slab under the sign band (its top on the head's
    underside at z_top), across the opening between the jambs' returns and linings (x_open, the end gap short of them),
    from `projection` in front of the front wall face y_front to `back` behind it, `thickness` deep, the veneer's grain
    running along it; and a row of downlights on its soffit's centre line at the plan's `light_x`. User fix 15: its fascia
    and soffit are veneer plates (vp: the joints at `band` x), with a square quirk at the arris between them; its top,
    back and ends are plain veneer faces of the core. User fix 17: one light at the centre of each plate, each a linked
    copy of the building's spotlight fitting (dl = the plan's balconies downlight), set in a hole of its soffit plate on
    the dark core (layer_balconies.punch: a shadow gap round its trim). Returns (band, lights, plates matched, plates,
    holes)."""
    x = x_open - hb["end_gap"]
    y0, y1 = y_front - hb["projection"], y_front + hb["back"]
    z0 = z_top - hb["thickness"]
    solids, panels = [], []
    cuts = {"x": vp["entrance"]["band"]}
    veneer_box("entrance_band", ((-x, x), (y0, y1), (z0, z_top)), [{"side": "-y", "cuts": cuts, "along": "x"},
                                                                   {"side": "-z", "cuts": cuts, "along": "x"}],
               vp, solids, panels)
    band = L.pieces("rb_entrance_band", coll, solids, tags("podium_wood", "rb_entrance_band"))
    yc = (y0 + y1) / 2
    points = [(lx, yc) for lx in hb["light_x"]]
    bm = bmesh.new()                                                   # user fix 17: the fittings' holes in the plates
    bm.from_mesh(band.data)
    bm.normal_update()
    reveal = [m.name for m in band.data.materials].index(vp["slot"])
    holes = sum(B.punch(bm, p, z0, z0 + vp["depth"], dl, reveal) for p in points)
    bm.to_mesh(band.data)
    bm.free()
    matched = dress_panels(band, panels)
    lamps = B.place_fittings(B.fitting(dl), coll, "rb_entrance_downlight", points, z0 + vp["depth"],
                             tags("downlight", "rb_entrance_downlights"))
    return band, lamps, matched, len(panels), holes


def sign_material(line):
    name = f"TM_RB_sign_{line['name']}"
    mat = bpy.data.materials.get(name)
    if mat is not None:
        bpy.data.materials.remove(mat)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    installed = material(line["installed"])
    files = {"base": "baseColor", "normal": "normal", "arm": "orm"}
    folder = str(installed.folder)

    def image(key, colorspace):
        node = nt.nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(installed.map(files[key]), check_existing=True)
        node.image.colorspace_settings.name = colorspace
        node.extension = "EXTEND"
        return node
    base = image("base", "sRGB")
    nt.links.new(bsdf.inputs["Base Color"], base.outputs["Color"])
    arm = image("arm", "Non-Color")
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(sep.inputs["Color"], arm.outputs["Color"])
    nt.links.new(bsdf.inputs["Roughness"], sep.outputs["Green"])
    nt.links.new(bsdf.inputs["Metallic"], sep.outputs["Blue"])
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(nm.inputs["Color"], image("normal", "Non-Color").outputs["Color"])
    nt.links.new(bsdf.inputs["Normal"], nm.outputs["Normal"])
    mat.diffuse_color = (0.12, 0.10, 0.08, 1.0)
    return mat, folder


def sign_letters(coll, line, sign, front_y):
    """Real letters from the traced outlines: filled, extruded towards the wall, the kit's maps mapped by the card."""
    path = os.path.join(os.environ.get('TERRAMAR_SIGN_ROOT', BP.inputs("terramar/sign")), f"{line['name']}.json")
    if not os.path.exists(path):
        print(f"WARNING sign {line['name']}: {path} missing -- run trace_sign.py first")
        return None
    data = L.C.load_json(path)
    w = line["card_width"]
    tw, th = data["traced_px"]
    h = w * th / tw
    zc, depth = line["centre_z"], sign["depth"]
    y_face = front_y - sign["standoff"] - depth
    to_xyz = lambda u, v: ((u - 0.5) * w, y_face, zc + (v - 0.5) * h)  # noqa: E731
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    for g in data["glyphs"]:
        edges = []
        for loop in [g["outer"]] + g["holes"]:
            vs = [bm.verts.new(to_xyz(u, v)) for u, v in loop]
            edges += [bm.edges.new((vs[i], vs[(i + 1) % len(vs)])) for i in range(len(vs))]
        res = bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=edges)
        faces = [f for f in res["geom"] if isinstance(f, bmesh.types.BMFace)]
        ext = bmesh.ops.extrude_face_region(bm, geom=faces)
        moved = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, vec=(0.0, depth, 0.0), verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces:
        for lp in f.loops:
            co = lp.vert.co
            lp[uv].uv = (co.x / w + 0.5, (co.z - zc) / h + 0.5)
    non_manifold = sum(1 for e in bm.edges if not e.is_manifold)
    me = bpy.data.meshes.new(f"rb_sign_{line['name']}")
    bm.to_mesh(me)
    bm.free()
    mat, folder = sign_material(line)
    me.materials.append(mat)
    ob = bpy.data.objects.new(f"rb_sign_{line['name']}", me)
    for k, v in tags("sign", line["name"]).items():
        ob[k] = v
    ob["rb_sign_maps"] = os.path.relpath(folder, L.C.ROOT).replace("\\", "/")
    coll.objects.link(ob)
    if non_manifold:
        print(f"WARNING rb_sign_{line['name']}: {non_manifold} non-manifold edges")
    return ob


def build(plan):
    coll = L.layer_collection(COLLECTION)
    pd = plan["podium"]
    g = plan["balconies"]                                          # the guards share the balconies' dimensions
    runs = {r["run"]: Run(r) for r in pd["runs"]}
    order = [r["run"] for r in pd["runs"]]
    depth, m, fd = pd["depth"], pd["member"], pd["frame_depth"] / 2
    gd = plan["envelope"]["glass"] / 2                              # glass as thin as the residential glazing
    (z_g0, z_g1), (z_u0, z_u1) = pd["storeys"]["ground"], pd["storeys"]["upper"]
    spans = [(z_g0, z_g1), (z_u0, z_u1)]
    edge = L.ccw([tuple(q) for q in plan["layers"]["podium"]["outline"]])      # sharp corners (user fix 1)
    stone, frames_s, glass_s, frames_u, glass_u, guards, paving, wood = [], [], [], [], [], [], [], []

    # corner piers: along the outline from the previous run's pier face, round the corner, to this run's pier face
    for i, c in enumerate(pd["corners"]):
        prev, cur = runs[order[i - 1]], runs[order[i]]
        a = prev.pt(pd["runs"][i - 1]["corner_pier_faces"][1], 0.0)
        b = cur.pt(pd["runs"][i]["corner_pier_faces"][0], 0.0)
        ring = L.insert_points(edge, [a, b])
        stone.append(L.piece(L.band(L.path(ring, a, b), -depth, 0.0), spans, "TM_RB_podium_stone",
                             mat_top="TM_RB_hidden", mat_bottom="TM_RB_hidden"))
    for cp in pd["column_piers"]:
        stone.append(L.piece(runs[cp["run"]].box(cp["s"][0], cp["s"][1], -depth, 0.0), spans, "TM_RB_podium_stone",
                             mat_top="TM_RB_hidden", mat_bottom="TM_RB_hidden"))

    lintels = []
    sf, up = pd["storefront"], pd["upper"]
    for bay in pd["bays"]:
        r = runs[bay["run"]]
        s0, s1 = bay["s"]
        L_bay = bay["length"]
        lintels.append(L.piece(r.box(s0, s1, -depth, 0.0), [tuple(pd["ground_lintel"])], "TM_RB_podium_stone", mat_top="TM_RB_hidden"))
        lintels.append(L.piece(r.box(s0, s1, -depth, 0.0), [(up["head"], z_u1)], "TM_RB_podium_stone", mat_top="TM_RB_hidden"))
        # storefront at its plane, the head panel above the transom band
        sbox = lambda a, b, r=r, s0=s0: r.box(s0 + a, s0 + b, sf["plane_v"] - fd, sf["plane_v"] + fd)  # noqa: E731
        sgbox = lambda a, b, r=r, s0=s0: r.box(s0 + a, s0 + b, sf["plane_v"] - gd, sf["plane_v"] + gd)  # noqa: E731
        glass_frame([tuple(p) for p in bay["storefront_panes"]], 0.0, L_bay, z_g0, sf["panel"][0], m, sf["sill"],
                    sf["head_rail"], sf["transom_bar"], sbox, sgbox, frames_s, glass_s)   # head rail: user fix 4
        frames_s.append(L.piece(sbox(0.0, L_bay), [(sf["panel"][0], sf["head"][1])], "TM_RB_frame"))
        # upper recess glazing, its paving strip and guard
        ubox = lambda a, b, r=r, s0=s0: r.box(s0 + a, s0 + b, up["plane_v"] - fd, up["plane_v"] + fd)  # noqa: E731
        ugbox = lambda a, b, r=r, s0=s0: r.box(s0 + a, s0 + b, up["plane_v"] - gd, up["plane_v"] + gd)  # noqa: E731
        glass_frame([tuple(p) for p in bay["upper_panes"]], 0.0, L_bay, z_u0, up["head"], m, up["sill"], 0.10,
                    up["transom_bar"], ubox, ugbox, frames_u, glass_u)
        shoe = g["shoe"]["width"] / 2
        paving.append(L.piece(r.box(s0, s1, up["plane_v"] + fd, pd["guard_v"] - shoe), [(z_u0, z_u0 + pd["paving"])],
                              "TM_RB_paving", mat_bottom="TM_RB_hidden"))
        L.guard_along([r.pt(s0, pd["guard_v"]), r.pt(s1, pd["guard_v"])], z_u0, g, guards)

    # the entrance volume (front y_front .. y_back = the podium line), between the structure's jambs (their stone returns
    # reach lw into the opening, flush with the linings); the sign band is a head of stone returns (2026-10-14)
    ent, ed = pd["entrance"], pd["entrance_detail"]
    x_in = ent["half_width"] - ent["jamb"]
    yf, yb = ent["y_front"], ent["y_back"]
    rt = plan["returns"]
    joint = M.joint_slot()
    vy0, vy1 = ed["vestibule_y"]
    lw = ed["wood_lining"]
    slot = plan["materials"]["joints"]["width"] / 2                # the head slab short of the jambs' returns
    vp = ed["veneer_panels"]                                       # user fix 15: every veneer face in plates
    ve, vl, panels = vp["entrance"], vp["loggia"], []
    items, extras = head(x_in - lw, x_in, yf, yb, ed["lintel_bottom"], z_g1, rt, joint, slot,
                         soffit=(vp, ve["soffit"], wood, panels, "entrance_soffit"))
    lintels += items
    for sgn in (-1, 1):
        lining(sgn, x_in, yf, vy0, z_g0, ed["lintel_bottom"], lw, rt, joint, wood,
               (vp, ve["lining"], ve["rows"], panels, f"entrance_lining_{sgn}"))
    grid = ed["grid_x"]
    efr, egl = [], []
    for sgn in (-1, 1):            # wood panels beside the vestibule glazing, to the jambs (fix 4b's stone reverted)
        x0, x1 = sorted((sgn * grid[-1], sgn * x_in))   # fix 15: plates, stopping short of the soffit
        veneer_box(f"entrance_vestibule_{sgn}", ((x0, x1), (vy0, vy1), (z_g0, ed["lintel_bottom"])),
                   [{"side": "-y", "along": "z", "cuts": {"x": [sgn * c for c in ve["vestibule"]], "z": ve["rows"]},
                     "stop": {("z", 1)}}], vp, wood, panels)
    panes = [(grid[k] + (m if k == 0 else m / 2), grid[k + 1] - (m if k == len(grid) - 2 else m / 2)) for k in range(len(grid) - 1)]
    # user fix 16: the two centre bays are a pair of glass swing doors, the transom over them their closers' deep head
    dr = ed["doors"]
    sw = dr["swing"]
    wall = D.Wall(panes, grid[0], grid[-1], (vy0, vy1), gd, z_g0, ed["lintel_bottom"], m, 0.05, 0.06, ed["transom_bar"],
                  dr["bays"], (ed["transom_bar"][0], ed["transom_bar"][0] + sw["head"]))
    fixed = wall.frame(dr["bead"], efr, egl)
    swing = D.swing_pair(wall, sw)
    # the terrace on the entrance volume and its guard, the loggia recess behind it
    lg = ed["loggia"]
    shoe = g["shoe"]["width"] / 2
    gx = ent["half_width"] - abs(pd["guard_v"])
    gy = yf + abs(pd["guard_v"])
    terrace = [(-(gx - shoe), gy + shoe), (gx - shoe, gy + shoe), (gx - shoe, yb), (lg["half_width"] - lw, yb),
               (lg["half_width"] - lw, lg["back_y"][0]), (-(lg["half_width"] - lw), lg["back_y"][0]),
               (-(lg["half_width"] - lw), yb), (-(gx - shoe), yb)]
    paving.append(L.piece(terrace, [(z_u0, z_u0 + pd["paving"])], "TM_RB_paving", mat_bottom="TM_RB_hidden"))
    L.guard_along([(-gx, yb), (-gx, gy), (gx, gy), (gx, yb)], z_u0, g, guards)    # one mitred run round the terrace
    for sgn in (-1, 1):                                            # front centre: stone jambs (their returns) and the loggia
        loop, mats = S.return_loop(sgn * ent["half_width"], sgn * lg["half_width"], yb, yb + depth, lw, rt, STONE, joint)
        lintels.append(([(z_u0, z_u1)], [(loop, mats)], [([loop], "TM_RB_hidden", "TM_RB_hidden")]))
        lining(sgn, lg["half_width"], yb, lg["back_y"][0], z_u0, lg["head"], lw, rt, joint, wood,
               (vp, vl["lining"], vl["rows"], panels, f"loggia_lining_{sgn}"))
        x0, x1 = sorted((sgn * grid[-1], sgn * lg["half_width"]))   # the loggia's wood panels reach the stone jambs
        veneer_box(f"loggia_panel_{sgn}", ((x0, x1), tuple(lg["back_y"]), (z_u0, lg["head"])),
                   [{"side": "-y", "along": "z", "cuts": {"x": [sgn * c for c in vl["panel"]], "z": vl["rows"]},
                     "stop": {("z", 1)}}], vp, wood, panels)
    # the curved cover takes the face slab's place
    items, more = head(lg["half_width"] - lw, lg["half_width"], yb, lg["back_y"][1], lg["head"], z_u1, rt, joint, slot,
                       face=False, soffit=(vp, vl["soffit"], wood, panels, "loggia_soffit"))
    lintels += items
    extras += more
    # user fix 16: the loggia's same two bays are automatic sliders onto the terrace, hung on its face; the opening's
    # head comes down to the operator header's bottom
    sl = dr["slider"]
    wall = D.Wall(panes, grid[0], grid[-1], tuple(lg["back_y"]), gd, z_u0, lg["head"], m, 0.05, 0.06, lg["transom_bar"],
                  dr["bays"], (lg["transom_bar"][1] - sl["header"]["height"], lg["transom_bar"][1]))
    fixed += wall.frame(dr["bead"], efr, egl)
    slide = D.sliders(wall, sl, z_u0 + pd["paving"])

    # lanterns
    ln = pd["lantern"]
    lamps = []
    for lp in pd["lanterns"]:
        n = lp["outward"]
        u = (-n[1], n[0])
        base = (lp["x"], lp["y"])
        at = lambda a, b: (base[0] + u[0] * a + n[0] * b, base[1] + u[1] * a + n[1] * b)  # noqa: E731
        bx = lambda a0, a1, b0, b1: [at(a0, b0), at(a1, b0), at(a1, b1), at(a0, b1)]  # noqa: E731
        z0, z1 = ln["z"]
        hb = ln["bracket"] / 2
        lamps.append(L.piece(bx(-hb, hb, 0.0, ln["offset"]), [(z1 - 0.10, z1 - 0.06)], "TM_RB_frame"))
        lamps.append(L.piece(bx(-ln["body"] / 2, ln["body"] / 2, ln["offset"], ln["offset"] + ln["body"]), [(z0, z1)], "TM_RB_frame"))

    made = []
    for name, items, element in (("rb_podium_piers", stone, "podium_stone"), ("rb_podium_lintels", lintels, "podium_stone"),
                                 ("rb_storefront_frames", frames_s, "podium_frame"), ("rb_storefront_glass", glass_s, "podium_glass"),
                                 ("rb_upper_frames", frames_u, "podium_frame"), ("rb_upper_glass", glass_u, "podium_glass"),
                                 ("rb_entrance_frames", efr, "podium_frame"), ("rb_entrance_glass", egl, "podium_glass"),
                                 ("rb_podium_guards", guards, "guard"), ("rb_podium_paving", paving, "paving"),
                                 ("rb_podium_wood", wood, "podium_wood"), ("rb_podium_lanterns", lamps, "lantern")):
        made.append(pieces_with(name, coll, items, extras if name == "rb_podium_lintels" else [], tags(element, name)))
    for name, glass_name, (items, more, glass, _) in (("rb_entrance_doors", "rb_entrance_door_glass", swing),
                                                      ("rb_loggia_sliders", "rb_loggia_slider_glass", slide)):  # fix 16
        made.append(D.make(name, coll, items, more, tags("podium_frame", name)))
        made.append(D.make(glass_name, coll, glass, [], tags("podium_glass", glass_name)))
    doors = {"swing": swing[3], "slider": slide[3], "fixed_panes": fixed}
    matched = dress_panels(next(o for o in made if o.name == "rb_podium_wood"), panels)       # user fix 15
    made.append(loggia_cover(coll, pd["loggia_cover"], joint))
    band, lamps, band_matched, band_plates, band_holes = head_band(coll, ed["head_band"], x_in - lw, yf,
                                                                   ed["lintel_bottom"], vp, g["downlight"])
    made += [band] + lamps                                                                    # user fix 4c / 15 / 17
    signs = [sign_letters(coll, line, pd["sign"], yf) for line in pd["sign"]["lines"]]
    made += [s for s in signs if s is not None]
    plates = {"wood": len(panels), "wood_matched": matched, "band": band_plates, "band_matched": band_matched,
              "band_light_holes": band_holes}
    if matched != len(panels) or band_matched != band_plates:
        print(f"WARNING podium veneer plates: a plate's face not found {plates}")
    return {"collection": COLLECTION, "objects": len(made), "faces": sum(len(o.data.polygons) for o in made),
            "bays": len(pd["bays"]), "sign_lines": sum(1 for s in signs if s is not None), "veneer_plates": plates,
            "doors": doors,
            "names": [o.name for o in made]}
