"""Ornament — the pilaster capital, rebuilt from scratch in its own file.

Stage 1: base and support only, no carving. The base is the neck astragal
and the bell that flares from the pilaster footprint up to the abacus; the
support is the abacus (a fillet plus a slab) that carries the frieze band.
The capital is engaged: it wraps the front face and runs back along the
sides for 80% of the front width (0.64 m of the 0.85 m depth), then ends in
a straight back plane where the plain pilaster continues up behind it.
Only the capital, nothing of the pilaster. Built at the origin at the
pilaster size (footprint 0.76 x 0.85 m, capital 0.55 m tall) so the portal's pilasters (pieces/07_pilasters.py) can switch to it
by calling `capital_v2` from portal_lib once the design is complete.

Frame: x across the face, y depth (the street at -y), z up from the neck.
File: ornaments/capital.blend; renders: screens .../ornaments/capital_*.png.
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix
LIB = r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\src\graphics\content3d\buildings\authoring\BradburyBlock\portal_lib.py"
exec(compile(open(LIB, encoding="utf-8").read(), LIB, "exec"))

W, D, H = 0.725, 0.85, 0.41               # pilaster footprint (width x depth) and capital height, from the reference photo (shaft 0.73 m, capital 0.39 from its neck fillet to the band)

bpy.ops.wm.read_homefile(use_empty=True)
COLL = ensure_collection("CAPITAL")
STONE = mat_sandstone("PORTAL_sandstone", joints=False)
CARVED = mat_sandstone("PORTAL_sandstone_carved", joints=False)

capital_v2("capital", W, H, CARVED, COLL, d=D, stage=1)

# ---------------------------------------------------------------- cameras, renders, save
rig = setup_scene()
camera("CapFront", (0.0, -3.4, 0.3), (0.0, 0.0, 0.27), 60)
camera("CapQuarter", (-2.4, -2.5, 1.0), (0.0, -0.1, 0.27), 60)
camera("CapTop", (-1.2, -1.5, 2.5), (0.0, -0.1, 0.25), 55)
OUT = r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\tests\artifacts\screens\bradbury_fix\portal_project\ornaments"
os.makedirs(OUT, exist_ok=True)
S = bpy.context.scene; S.render.resolution_x = 1200; S.render.resolution_y = 1200
render("CapFront", os.path.join(OUT, "capital_front.png"))
render("CapQuarter", os.path.join(OUT, "capital_quarter.png"))
render("CapTop", os.path.join(OUT, "capital_top.png"))
S.camera = bpy.data.objects["CapQuarter"]
purge_orphans()
bpy.ops.wm.save_as_mainfile(filepath=r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\tests\artifacts\blender\bradbury\portal_project\ornaments\capital.blend", compress=True)
print("CAPITAL DONE", len(COLL.objects), "objects")
