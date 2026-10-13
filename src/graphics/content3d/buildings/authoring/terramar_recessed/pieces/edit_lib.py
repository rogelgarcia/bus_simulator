# edit_lib.py -- shared helpers for the Terra & Mar edit pieces (AI 615+).
#
# Every piece runs on the EDIT COPY only (tests/artifacts/blender/terramar_recessed/edit/terramar_recessed_edit.blend):
# open_edit_copy() refuses any other file, so the as-extracted baseline can never be changed by a piece.
#   - piece_collection(area, name): the piece's own collection under TERRAMAR/TM_EDIT_<AREA> (or TM_SITE), cleared on
#     every run so a rerun never duplicates anything;
#   - set_aside(objs, name): game parts the piece replaces go to TM_REPLACED/REPLACED_<name> (hidden; its own name,
#     because collection names are global in bpy.data), with the collection they came from recorded on the object
#     (tm_replaced_from); restore_set_aside(name, keep) brings back what a changed piece no longer replaces;
#   - piece_collection() deletes only objects tagged tm_piece == <name>; anything else found there is just unlinked;
#   - box_uvs(mesh): metre-scale box-projected UVs, the game's 1.0 uv per metre;
#   - save(): saves the edit copy in place (compressed, relative paths).
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
PARENT = os.path.dirname(HERE)
if PARENT not in sys.path:
    sys.path.insert(0, PARENT)
import tm_common as C  # noqa: E402

AREAS = {"exterior": "TM_EDIT_EXTERIOR", "interior": "TM_EDIT_INTERIOR", "props": "TM_EDIT_PROPS", "site": "TM_SITE"}


def open_edit_copy():
    """Make sure the open file is the edit copy (open it when running from an empty or other session)."""
    want = os.path.normcase(os.path.abspath(C.EDIT_BLEND))
    have = os.path.normcase(os.path.abspath(bpy.data.filepath)) if bpy.data.filepath else ""
    if have != want:
        if bpy.data.is_dirty and bpy.data.filepath:
            raise SystemExit(f"REFUSED: the open file {bpy.data.filepath} has unsaved changes; save or close it first")
        assert os.path.exists(C.EDIT_BLEND), "make the edit copy first (make_edit_copy.py)"
        bpy.ops.wm.open_mainfile(filepath=C.EDIT_BLEND)
    assert os.path.normcase(os.path.abspath(bpy.data.filepath)) == want, "pieces only run on the edit copy"
    return bpy.context.scene


def _child(parent, name, hidden=False):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
    if coll.name not in parent.children:
        parent.children.link(coll)
    if hidden:
        coll.hide_render = True
        coll.hide_viewport = True
    return coll


def replaced_name(name):
    # Collection names are global in bpy.data: the set-aside collection must not share the piece collection's name.
    return f"REPLACED_{name}"


def piece_collection(area, name):
    """The piece's own collection, emptied: objects the piece built (tm_piece == name) are deleted, anything else
    found in it is only unlinked (never delete a game part by accident)."""
    parent_name = AREAS[area]
    parent = bpy.data.collections[parent_name]
    coll = _child(parent, name)
    coll.hide_render = False
    coll.hide_viewport = False
    for o in list(coll.objects):
        if o.get("tm_piece") == name:
            data = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            if data is not None and data.users == 0 and isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
        else:
            coll.objects.unlink(o)
    return coll


def set_aside(objs, name):
    root = bpy.data.collections["TM_REPLACED"]
    dest = _child(root, replaced_name(name), hidden=True)
    for o in objs:
        if o.name in dest.objects:
            continue
        sources = [c.name for c in o.users_collection]
        o["tm_replaced_from"] = ",".join(sources)
        o["tm_replaced_by"] = name
        for c in list(o.users_collection):
            c.objects.unlink(o)
        dest.objects.link(o)
    return dest


def restore_set_aside(name, keep_names):
    dest = bpy.data.collections.get(replaced_name(name))
    if dest is None:
        return []
    restored = []
    for o in list(dest.objects):
        if o.name in keep_names:
            continue
        for cname in str(o.get("tm_replaced_from", "")).split(","):
            if cname and cname in bpy.data.collections:
                bpy.data.collections[cname].objects.link(o)
        dest.objects.unlink(o)
        restored.append(o.name)
    return restored


def box_uvs(me, scale=1.0):
    """Box projection in world-aligned metres: faces mostly facing z get (x, y); the others (horizontal distance
    along the face, z). Assumes the object has an identity transform (pieces build in world coordinates)."""
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv = me.uv_layers.active.data
    for p in me.polygons:
        n = p.normal
        if abs(n.z) > 0.7:
            for li in p.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co
                uv[li].uv = (co.x * scale, co.y * scale)
        else:
            t = Vector((-n.y, n.x, 0.0)).normalized()
            for li in p.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co
                uv[li].uv = (co.dot(t) * scale, co.z * scale)


def material(name):
    mat = bpy.data.materials.get(name)
    assert mat is not None, f"material {name} missing from the edit copy"
    return mat


def save():
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.ops.wm.save_mainfile(filepath=C.EDIT_BLEND, compress=True, relative_remap=True)
