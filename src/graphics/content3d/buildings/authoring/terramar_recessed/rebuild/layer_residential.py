# layer_residential.py -- AI 637: residential curtains and furniture, from plan["interior"]["residential"].
#
# Run through build.py (layers=residential; needs the envelope and interior_base layers). Builds RB_INTERIOR/RB_RESIDENTIAL
# under its part root:
#   rb_res_curtains_f<n>   white sheer panels behind every bay's glazing on floor n, hung from the track: a left and a
#                          right panel per span (2026-10-15), each drawn to its own seeded opening (the narrow corner
#                          lights one panel); each panel is a folded sheet (more gathered = deeper, tighter folds) in
#                          TM_RB_sheer (nearly opaque, mostly diffuse, a little translucent)
#   rb_res_tracks          the ceiling tracks the panels hang from, one per glazed span (TM_RB_curtain_track)
#   RB_RESIDENTIAL_FURNITURE/rb_res_furn_f<n>_<k>_<kind>  the seeded lounge, dining and reading sets near the windows:
#                          one object per item, the detailed furniture placed by layer_roof_furniture.furnish (identical
#                          pieces share one mesh; each set's dining chairs match, seeded by the set)
#   rb_res_lamps           a floor lamp with each set: charcoal base and pole, a warm glowing linen drum shade
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
import layer_balcony_plants as BP  # noqa: E402  (plain materials)
import layer_roof_furniture as RF  # noqa: E402  (the detailed furniture's placement and materials)

for mod in (L, BP, RF):
    importlib.reload(mod)

PARENT = "RB_INTERIOR"
COLLECTION = "RB_RESIDENTIAL"
LAYER = "residential"
SHEER = ("TM_RB_sheer", (0.90, 0.89, 0.86), 0.95, 0.12)             # name, fabric colour, opacity (the rest shows
                                                                      # through), translucent share of the cloth
# 2026-10-15: 0.8 opaque and a quarter translucent read as grey glass from b8 (the user circled an A1 bay as having no
# curtains). Under the balcony slabs only daylight from the window side lights a sheer (a pure translucent cloth went
# darker, an opaque diffuse one brightest), so the cloth is now nearly opaque and mostly diffuse.
TRACK = ("TM_RB_curtain_track", (0.80, 0.80, 0.78), 0.4)
SHADE = ("TM_RB_lamp_shade", (0.93, 0.88, 0.78), (1.0, 0.78, 0.50), 10.0)   # linen, warm glow, emission strength


def tags(element, name):
    return {"rb_layer": LAYER, "rb_element": element, "tm_element": COLLECTION, "tm_role": element, "rb_name": name}


def materials():
    name, rgb, opacity, translucent = SHEER
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    clear = nt.nodes.new("ShaderNodeBsdfTransparent")
    diffuse = nt.nodes.new("ShaderNodeBsdfDiffuse")
    diffuse.inputs["Color"].default_value = (*rgb, 1.0)
    through = nt.nodes.new("ShaderNodeBsdfTranslucent")
    through.inputs["Color"].default_value = (*rgb, 1.0)
    cloth = nt.nodes.new("ShaderNodeMixShader")
    cloth.inputs["Fac"].default_value = translucent                     # lit from the window side: mostly diffuse
    nt.links.new(cloth.inputs[1], diffuse.outputs["BSDF"])
    nt.links.new(cloth.inputs[2], through.outputs["BSDF"])
    mix = nt.nodes.new("ShaderNodeMixShader")
    mix.inputs["Fac"].default_value = opacity
    nt.links.new(mix.inputs[1], clear.outputs["BSDF"])
    nt.links.new(mix.inputs[2], cloth.outputs["Shader"])
    nt.links.new(out.inputs["Surface"], mix.outputs["Shader"])
    mat.diffuse_color = (*rgb, opacity)
    BP.plain_material(TRACK[0], TRACK[1], TRACK[2])
    name, rgb, glow, strength = SHADE
    mat = BP.plain_material(name, rgb, 0.9)
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Emission Color"].default_value = (*glow, 1.0)
    bsdf.inputs["Emission Strength"].default_value = strength
    RF.materials()                                                    # the furniture's (and the plain charcoal)


