"""Piece 05 — the entrance slab.

A single granite step the width of the portal, projecting from the recess
mouth onto the sidewalk; its top is the threshold level (z = 0) so the recess
floor and the door threshold sit on it. A plain sidewalk slab is added around
it for context (collection PROPS: review only, not part of the portal).

Frame: x across, y depth (recess mouth at y = -2.10), z up. Collection: SLAB.
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix
LIB = r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\src\graphics\content3d\buildings\authoring\BradburyBlock\portal_lib.py"
exec(compile(open(LIB, encoding="utf-8").read(), LIB, "exec"))

Y_MOUTH = -2.10
SLAB_HALF_W = 1.60; SLAB_OUT = -2.85; SLAB_H = 0.12     # the step sits between the big pilasters (piece 07)
COLL = ensure_collection("SLAB"); PROPS = ensure_collection("PROPS")   # PROPS: review-only context, kept out of the PORTAL collection the building links
GRANITE = mat_plain("PORTAL_granite", (0.16, 0.15, 0.14), roughness=0.45, coat=0.15)
CONCRETE = mat_plain("PORTAL_sidewalk", (0.42, 0.41, 0.39), roughness=0.9)

bm = bmesh.new()
cube(bm, -SLAB_HALF_W, SLAB_HALF_W, SLAB_OUT, Y_MOUTH + 0.05, -SLAB_H, 0.0)                     # the step
# rounded front edge: a half-cylinder along the front top edge
r = bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.04, radius2=0.04, depth=2*SLAB_HALF_W)
tf(bm, r["verts"], Matrix.Translation((0.0, SLAB_OUT, -0.04)) @ Matrix.Rotation(math.pi/2, 4, 'Y'))
mesh_from_bm("slab_step", bm, GRANITE, COLL, smooth=False)
bm = bmesh.new(); cube(bm, -6.0, 6.0, -8.0, SLAB_OUT + 0.02, -SLAB_H - 0.02, -SLAB_H); mesh_from_bm("slab_sidewalk", bm, CONCRETE, PROPS)
bm = bmesh.new(); cube(bm, -3.0, 3.0, Y_MOUTH - 0.02, DOOR_Y + 0.3, -SLAB_H - 0.02, -0.03); mesh_from_bm("slab_under_recess", bm, GRANITE, COLL)   # fills under the recess floor

rig = setup_scene()
OUT = r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\tests\artifacts\screens\bradbury_fix\portal_project"
purge_orphans()
bpy.ops.wm.save_as_mainfile(filepath=r"C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\tests\artifacts\blender\bradbury\portal_project\bradbury_portal.blend", compress=True)
print("SLAB DONE", len(COLL.objects), "objects")
