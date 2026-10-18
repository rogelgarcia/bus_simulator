# import_baseline.py -- build the Terra & Mar (recessed balconies) Blender baseline from the game export (AI 614).
#
#   blender -b -P import_baseline.py            headless, from a clean session
#   exec in the headed session (MCP):            exec(compile(open(p).read(), p, 'exec'), {'__file__': p, '__name__': '__main__'})
#
# Reads the GLB + JSON manifest written by tests/headless/visual/specs/terramar_recessed_blender_export.pwtest.js
# (tests/artifacts/blender/terramar_recessed/before/) and writes terramar_recessed_before.blend beside them, plus a
# parity report (.parity.json). The model is the game's, as extracted: nothing is remodelled, only
#   - re-framed: the showcase build-site offset is removed (config origin = Blender origin, front A faces -Y);
#   - organized: one TERRAMAR collection with element collections, each object tagged with its manifest data;
#   - cleaned up: the export's 143 per-part materials are the same 14 materials over and over (same colour, maps
#     and tiling), so each set becomes one material named by family (TM_limestone, TM_glass_residential, ...);
#   - relinked: packed textures point at the game's own files under assets/ (link_textures.py);
#   - rigged: an INSPECTION_RIG collection with the game's HDRI, its sun and the cameras of rig_cameras.json.
# The session it runs in is CLEARED first (every object, material, image ...), so run it in an empty session.
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
import bpy
import importlib
import json
import logging
import math
import os
import re
import sys

from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import tm_common as C          # noqa: E402
import link_textures           # noqa: E402
importlib.reload(C)
importlib.reload(link_textures)

LEVELS = ("L0_GROUND", "L1_PODIUM", "L2_RESIDENTIAL", "L3_PENTHOUSE")

# Material families: (asset folder or None, colour hex) -> readable name. Anything else gets an automatic name.
FAMILIES = {
    ("limestone_smooth", "e3d7bd"): "TM_limestone",
    ("limestone_smooth", "ffffff"): "TM_limestone_plain",
    ("painted_plaster_wall", "ffffff"): "TM_interior_plaster",
    ("seaworn_sandstone_brick", "b77948"): "TM_warm_reveal_brick",
    ("rough_concrete", "ffffff"): "TM_roof_concrete",
    (None, "f3f1ea"): "TM_window_shade",
    (None, "292c2b"): "TM_frame_charcoal",
    (None, "d3e4e4"): "TM_glass_storefront",
    (None, "a2c4c7"): "TM_glass_residential",
    (None, "b4ccd0"): "TM_glass_balcony_guard",
    (None, "858d91"): "TM_metal_handle",
    (None, "8b5a3c"): "TM_lettering",
    (None, "343735"): "TM_rail_charcoal",
    (None, "2a2d31"): "TM_rail_dark",
}


# ----------------------------------------------------------------------------------------------------------- session
def clear_session():
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)
    for datablocks in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.cameras,
                       bpy.data.lights, bpy.data.worlds, bpy.data.node_groups, bpy.data.curves, bpy.data.textures):
        for db in list(datablocks):
            datablocks.remove(db)
    scene = bpy.context.scene
    scene.name = "TERRAMAR_BASELINE"


def import_glb():
    logging.getLogger('glTFImporter').setLevel(logging.WARNING)
    logging.getLogger('io_import_scene_gltf2').setLevel(logging.WARNING)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=C.GLB, merge_vertices=False)
    return [o for o in bpy.data.objects if o not in before]


# -------------------------------------------------------------------------------------------------------- framing
def reframe(objs, shift):
    """Unparent every mesh (keeping its world matrix), drop the importer's empties, remove the build-site offset."""
    bpy.context.view_layer.update()
    t = Matrix.Translation(Vector(shift))
    meshes = [o for o in objs if o.type == 'MESH']
    worlds = {o.name: o.matrix_world.copy() for o in meshes}
    for o in meshes:
        o.parent = None
        o.matrix_world = t @ worlds[o.name]
    for o in [o for o in objs if o.type != 'MESH']:
        bpy.data.objects.remove(o)
    bpy.context.view_layer.update()
    return meshes


