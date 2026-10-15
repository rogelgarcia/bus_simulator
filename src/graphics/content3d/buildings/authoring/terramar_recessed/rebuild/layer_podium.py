# layer_podium.py -- AI 646: the podium layer of the Terra & Mar rebuild, from plan["podium"].
#
# Run through build.py (layers=podium; needs the structure). Builds RB_PODIUM under its part root:
#   rb_podium_piers       stone (TM_RB_podium_stone): corner piers wrapping the rounded corners (on the front they reach
#                         the entrance volume) and a pier under every chamfer column; ground and upper storeys
#   rb_podium_lintels     stone bands over the storefronts and over the upper recesses, the entrance's sign band (its
#                         underside wood), and the front centre's upper jambs and loggia lintel (underside wood)
#   rb_storefront_*       black-steel storefronts (frames, glass) set 0.30 m back: 2-3 large panes, transom band, head
#   rb_upper_*            the upper recesses' glazing 0.90 m back (transom 0.6 m below the head)
#   rb_podium_guards      glass guards at the upper recesses' fronts and round the entrance terrace
#   rb_podium_paving      the upper recesses' floor strips and the entrance terrace (TM_RB_paving)
#   rb_entrance_*         the vestibule's doors, sidelights and transom row, and the loggia glazing above (1 m grid)
#   rb_podium_wood        warm wood linings of the vestibule and the loggia, and the wood panels beside their glazing
#   rb_podium_lanterns    small dark lanterns on the entrance jambs and the chamfers' outer piers
#   rb_sign_<line>        TERRA & MAR / COASTAL KITCHEN as real letters (traced from the kit's masks by trace_sign.py,
#                         30 mm deep, 15 mm off the sign band), the kit's maps planar-mapped onto them
# Stone returns (2026-10-14, plan["returns"]): the entrance and loggia openings read as thick stone. Their jambs' front
# corners wrap into the opening (the structure's entrance jambs, the loggia jambs here: return_loop), the sign band and
# the loggia lintel are a stone face slab whose eased underside is the head's return, over a body with a recessed shadow
# gap before the wood soffit; the wood linings start behind a shadow gap whose floor is a dark backer strip.
import importlib
import os
import sys

import bmesh
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import layer_materials as M  # noqa: E402
import layer_structure as S  # noqa: E402
import rb_lib as L  # noqa: E402

importlib.reload(L)

COLLECTION = "RB_PODIUM"
LAYER = "podium"
KIT = os.path.join(L.C.ROOT, "tests", "artifacts", "blender", L.C.BUILDING_ID, "pbr_kit_source", "Terra_Mar_PBR_Kit")


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


def head(x_face, x_body, y_front, y_back, z0, z1, rt, joint, slot):
    """An opening's stone head (2026-10-14): a face slab rt["return"] deep between the jambs' returns (|x| <= x_face),
    whose eased underside is the head's stone return; it stops `slot` short of each return, a dark joint between their
    eased edges. Behind it the body (|x| <= x_body, back to y_back) with a shadow gap rt["gap"] wide recessed
    rt["gap_depth"] into its underside, then the wood soffit, flush with the return. Returns (items, extras) for
    pieces_with()."""
    x_face -= slot
    yr, yg, d = y_front + rt["return"], y_front + rt["return"] + rt["gap"], rt["gap_depth"]
    hid = "TM_RB_hidden"

    def eased(p, q):                                                   # the front's bottom edge and vertical ends
        front = abs(p.y - y_front) < 1e-6 and abs(q.y - y_front) < 1e-6
        return front and ((abs(p.z - z0) < 1e-6 and abs(q.z - z0) < 1e-6) or abs(p.x - q.x) < 1e-6)
    slab = eased_slab(rect(-x_face, x_face, y_front, yr), z0, z1, [STONE, STONE, joint, STONE], hid, STONE,
                      rt["arris"], eased)
    body = [(-x_body, yr), (x_body, yr), (x_body, yg), (x_body, y_back), (-x_body, y_back), (-x_body, yg)]
    upper = ([(z0 + d, z1)], [(body, [hid, hid, hid, STONE, hid, hid])],
             [([rect(-x_body, x_body, yr, yg)], hid, joint), ([rect(-x_body, x_body, yg, y_back)], hid, hid)])
    lower = ([(z0, z0 + d)], [(rect(-x_body, x_body, yg, y_back), ["TM_RB_wood", hid, "TM_RB_wood", hid])],
             [([rect(-x_body, x_body, yg, y_back)], hid, "TM_RB_wood")])
    return [upper, lower], [slab]


def lining(sgn, x_face, y_front, y_end, z0, z1, lw, rt, joint, wood):
    """A jamb's wood lining (lw thick on its face at sgn * x_face) held back behind the stone return by the shadow gap,
    whose floor is a dark backer strip rt["gap_depth"] under the lining's face (2026-10-14)."""
    y0, y1 = y_front + rt["return"], y_front + rt["return"] + rt["gap"]
    x0, x1 = sorted((sgn * x_face, sgn * (x_face - lw)))
    wood.append(L.piece(rect(x0, x1, y1, y_end), [(z0, z1)], "TM_RB_wood"))
    x0, x1 = sorted((sgn * x_face, sgn * (x_face - lw + rt["gap_depth"])))
    wood.append(L.piece(rect(x0, x1, y0, y1), [(z0, z1)], joint))


