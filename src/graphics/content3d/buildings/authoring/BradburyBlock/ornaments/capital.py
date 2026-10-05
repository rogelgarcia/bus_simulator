"""Ornament — the pilaster capital: one file holding both stages, and the export the portal links.

ornaments/capital.blend holds:
  CAPITAL_STAGE1  `capital_stage1`, base and support only, no carving (capital_v2 in portal_lib). The base is the neck
                  astragal and the bell that flares from the pilaster footprint up to the abacus; the support is the
                  abacus (a fillet plus a slab) that carries the frieze band. The capital is engaged: it wraps the front
                  face and runs back along the sides for 80% of the front width (0.64 m of the 0.85 m depth), then ends
                  in a straight back plane where the plain pilaster continues up behind it. 0.41 m tall.
  CAPITAL_STAGE2  the carved capital being edited: the photo-proportioned blank (0.463 m tall, wider abacus) with the
                  ornaments cut from the PBR atlas as textured low-poly cards, one object per piece (`s2_*`, parented to
                  `capital_stage2_root`). capital_stage2/build.py builds the geometry with the system python (numpy +
                  PIL); capital_stage2/blender_import.py brings it in. The front and the blank are in the collection
                  itself; the side faces are each placement's own, carved to the wall beside it, in a child collection
                  per placement (CAPITAL_STAGE2_pilaster, _column, _pier, _springing: build.py SIDES); the viewport
                  shows the pilasters' (tick the others' eye in the outliner).
  CAPITAL_EXPORT  one mesh per placement (portal_lib.CAPITAL_MESHES): `capital` on the pilasters (piece 07),
                  `capital_pier` on the portal's piers (piece 02), `capital_column` on the block's brick columns and
                  `capital_springing` on its narrow piers (assemble_building.py), each with an object of its name.
                  They LINK these mesh datablocks, so the stage exported here is what the portal and the block show on
                  reload. Copies of a stage, so the collection is excluded from the view layer: tick it in the
                  outliner to see what they get (side by side along +y).

The exported stage is portal_lib.CAPITAL_STAGE (stage 2 is joined into one mesh per placement, stage 1 is the plain
capital under every name); BRADBURY_CAPITAL_STAGE overrides it for one run. Stage 2 is 0.053 m taller and its abacus wider: pieces 02 and 07 and assemble_building.py measure the
exported mesh and shorten the shafts under it, so use_capital_stage.py rebuilds the whole chain for a stage.

    blender -b --factory-startup -P ornaments/capital.py -- [build=all|none]

build=none re-exports from the saved capital.blend without rebuilding the stages.
The stages stand beside the export in the file (stage 1 at x -1.2, stage 2 at +1.2; display only: every mesh is in the
capital's frame). Renders: screens .../ornaments/capital_stage1_*.png and capital_stage2_*.png (the pilasters' sides),
capital_stage2_side_<placement>.png (each placement's right side face).

Frame: x across the face, y depth (the street at -y), z up from the neck; origin at the neck centre.
"""
import bpy, bmesh, json, math, os, shutil, subprocess, sys
from mathutils import Vector, Matrix
LIB = r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\src\graphics\content3d\buildings\authoring\BradburyBlock\portal_lib.py"
exec(compile(open(LIB, encoding="utf-8").read(), LIB, "exec"))

W, D, H = 0.725, 0.85, 0.41               # stage 1: pilaster footprint (width x depth) and capital height, from the reference photo (shaft 0.73 m, capital 0.39 from its neck fillet to the band)
OFFSET = {1: -1.2, 2: 1.2}                # where each stage stands in the file (x), beside the export at the origin