# ----------------------------------------------------------------------------------------------------- organizing
def level_tops(manifest):
    """The top (three.js y) of each occupied level, read off the four wall shells, bottom to top."""
    walls = sorted((p for p in manifest["parts"] if p["role"] == "wall"), key=lambda p: p["bounds"]["min"][1])
    assert len(walls) == len(LEVELS), f"expected {len(LEVELS)} wall shells, got {len(walls)}"
    return [w["bounds"]["max"][1] for w in walls]


def level_of(part, tops):
    cy = 0.5 * (part["bounds"]["min"][1] + part["bounds"]["max"][1])
    for name, top in zip(LEVELS, tops):
        if cy <= top + 0.01:
            return name
    return LEVELS[-1]


def element_of(part, level):
    role, tags = part["role"], part.get("tags") or {}
    if role == "wall":
        return "TM_WALLS"
    if role == "roof" or part.get("parentName") == "roof_rings":
        return "TM_ROOFS"
    if role == "facade_lettering":
        return "TM_SIGNAGE"
    if tags.get("buildingWindowPart") == "shade" and (part.get("shade") or {}).get("coverage", 1.0) <= 0.001:
        return "TM_WINDOWS_SHADES_HIDDEN"     # the game's shader discards a shade with zero coverage entirely
    if tags.get("buildingWindowPart"):
        return f"TM_WINDOWS_{level}"
    if role.startswith("balcony_"):
        if tags.get("balconyContinuity"):
            return "TM_BALCONIES_LINKED_CORNERS"
        if tags.get("balconyPlacement") == "projecting":
            return "TM_BALCONIES_PODIUM_TERRACE"
        return "TM_BALCONIES_LOGGIAS"
    if role == "interior":
        return "TM_INTERIORS"
    if role == "mesh" and part.get("parentName") == "belts":
        return "TM_BELTS"
    return "TM_OTHER"


def build_collections():
    scene_root = bpy.context.scene.collection
    root = bpy.data.collections.new("TERRAMAR")
    scene_root.children.link(root)
    made = {"TERRAMAR": root}

    def child(parent, name):
        c = bpy.data.collections.new(name)
        made[parent].children.link(c)
        made[name] = c

    for name in ("TM_WALLS", "TM_BELTS", "TM_ROOFS", "TM_SIGNAGE", "TM_WINDOWS", "TM_BALCONIES", "TM_INTERIORS", "TM_OTHER"):
        child("TERRAMAR", name)
    for lv in LEVELS:
        child("TM_WINDOWS", f"TM_WINDOWS_{lv}")
    child("TM_WINDOWS", "TM_WINDOWS_SHADES_HIDDEN")
    made["TM_WINDOWS_SHADES_HIDDEN"].hide_render = True
    made["TM_WINDOWS_SHADES_HIDDEN"].hide_viewport = True
    for name in ("TM_BALCONIES_PODIUM_TERRACE", "TM_BALCONIES_LOGGIAS", "TM_BALCONIES_LINKED_CORNERS"):
        child("TM_BALCONIES", name)
    rig = bpy.data.collections.new("INSPECTION_RIG")
    scene_root.children.link(rig)
    made["INSPECTION_RIG"] = rig
    return made


