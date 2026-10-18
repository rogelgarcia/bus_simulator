# The save pass: what runs inside the worn copies before they are written. A feature that needs more than a mask --
# a per-vertex attribute on its own meshes, or geometry of its own (chips) -- does it here, in its optional
# apply(actx) (worn block) or apply_portal(actx) (worn portal), from the plain data its build() left in ctx.stash.
# The debug view's source markers are built here too.
import math
import bpy
from . import controls

MARK_POINT_R = 0.07          # a point source's marker: an octahedron this far to each tip
MARK_LINE_W = 0.022          # a line source's marker: a square tube this far to each side
MARK_PATH_W = 0.010          # a mark's path (a streak's centre line)
MARK_EMISSION = 1.5          # bright enough to find in the shade; more and AgX bleaches the colour toward white


class ApplyContext:
    """actx.stash                    the plain data the feature's build() stashed
    actx.result                      its whole Result (sources, marks, paths, fields)
    actx.object(name)                a local object of the file being written
    actx.own_mesh(obj)               give obj its own mesh first when it shares one (the export instances meshes)
    actx.set_attribute(obj, values, domain='POINT')   a FLOAT attribute wear_<feature> the layer reads as `Attr`
    actx.add_object(name, mesh, replaces=None)        an object of the feature's own, switched with the feature:
                                     rendered while it is on, and `replaces` (an existing object's name) rendered
                                     only while it is off"""

    def __init__(self, spec, result, log=print):
        self.spec, self.name, self.result, self.stash, self.log = spec, spec.NAME, result, result.stash, log

    def object(self, name):
        o = bpy.data.objects.get(name)
        assert o is not None and o.library is None, f"{self.name}: no local object {name}"
        return o

    def own_mesh(self, obj):
        if obj.data.users > 1 or obj.data.library is not None:
            obj.data = obj.data.copy()
        return obj.data

    def set_attribute(self, obj, values, domain='POINT'):
        me = self.own_mesh(obj)
        nm = "wear_" + self.name
        if nm in me.attributes: me.attributes.remove(me.attributes[nm])
        a = me.attributes.new(nm, 'FLOAT', domain)
        assert len(values) == len(a.data), f"{self.name}: {len(values)} values for {len(a.data)} {domain} elements"
        a.data.foreach_set("value", [float(v) for v in values])
        return a

    def add_object(self, name, mesh, replaces=None):
        coll = bpy.data.collections.get(controls.GEO + self.name)
        if coll is None:
            coll = bpy.data.collections.new(controls.GEO + self.name)
            bpy.context.scene.collection.children.link(coll)
        o = bpy.data.objects.new(name, mesh); coll.objects.link(o)
        o["wear_geometry"] = self.name
        if replaces:
            assert bpy.data.objects.get(replaces) is not None, f"{self.name}: nothing called {replaces} to replace"
            o["wear_replaces"] = replaces
        return o


# ------------------------------------------------------------------------------------------------ source markers
def _tube(verts, faces, p, q, w):
    ux, uy, uz = q[0] - p[0], q[1] - p[1], q[2] - p[2]
    L = math.sqrt(ux * ux + uy * uy + uz * uz)
    if L < 1e-6: return
    ux, uy, uz = ux / L, uy / L, uz / L
    ax, ay, az = (uy * 1.0 - uz * 0.0, uz * 0.0 - ux * 1.0, 0.0) if abs(uz) < 0.9 else (0.0, uz, -uy)
    la = math.sqrt(ax * ax + ay * ay + az * az); ax, ay, az = ax / la, ay / la, az / la
    bx, by, bz = uy * az - uz * ay, uz * ax - ux * az, ux * ay - uy * ax
    k = len(verts)
    for (cx, cy, cz) in (p, q):
        for sa, sb in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
            verts.append((cx + w * (sa * ax + sb * bx), cy + w * (sa * ay + sb * by), cz + w * (sa * az + sb * bz)))
    faces += [(k, k + 1, k + 5, k + 4), (k + 1, k + 2, k + 6, k + 5), (k + 2, k + 3, k + 7, k + 6),
              (k + 3, k, k + 4, k + 7), (k + 3, k + 2, k + 1, k), (k + 4, k + 5, k + 6, k + 7)]


def _octa(verts, faces, c, r):
    k = len(verts)
    for dx, dy, dz in ((r, 0, 0), (-r, 0, 0), (0, r, 0), (0, -r, 0), (0, 0, r), (0, 0, -r)):
        verts.append((c[0] + dx, c[1] + dy, c[2] + dz))
    for a, b in ((0, 2), (2, 1), (1, 3), (3, 0)):
        faces += [(k + a, k + b, k + 4), (k + b, k + a, k + 5)]


def _marker_material(spec):
    nm = "WEAR_marker_" + spec.NAME
    m = bpy.data.materials.get(nm) or bpy.data.materials.new(nm)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    col = tuple(spec.DEBUG_COLOR) + (1.0,)
    b.inputs["Base Color"].default_value = col
    b.inputs["Emission Color"].default_value = col
    b.inputs["Emission Strength"].default_value = MARK_EMISSION
    m.diffuse_color = col
    return m


def build_markers(specs, results, log=print):
    """One mesh object per feature for its sources (wear_src_<name>) and one for its marks' paths (wear_path_<name>),
    in the feature's debug colour, in a WEAR_SOURCES collection; the render scene shows them in debug mode only."""
    coll = bpy.data.collections.get(controls.SOURCES)
    if coll is None:
        coll = bpy.data.collections.new(controls.SOURCES); bpy.context.scene.collection.children.link(coll)
    made = []
    for spec in specs:
        res = results[spec.NAME]
        for kind, items in (("source", res.sources), ("path", res.paths)):
            verts, faces = [], []
            for it in items:
                pts = it["points"]
                if kind == "source" and it["kind"] == "point":
                    for p in pts: _octa(verts, faces, p, MARK_POINT_R)
                else:
                    w = MARK_LINE_W if kind == "source" else MARK_PATH_W
                    seq = pts + ([pts[0]] if kind == "source" and it["kind"] == "area" and len(pts) > 2 else [])
                    if len(seq) == 1: _octa(verts, faces, seq[0], MARK_POINT_R)
                    for a, b in zip(seq, seq[1:]): _tube(verts, faces, a, b, w)
            if not verts: continue
            nm = ("wear_src_" if kind == "source" else "wear_path_") + spec.NAME
            me = bpy.data.meshes.new(nm); me.from_pydata(verts, [], faces); me.update()
            me.materials.append(_marker_material(spec))
            o = bpy.data.objects.new(nm, me); coll.objects.link(o)
            o["wear_marker"] = spec.NAME; o["wear_marker_kind"] = kind
            # seen by the camera only: a marker must not light, reflect in or shadow the surfaces around it, or its
            # glow on a return beside a sill's end reads as a mark that is not there
            o.visible_shadow = o.visible_diffuse = o.visible_glossy = False
            o.visible_transmission = o.visible_volume_scatter = False
            made.append(o.name)
    log(f"source markers: {', '.join(made) if made else 'none'}")
    return made