def sign_material(line):
    name = f"TM_RB_sign_{line['name']}"
    mat = bpy.data.materials.get(name)
    if mat is not None:
        bpy.data.materials.remove(mat)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    installed = os.path.join(L.C.ROOT, "assets", "public", "pbr", line["installed"])
    if os.path.isdir(installed):                                    # AI 640's set: basecolor, normal_gl, arm
        files = {"base": "basecolor.png", "normal": "normal_gl.png", "arm": "arm.png"}
        folder = installed
    else:                                                           # the extracted kit, until AI 640 installs it
        files = {"base": "basecolor.png", "normal": "normal_opengl.png", "rough": "roughness.png", "metal": "metallic.png"}
        folder = os.path.join(KIT, line["kit"])

    def image(key, colorspace):
        node = nt.nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(os.path.join(folder, files[key]), check_existing=True)
        node.image.colorspace_settings.name = colorspace
        node.extension = "EXTEND"
        return node
    base = image("base", "sRGB")
    nt.links.new(bsdf.inputs["Base Color"], base.outputs["Color"])
    if "arm" in files:
        arm = image("arm", "Non-Color")
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(sep.inputs["Color"], arm.outputs["Color"])
        nt.links.new(bsdf.inputs["Roughness"], sep.outputs["Green"])
        nt.links.new(bsdf.inputs["Metallic"], sep.outputs["Blue"])
    else:
        nt.links.new(bsdf.inputs["Roughness"], image("rough", "Non-Color").outputs["Color"])
        nt.links.new(bsdf.inputs["Metallic"], image("metal", "Non-Color").outputs["Color"])
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(nm.inputs["Color"], image("normal", "Non-Color").outputs["Color"])
    nt.links.new(bsdf.inputs["Normal"], nm.outputs["Normal"])
    mat.diffuse_color = (0.12, 0.10, 0.08, 1.0)
    return mat, folder


def sign_letters(coll, line, sign, front_y):
    """Real letters from the traced outlines: filled, extruded towards the wall, the kit's maps mapped by the card."""
    path = os.path.join(L.C.REBUILD_DIR, "sign", f"{line['name']}.json")
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
    edge = L.ccw([tuple(q) for q in plan["layers"]["balcony_edge"]["outline"]])
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
        glass_frame([tuple(p) for p in bay["storefront_panes"]], 0.0, L_bay, z_g0, sf["panel"][0], m, sf["sill"], 0.0,
                    sf["transom_bar"], sbox, sgbox, frames_s, glass_s)
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
    items, extras = head(x_in - lw, x_in, yf, yb, ed["lintel_bottom"], z_g1, rt, joint, slot)
    lintels += items
    for sgn in (-1, 1):
        lining(sgn, x_in, yf, vy0, z_g0, ed["lintel_bottom"], lw, rt, joint, wood)
    grid = ed["grid_x"]
    vbox = lambda a, b: rect(a, b, vy0, vy1)  # noqa: E731
    vmid = (vy0 + vy1) / 2
    vgbox = lambda a, b: rect(a, b, vmid - gd, vmid + gd)  # noqa: E731
    efr, egl = [], []
    for sgn in (-1, 1):                                            # wood panels beside the vestibule glazing, to the jambs
        x0, x1 = sorted((sgn * grid[-1], sgn * x_in))
        wood.append(L.piece(vbox(x0, x1), [(z_g0, ed["lintel_bottom"])], "TM_RB_wood"))
    panes = [(grid[k] + (m if k == 0 else m / 2), grid[k + 1] - (m if k == len(grid) - 2 else m / 2)) for k in range(len(grid) - 1)]
    glass_frame(panes, grid[0], grid[-1], z_g0, ed["lintel_bottom"], m, 0.05, 0.06, ed["transom_bar"], vbox, vgbox, efr, egl)
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
        lining(sgn, lg["half_width"], yb, lg["back_y"][0], z_u0, lg["head"], lw, rt, joint, wood)
        x0, x1 = sorted((sgn * grid[-1], sgn * lg["half_width"]))   # the loggia's wood panels reach the stone jambs
        wood.append(L.piece(rect(x0, x1, lg["back_y"][0], lg["back_y"][1]), [(z_u0, lg["head"])], "TM_RB_wood"))
    items, more = head(lg["half_width"] - lw, lg["half_width"], yb, lg["back_y"][1], lg["head"], z_u1, rt, joint, slot)
    lintels += items
    extras += more
    lbox = lambda a, b: rect(a, b, lg["back_y"][0], lg["back_y"][1])  # noqa: E731
    lmid = (lg["back_y"][0] + lg["back_y"][1]) / 2
    lgbox = lambda a, b: rect(a, b, lmid - gd, lmid + gd)  # noqa: E731
    glass_frame(panes, grid[0], grid[-1], z_u0, lg["head"], m, 0.05, 0.06, lg["transom_bar"], lbox, lgbox, efr, egl)

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
    signs = [sign_letters(coll, line, pd["sign"], yf) for line in pd["sign"]["lines"]]
    made += [s for s in signs if s is not None]
    return {"collection": COLLECTION, "objects": len(made), "faces": sum(len(o.data.polygons) for o in made),
            "bays": len(pd["bays"]), "sign_lines": sum(1 for s in signs if s is not None), "names": [o.name for o in made]}