STAGE2_DIR = os.path.join(os.path.dirname(LIB), "ornaments", "capital_stage2")
BLEND = os.path.normpath(os.path.join(ORNAMENTS_DIR, "capital.blend"))
CACHE = os.path.normpath(os.path.join(ORNAMENTS_DIR, "cache", "capital_stage2"))           # stage 2's intermediates (gitignored)
OUT = r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\tests\artifacts\screens\bradbury_fix\portal_project\ornaments"
args = dict(a.split("=", 1) for a in (sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []) if "=" in a)
EXPORT = CAPITAL_STAGE                    # portal_lib: the stage the portal and the block use
BUILD = args.get("build", "all")


def stage_collection(name):
    c = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c)
    return c


def build_stage2(coll):
    """Run build.py with the system python (Blender's has no PIL), then import its objects."""
    py = os.environ.get("BRADBURY_PYTHON") or shutil.which("python") or shutil.which("py")
    cmd = [py, os.path.join(STAGE2_DIR, "build.py"), CACHE]
    print("STAGE 2:", " ".join(cmd))
    r = subprocess.run(cmd, capture_output=True, text=True)
    print(r.stdout[-3000:])
    if r.returncode:
        raise RuntimeError("capital_stage2/build.py failed (it needs the system python with numpy + PIL; set BRADBURY_PYTHON "
                           "to choose one):\n" + r.stderr[-3000:])
    root = bpy.data.objects.new("capital_stage2_root", None); coll.objects.link(root)
    root.location.x = OFFSET[2]
    sys.path.insert(0, STAGE2_DIR)
    import blender_import
    objs, tris, sides = blender_import.import_stage2(os.path.join(CACHE, "stage2_mesh.json"), coll, parent=root)
    if set(sides) != set(CAPITAL_MESHES):
        raise RuntimeError("capital_stage2/build.py SIDES (%s) and portal_lib.CAPITAL_MESHES (%s) name different placements"
                           % (", ".join(sides), ", ".join(CAPITAL_MESHES)))
    for name, c in sides.items():                                         # the viewport shows the pilasters' side faces
        bpy.context.view_layer.layer_collection.children[coll.name].children[c.name].hide_viewport = name != "pilaster"
    print("STAGE 2: %d objects, %d triangles (every placement's side faces)" % (len(objs), tris))


def export(stage):
    """The meshes the portal and the block link, one per placement (portal_lib.CAPITAL_MESHES), rebuilt from the chosen
    stage in the capital's frame: stage 1 the plain capital under every name, stage 2 the shared pieces
    (CAPITAL_STAGE2) joined with that placement's side faces (CAPITAL_STAGE2_<placement>). Each mesh records its stage
    (`capital_stage`), its placement (`capital_kind`), the abacus's top (`capital_top`, m over the neck's foot: the
    placements set the capital by it, as the crown stands above it) and, carved, the wall its sides reach
    (`side_wall_mm`), which the placements check."""
    coll = bpy.data.collections.get("CAPITAL_EXPORT") or stage_collection("CAPITAL_EXPORT")
    for k, (kind, name) in enumerate(CAPITAL_MESHES.items()):
        if stage == 1:
            me = bpy.data.objects["capital_stage1"].data.copy()
        else:
            sides = bpy.data.collections["CAPITAL_STAGE2_" + kind]
            parts = [o for c in (bpy.data.collections["CAPITAL_STAGE2"], sides) for o in c.objects if o.type == "MESH"]
            bm = bmesh.new()
            for o in parts: bm.from_mesh(o.data)                          # appends; every piece has the same slots and UV layer
            me = bpy.data.meshes.new(name + "_new"); bm.to_mesh(me); bm.free()
            for m in parts[0].data.materials: me.materials.append(m)
            me["side_wall_mm"] = float(sides["side_wall_mm"])
        old = bpy.data.meshes.get(name)
        if old: old.name = name + "_previous"
        me.name = name; me["capital_stage"] = stage; me["capital_kind"] = kind
        blank = bpy.data.objects["capital_stage1" if stage == 1 else "s2_blank"].data
        me["capital_top"] = max(v.co.z for v in blank.vertices)          # the abacus's top: where the placements set the capital (the crown stands above it)
        obj = bpy.data.objects.get(name)
        if obj is None:
            obj = bpy.data.objects.new(name, me); coll.objects.link(obj)
        obj.data = me; obj.location = (0.0, 1.4 * k, 0.0)                 # side by side, for viewing only
        if old and old.users == 0: bpy.data.meshes.remove(old)
        print("EXPORT: mesh `%s` = stage %d (%d faces)" % (name, stage, len(me.polygons)))