def organize(meshes, manifest, colls):
    by_name = {p["name"]: p for p in manifest["parts"]}
    tops = level_tops(manifest)
    missing, partial_shades = [], []
    for o in meshes:
        part = by_name.get(o.name)
        if part is None:
            missing.append(o.name)
            target = "TM_OTHER"
        else:
            level = level_of(part, tops)
            target = element_of(part, level)
            o["tm_role"] = part["role"]
            o["tm_level"] = level
            o["tm_element"] = target
            o["tm_tags"] = json.dumps(part.get("tags") or {}, sort_keys=True)
            shade = part.get("shade") if (part.get("tags") or {}).get("buildingWindowPart") == "shade" else None
            if shade:
                o["tm_shade_coverage"] = float(shade["coverage"])
                if shade["coverage"] > 0.001:
                    partial_shades.append(o.name)        # drawn in part by the game's shader: not reproduced here
            if part.get("letteringText"):
                o["tm_lettering_text"] = part["letteringText"]
            if o.data and o.data.users == 1:         # repeated parts share one mesh (the exporter reuses geometry)
                o.data.name = o.name
        for c in list(o.users_collection):
            c.objects.unlink(o)
        colls[target].objects.link(o)
    for name in ("TM_OTHER",):
        if not colls[name].objects:
            bpy.data.collections.remove(colls.pop(name))
    return {"unmatched_objects": missing, "level_tops_three_y": tops, "shades_partially_drawn_not_reproduced": partial_shades}


# ------------------------------------------------------------------------------------------------------ materials
def _folder(info):
    p = C.url_to_path((info or {}).get("url"))
    if not p:
        return None
    parts = p.replace("\\", "/").split("/")
    return parts[parts.index("pbr") + 1] if "pbr" in parts else None


def _signature(row):
    maps = row.get("maps") or {}
    transforms = tuple(sorted((k, tuple(v.get("repeat") or ()), tuple(v.get("offset") or ()), v.get("rotation")) for k, v in maps.items()))
    files = tuple(sorted((k, v.get("url") or f"runtime:{v.get('width')}x{v.get('height')}") for k, v in maps.items()))
    return (row["sourceType"], row.get("color"), row.get("transmission"), row.get("opacity"), row.get("transparent"),
            row.get("roughness"), row.get("metalness"), files, transforms)


def dedupe_materials(manifest):
    groups = {}
    for row in manifest["materials"]:
        groups.setdefault(_signature(row), []).append(row)
    remap, families = {}, []
    used_names = set()
    for sig, rows in groups.items():
        first = rows[0]
        folder = _folder((first.get("maps") or {}).get("map"))
        name = FAMILIES.get((folder, first.get("color")))
        if not name:
            name = f"TM_{folder or first['sourceType'].replace('Material', '').lower()}_{first.get('color')}"
        base, k = name, 2
        while name in used_names:
            name, k = f"{base}_{k}", k + 1
        used_names.add(name)
        canonical = bpy.data.materials.get(first["exportName"])
        assert canonical is not None, f"material {first['exportName']} not imported"
        for row in rows:
            remap[row["exportName"]] = canonical
        canonical.name = name
        canonical["tm_source_color"] = first.get("color") or ""
        canonical["tm_source_asset"] = folder or ""
        families.append({"name": name, "merged": len(rows), "asset": folder, "color": first.get("color"),
                         "type": first["sourceType"], "transmission": first.get("transmission"), "opacity": first.get("opacity")})
    replaced = 0
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        for slot in o.material_slots:
            m = slot.material
            if m is None:
                continue
            key = m.name if m.name in remap else re.sub(r"\.\d{3}$", "", m.name)   # importer variants (.001)
            target = remap.get(key)
            if target is not None and target is not m:
                slot.material = target
                replaced += 1
    removed = 0
    keep = set(id(m) for m in remap.values())
    for m in list(bpy.data.materials):
        if id(m) not in keep and m.users == 0:
            bpy.data.materials.remove(m)
            removed += 1
    return {"families": families, "slots_replaced": replaced, "materials_removed": removed}


# ------------------------------------------------------------------------------------------------------------ rig
def three_sun_to_blender(az_deg, el_deg):
    az, el = math.radians(az_deg), math.radians(el_deg)
    x, y, z = math.cos(az) * math.cos(el), math.sin(el), math.sin(az) * math.cos(el)
    return Vector((x, -z, y)).normalized()


