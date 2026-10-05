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
                  PIL); capital_stage2/blender_import.py brings it in.
  CAPITAL_EXPORT  object `capital`, mesh `capital`: the version the portal uses. Pieces 07 and 02 LINK this mesh
                  datablock, so the stage exported here is what the portal (and the block's columns) shows on reload.

PORTAL_STAGE picks the exported stage (stage 2 is joined into one mesh). The portal keeps stage 1 for now: stage 2 is
0.053 m taller and its abacus wider, which the portal has to absorb when it switches.

    blender -b --factory-startup -P ornaments/capital.py -- [export=1|2] [build=all|none]

export overrides PORTAL_STAGE for this run; build=none re-exports from the saved capital.blend without rebuilding.
The stages stand beside the export in the file (stage 1 at x -1.2, stage 2 at +1.2; display only: every mesh is in the
capital's frame). Renders: screens .../ornaments/capital_stage1_*.png and capital_stage2_*.png.

Frame: x across the face, y depth (the street at -y), z up from the neck; origin at the neck centre.
"""
import bpy, bmesh, math, os, shutil, subprocess, sys
from mathutils import Vector, Matrix
LIB = r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\src\graphics\content3d\buildings\authoring\BradburyBlock\portal_lib.py"
exec(compile(open(LIB, encoding="utf-8").read(), LIB, "exec"))

PORTAL_STAGE = 1                          # the stage exported as mesh `capital` (what the portal links)
W, D, H = 0.725, 0.85, 0.41               # stage 1: pilaster footprint (width x depth) and capital height, from the reference photo (shaft 0.73 m, capital 0.39 from its neck fillet to the band)
OFFSET = {1: -1.2, 2: 1.2}                # where each stage stands in the file (x), beside the export at the origin

STAGE2_DIR = os.path.join(os.path.dirname(LIB), "ornaments", "capital_stage2")
BLEND = os.path.normpath(os.path.join(ORNAMENTS_DIR, "capital.blend"))
CACHE = os.path.normpath(os.path.join(ORNAMENTS_DIR, "cache", "capital_stage2"))           # stage 2's intermediates (gitignored)
OUT = r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\tests\artifacts\screens\bradbury_fix\portal_project\ornaments"
args = dict(a.split("=", 1) for a in (sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []) if "=" in a)
EXPORT = int(args.get("export", PORTAL_STAGE))
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
    objs, tris = blender_import.import_stage2(os.path.join(CACHE, "stage2_mesh.json"), coll, parent=root)
    print("STAGE 2: %d objects, %d triangles" % (len(objs), tris))


def export(stage):
    """Mesh `capital`, the datablock pieces 07 and 02 link, rebuilt from the chosen stage in the capital's frame."""
    if stage == 1:
        me = bpy.data.objects["capital_stage1"].data.copy()
    else:
        parts = [o for o in bpy.data.collections["CAPITAL_STAGE2"].objects if o.type == "MESH"]
        bm = bmesh.new()
        for o in parts: bm.from_mesh(o.data)                              # appends; every piece has the same slots and UV layer
        me = bpy.data.meshes.new("capital_new"); bm.to_mesh(me); bm.free()
        for m in parts[0].data.materials: me.materials.append(m)
    old = bpy.data.meshes.get("capital")
    if old: old.name = "capital_previous"
    me.name = "capital"; me["capital_stage"] = stage
    coll = bpy.data.collections.get("CAPITAL_EXPORT") or stage_collection("CAPITAL_EXPORT")
    obj = bpy.data.objects.get("capital")
    if obj is None:
        obj = bpy.data.objects.new("capital", me); coll.objects.link(obj)
    obj.data = me
    if old and old.users == 0: bpy.data.meshes.remove(old)
    print("EXPORT: mesh `capital` = stage %d (%d faces)" % (stage, len(me.polygons)))


def render_stage(stage, cams, res):
    """Render one stage alone: the other stage and the export hidden from the render."""
    show = {"CAPITAL_STAGE1": stage == 1, "CAPITAL_STAGE2": stage == 2, "CAPITAL_EXPORT": False}
    for name, on in show.items(): bpy.data.collections[name].hide_render = not on
    S = bpy.context.scene; S.render.resolution_x, S.render.resolution_y = res
    x = OFFSET[stage]
    for nm, loc, tgt, lens in cams:
        camera("Cap%d%s" % (stage, nm), (loc[0] + x, loc[1], loc[2]), (tgt[0] + x, tgt[1], tgt[2]), lens)
        render("Cap%d%s" % (stage, nm), os.path.join(OUT, "capital_stage%d_%s.png" % (stage, nm.lower())))
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
bpy.context.scene.camera = bpy.data.objects["Cap2Quarter"]
purge_orphans()
bpy.context.preferences.filepaths.save_version = 0                    # no capital.blend1: the file is rebuilt from this script
bpy.ops.wm.save_as_mainfile(filepath=BLEND, compress=True)
print("CAPITAL DONE: stage 1, stage 2, export = stage %d" % EXPORT)