def disc(c, r, n=16):
    return [(c[0] + r * math.cos(2 * math.pi * k / n), c[1] + r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def line(bay):
    (ax, ay), (ux, uy), (ox, oy) = bay["a"], bay["along"], bay["outward"]
    return lambda s, v: (ax + ux * s + ox * v, ay + uy * s + oy * v)


def curtain(bm, slot_index, panel, bay, cfg):
    """A folded sheer panel over [s0, s1] at the curtain line: a sine in plan, deeper at the hem than at the top."""
    pt = line(bay)
    s0, s1 = panel["s"]
    z0, z1 = panel["z"]
    w = s1 - s0
    n = max(2, round(w / cfg["fold_pitch"]))
    lo, hi = cfg["amp"]
    amp = lo + (hi - lo) * min(1.0, max(0.0, 1.0 - w / 2.0))                     # gathered panels fold deeper
    steps = n * 8
    rows = []
    for z, flare in ((z1, 0.85), (z0, 1.15)):
        row = []
        for k in range(steps + 1):
            t = k / steps
            v = cfg["v"] + amp * flare * math.sin(2 * math.pi * (n * t + panel["phase"]))
            x, y = pt(s0 + w * t, v)
            row.append(bm.verts.new((x, y, z)))
        rows.append(row)
    top, bottom = rows
    for k in range(steps):
        f = bm.faces.new((bottom[k], bottom[k + 1], top[k + 1], top[k]))
        f.material_index = slot_index


def lamp_pieces(lamp, cfg):
    c, z = lamp["at"], lamp["z"]
    h, sr, sh, br = cfg["height"], cfg["shade_r"], cfg["shade_h"], cfg["base_r"]
    return [L.piece(disc(c, br, 20), [(z, z + 0.025)], RF.METAL),
            L.piece(disc(c, 0.012, 8), [(z + 0.025, z + h - sh)], RF.METAL),
            L.piece(disc(c, sr, 24), [(z + h - sh, z + h)], SHADE[0])]


def build(plan):
    root = L.ensure_collection(L.ROOT)
    coll = L.ensure_collection(COLLECTION, L.ensure_collection(PARENT, root))
    RF.clear(coll)
    materials()
    rs = plan["interior"]["residential"]
    cfg = rs["config"]
    bays = rs["lines"]
    made = []
    floors = sorted({c["floor"] for c in rs["curtains"]})
    for floor in floors:
        bm = bmesh.new()
        for panel in rs["curtains"]:
            if panel["floor"] == floor:
                curtain(bm, 0, panel, bays[panel["bay"]], cfg["curtain"])
        made.append(L.finish(f"rb_res_curtains_f{floor}", coll, bm, [SHEER[0]], tags("curtain", f"curtains_f{floor}"),
                             smooth_deg=80.0))
    tr, cv = cfg["track"], cfg["curtain"]["v"]
    tracks = []
    for t in rs["tracks"]:
        pt = line(bays[t["bay"]])
        (s0, s1), d = t["s"], tr["depth"] / 2
        tracks.append(L.piece([pt(s0, cv - d), pt(s1, cv - d), pt(s1, cv + d), pt(s0, cv + d)],
                              [(t["z"] - tr["height"], t["z"])], TRACK[0]))
    made.append(L.pieces("rb_res_tracks", coll, tracks, tags("track", "tracks")))
    furn, stats = L.ensure_collection(f"{COLLECTION}_FURNITURE", coll), []
    for floor in floors:
        items = [dict(it, set=it["group"]) for it in rs["items"] if it["group"].startswith(f"f{floor}_")]
        if items:
            obs, st = RF.furnish(furn, items, f"rb_res_furn_f{floor}", tags)
            made += obs
            stats.append(st)
    made.append(L.pieces("rb_res_lamps", coll, [p for lamp in rs["lamps"] for p in lamp_pieces(lamp, cfg["lamp"])],
                         tags("lamp", "lamps")))
    kinds = {}
    for it in rs["items"]:
        kinds[it["kind"]] = kinds.get(it["kind"], 0) + 1
    return {"collection": COLLECTION, "objects": len(made), "curtain_panels": len(rs["curtains"]), "tracks": len(rs["tracks"]),
            "kinds": kinds, "furniture_meshes": sum(s["meshes"] for s in stats),
            "tris_placed": sum(s["tris_placed"] for s in stats), "tris_stored": sum(s["tris_stored"] for s in stats),
            "lamps": len(rs["lamps"]), "skipped_sets": len(rs["skipped_sets"]),
            "patterns_distinct": len({tuple(v) for v in rs["patterns"].values()}) == len(rs["patterns"]),
            "names": [o.name for o in made]}