def hdri_sun_azimuth(image):
    """Blender world azimuth (atan2(y, x), degrees) of the HDRI's brightest 0.005% texels with no world rotation."""
    import numpy as np
    w, h = image.size
    px = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    lum = px.reshape(h, w, 4)[:, :, :3].mean(axis=2)
    n = max(8, int(lum.size * 0.00005))
    idx = np.argpartition(lum.ravel(), -n)[-n:]
    rows, cols = np.unravel_index(idx, lum.shape)
    u = (cols + 0.5) / w
    v = (rows + 0.5) / h                       # Blender pixel rows run bottom up
    az = (0.5 - u) * 2 * math.pi               # u = 0.5 - atan2(y, x) / 2pi
    el = (v - 0.5) * math.pi
    d = np.stack([np.cos(az) * np.cos(el), np.sin(az) * np.cos(el), np.sin(el)], axis=1).mean(axis=0)
    return math.degrees(math.atan2(d[1], d[0])), math.degrees(math.asin(d[2] / np.linalg.norm(d)))


def build_rig(colls, rig):
    """The game's calibrated daylight in Cycles: the same disc-free sky file, one sun lamp carrying the game's
    sunNormalRgb (W/m^2 per channel, colour x strength) and the game's exposure as film exposure in stops."""
    scene = bpy.context.scene
    coll = colls["INSPECTION_RIG"]
    lit = rig["lighting"]
    hdri = os.path.join(C.ROOT, *lit["hdri"].split("/"))
    sun_dir = three_sun_to_blender(lit["sun_azimuth_deg"], lit["sun_elevation_deg"])
    rgb = lit["sun_normal_rgb"]
    peak = max(rgb)
    sun_data = bpy.data.lights.new("RIG_SUN", 'SUN')
    sun_data.energy = peak
    sun_data.color = tuple(c / peak for c in rgb)
    sun_data.angle = math.radians(lit["sun_angular_diameter_deg"])
    sun = bpy.data.objects.new("RIG_SUN", sun_data)
    sun.rotation_euler = sun_dir.to_track_quat('Z', 'Y').to_euler()
    coll.objects.link(sun)

    world = bpy.data.worlds.new("TM_WORLD")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    coord = nt.nodes.new('ShaderNodeTexCoord')
    mapping = nt.nodes.new('ShaderNodeMapping')
    env = nt.nodes.new('ShaderNodeTexEnvironment')
    bg = nt.nodes.new('ShaderNodeBackground')
    out = nt.nodes.new('ShaderNodeOutputWorld')
    for i, nd in enumerate((coord, mapping, env, bg, out)):
        nd.location = (i * 260 - 600, 0)
    env.image = bpy.data.images.load(hdri, check_existing=True)
    env.image.filepath = bpy.path.relpath(hdri)
    nt.links.new(mapping.inputs["Vector"], coord.outputs["Generated"])
    nt.links.new(env.inputs["Vector"], mapping.outputs["Vector"])
    nt.links.new(bg.inputs["Color"], env.outputs["Color"])
    nt.links.new(out.inputs["Surface"], bg.outputs["Background"])
    bg.inputs["Strength"].default_value = lit["hdri_strength"]
    # Turn the sky so its own sun stands at the lamp's azimuth: a texel at map azimuth a is seen at a - rot.
    map_az, map_el = hdri_sun_azimuth(env.image)
    lamp_az = math.degrees(math.atan2(sun_dir.y, sun_dir.x))
    rot = map_az - lamp_az
    mapping.inputs["Rotation"].default_value[2] = math.radians(rot)

    # A plain ground under the building (the game stands it on grass): it takes the contact shadow. Rig only, so
    # a scene that links the TERRAMAR collection does not inherit it.
    ground_me = bpy.data.meshes.new("RIG_GROUND")
    s = 200.0
    ground_me.from_pydata([(-s, -s, 0.0), (s, -s, 0.0), (s, s, 0.0), (-s, s, 0.0)], [], [(0, 1, 2, 3)])
    ground_mat = bpy.data.materials.new("RIG_ground_grass_tone")
    ground_mat.use_nodes = True
    gb = ground_mat.node_tree.nodes.get("Principled BSDF")
    gb.inputs["Base Color"].default_value = (0.16, 0.2, 0.06, 1.0)
    gb.inputs["Roughness"].default_value = 0.95
    ground_me.materials.append(ground_mat)
    ground = bpy.data.objects.new("RIG_GROUND", ground_me)
    coll.objects.link(ground)

    cams = []
    for spec in rig["cameras"]:
        data = bpy.data.cameras.new(spec["name"])
        data.sensor_fit = 'VERTICAL'
        data.angle_y = math.radians(spec["vfov_deg"])
        data.clip_start, data.clip_end = 0.1, 2000.0
        cam = bpy.data.objects.new(spec["name"], data)
        loc, tgt = Vector(spec["location"]), Vector(spec["target"])
        cam.location = loc
        cam.rotation_euler = (tgt - loc).to_track_quat('-Z', 'Y').to_euler()
        cam["tm_resolution"] = list(spec["resolution"])
        cam["tm_reference"] = spec.get("reference") or ""
        cam["tm_label"] = spec.get("label") or ""
        coll.objects.link(cam)
        cams.append(cam)
    scene.camera = cams[0]
    w, h = rig["cameras"][0]["resolution"]
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = w, h, 100
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.exposure = math.log2(lit["exposure"])
    scene.unit_settings.system = 'METRIC'
    return {"hdri": lit["hdri"], "sun_strength": peak, "sun_color": list(sun_data.color), "film_exposure_stops": round(math.log2(lit["exposure"]), 3),
            "sun_direction": list(sun_dir), "hdri_sun_map_azimuth_deg": round(map_az, 2), "hdri_sun_elevation_deg": round(map_el, 2),
            "lamp_azimuth_deg": round(lamp_az, 2), "world_rotation_z_deg": round(rot, 2), "cameras": [c.name for c in cams]}