def render_stage(stage, cams, res, kind="pilaster", suffix=""):
    """Render one stage alone: the other stage and the export hidden from the render; of stage 2's side faces only
    the placement `kind`'s."""
    show = {"CAPITAL_STAGE1": stage == 1, "CAPITAL_STAGE2": stage == 2, "CAPITAL_EXPORT": False}
    show.update({"CAPITAL_STAGE2_" + k: k == kind for k in CAPITAL_MESHES if "CAPITAL_STAGE2_" + k in bpy.data.collections})
    for name, on in show.items(): bpy.data.collections[name].hide_render = not on
    S = bpy.context.scene; S.render.resolution_x, S.render.resolution_y = res
    x = OFFSET[stage]
    for nm, loc, tgt, lens in cams:
        camera("Cap%d%s" % (stage, nm), (loc[0] + x, loc[1], loc[2]), (tgt[0] + x, tgt[1], tgt[2]), lens)
        render("Cap%d%s" % (stage, nm), os.path.join(OUT, "capital_stage%d_%s%s.png" % (stage, nm.lower(), suffix)))
    for name in show: bpy.data.collections[name].hide_render = False


if BUILD == "none":
    bpy.ops.wm.open_mainfile(filepath=BLEND)
else:
    bpy.ops.wm.read_homefile(use_empty=True)
    s1 = stage_collection("CAPITAL_STAGE1"); s2 = stage_collection("CAPITAL_STAGE2")
    CARVED = mat_sandstone("PORTAL_sandstone_carved", joints=False)
    capital_v2("capital_stage1", W, H, CARVED, s1, d=D, stage=1).location.x = OFFSET[1]
    build_stage2(s2)
export(EXPORT)

# ---------------------------------------------------------------- renders, save
rig = setup_scene()
os.makedirs(OUT, exist_ok=True)
render_stage(1, [("Front", (0.0, -3.4, 0.3), (0.0, 0.0, 0.27), 60), ("Quarter", (-2.4, -2.5, 1.0), (0.0, -0.1, 0.27), 60),
                 ("Top", (-1.2, -1.5, 2.5), (0.0, -0.1, 0.25), 55)], (1200, 1200))
render_stage(2, [("Front", (0.0, -3.2, 0.27), (0.0, 0.0, 0.25), 70), ("Quarter", (-1.9, -2.2, 0.9), (0.0, -0.1, 0.24), 65),
                 ("Low", (0.9, -1.4, -0.35), (0.0, -0.1, 0.25), 50)], (1600, 1100))
for kind in CAPITAL_MESHES:                                               # each placement's right side face, the wall to the right
    render_stage(2, [("Side", (2.75, -0.12, 0.32), (0.45, -0.12, 0.23), 62)], (1400, 870), kind=kind, suffix="_" + kind)
bpy.context.scene.camera = bpy.data.objects["Cap2Quarter"]
bpy.context.view_layer.layer_collection.children["CAPITAL_EXPORT"].exclude = True   # the viewport shows the two stages only
purge_orphans()
bpy.context.preferences.filepaths.save_version = 0                    # no capital.blend1: the file is rebuilt from this script
bpy.ops.wm.save_as_mainfile(filepath=BLEND, compress=True)
print("CAPITAL DONE: stage 1, stage 2, export = stage %d (%s)" % (EXPORT, ", ".join(CAPITAL_MESHES.values())))