# --------------------------------------------------------------------------------------------------------- parity
def parity(manifest, colls, tex):
    bpy.context.view_layer.update()
    objs = [o for o in colls["TERRAMAR"].all_objects if o.type == 'MESH']
    tris = 0
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in objs:
        me = o.data
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)
        mw = o.matrix_world
        for v in me.vertices:
            p = mw @ v.co
            lo = Vector(map(min, lo, p))
            hi = Vector(map(max, hi, p))
    roles_manifest = set(manifest["roleCounts"].keys())
    roles_blend = set(o.get("tm_role") for o in objs if o.get("tm_role"))

    def glass_info(m):
        bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if m and m.node_tree else None
        if not bsdf:
            return None
        tw = bsdf.inputs.get("Transmission Weight")
        a = bsdf.inputs.get("Alpha")
        return {"transmission_weight": round(float(tw.default_value), 3) if tw is not None else None,
                "alpha": round(float(a.default_value), 3) if a is not None else None,
                "ior": round(float(bsdf.inputs["IOR"].default_value), 3)}
    glass = {m.name: glass_info(m) for m in bpy.data.materials if m.name.startswith("TM_glass")}
    glass_ok = all(g and ((g["transmission_weight"] or 0) > 0.2 or (g["alpha"] or 1) < 0.9) for g in glass.values()) and len(glass) == 3

    lettering = sorted(o.get("tm_lettering_text") for o in colls["TM_SIGNAGE"].objects if o.get("tm_lettering_text"))

    def horizontal_directions(o):
        dirs = set()
        mw = o.matrix_world
        for e in o.data.edges:
            a, b = mw @ o.data.vertices[e.vertices[0]].co, mw @ o.data.vertices[e.vertices[1]].co
            d = Vector((b.x - a.x, b.y - a.y))
            if d.length > 0.02 and abs(b.z - a.z) < 0.01:
                ang = round(math.degrees(math.atan2(d.y, d.x)) % 180.0)
                dirs.add(ang)
        return len(dirs)
    corner_rails = [o for o in colls["TM_BALCONIES_LINKED_CORNERS"].objects if o.get("tm_role") == "balcony_railing"]
    corner_dirs = [horizontal_directions(o) for o in corner_rails]
    packed = [{"image": i.name, "size": list(i.size)} for i in bpy.data.images if i.packed_file]

    size = hi - lo
    report = {
        "objects": {"blender": len(objs), "manifest": manifest["meshCount"], "ok": len(objs) == manifest["meshCount"]},
        "triangles": {"blender": tris, "manifest": manifest["triangles"], "ok": tris == manifest["triangles"]},
        "roles": {"manifest": sorted(roles_manifest), "blender": sorted(roles_blend), "ok": roles_manifest == roles_blend},
        "bounds_blender": {"min": [round(x, 3) for x in lo], "max": [round(x, 3) for x in hi],
                           "size": [round(x, 3) for x in size]},
        "spec_comparison": {
            "podium_plan_m": {"spec": [28.0, 22.0], "game": [round(size.x, 3), round(size.y, 3)],
                              "note": "game includes the 1.15 m entrance projection and belt/cornice overhangs"},
            "top_z_m": {"spec_occupied_stack": 29.45, "spec_visual_top": 31.0, "game_base": round(lo.z, 3), "game_top": round(hi.z, 3)},
        },
        "glass": {"materials": glass, "ok": glass_ok},
        "lettering": {"texts": lettering, "ok": lettering == ["COASTAL KITCHEN", "TERRA & MAR"]},
        "rounded_corners": {"linked_corner_rails": len(corner_rails), "horizontal_edge_directions_min": min(corner_dirs) if corner_dirs else 0,
                            "ok": bool(corner_rails) and min(corner_dirs) > 4},
        "textures": {"linked": len(tex["linked"]), "still_packed": packed,
                     "ok": all(i["size"][0] <= 256 and i["size"][1] <= 256 for i in packed)},
    }
    report["all_ok"] = all(v.get("ok", True) for v in report.values() if isinstance(v, dict))
    return report


# ----------------------------------------------------------------------------------------------------------- main
def main():
    manifest = C.load_manifest()
    rig = C.load_rig()
    assert manifest["buildingId"] == C.BUILDING_ID
    clear_session()
    tmp = C.BASELINE.replace(".blend", ".building.blend")
    bpy.ops.wm.save_as_mainfile(filepath=tmp)          # a path beside the baseline, so relative paths are final
    objs = import_glb()
    meshes = reframe(objs, C.placement_shift(manifest))
    colls = build_collections()
    org = organize(meshes, manifest, colls)
    mats = dedupe_materials(manifest)
    tex = link_textures.link_to_game_assets(manifest)
    rig_info = build_rig(colls, rig)
    report = parity(manifest, colls, tex)
    report["shades"] = {"hidden_zero_coverage": len(colls["TM_WINDOWS_SHADES_HIDDEN"].objects),
                        "partially_drawn_not_reproduced": org["shades_partially_drawn_not_reproduced"],
                        "ok": not org["shades_partially_drawn_not_reproduced"]}
    report["all_ok"] = all(v.get("ok", True) for v in report.values() if isinstance(v, dict))
    report.update({"export": {"glb": os.path.relpath(C.GLB, C.ROOT), "manifest_exported_at": manifest.get("exportedAt"),
                              "placement": manifest.get("placement"), "shift_applied_blender": list(C.placement_shift(manifest))},
                   "organize": org, "materials": mats, "textures_linked": tex, "rig": rig_info,
                   "collections": {c.name: len(c.objects) for c in bpy.data.collections}})
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = None
    bpy.ops.wm.save_as_mainfile(filepath=C.BASELINE, compress=True)
    if os.path.exists(tmp):
        os.remove(tmp)
    with open(C.PARITY_REPORT, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print("BASELINE DONE", C.BASELINE)
    print("PARITY", json.dumps({k: (v.get("ok") if isinstance(v, dict) else v) for k, v in report.items()
                                if k in ("objects", "triangles", "roles", "glass", "lettering", "rounded_corners", "textures", "shades", "all_ok")}))
    return report


if __name__ == "__main__":
    RESULT = main()
