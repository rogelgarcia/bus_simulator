# palm_tree.py -- palm detail upgrade: the whole palm (root base, trunk, crown of fronds) as one mesh (proc_plants.py).
#
# Composes the three part modules into one bmesh per tree (none of them goes through rb_lib.finish, which would dissolve
# the leaf-scar rings and box-project the UVs):
#   palm_trunk.py   the trunk with its boot zone, built first (it adds vertex layers, which would invalidate references
#                   to anything built before it), then lifted by the base's height
#   palm_base.py    the root base under it, its open top ring welded to the trunk's ring 0 (found by position; doubles
#                   removed on those two rings only)
#   palm_frond.py   the crown, set on the trunk's top frame (the crown follows the trunk's top tangent; each frond's
#                   gravity comes from its matrix)
# The crown (b8's street palms: a dense feather-palm crown, tall fountain-like fronds rising from the centre, the outer
# ones arching out and the oldest drooping below level, a few dead fronds hanging under it):
#   spears     1-2 young fronds near upright out of the dome at the top of the boot zone (they hide the trunk's cap)
#   live       the rest on a golden-angle spiral, from the centre outward and downward through the upper boot zone: the
#              younger steep and barely bending, the mature arching out, the old ones leaving below level and drooping;
#              seeded lengths, elevations, droops and azimuth jitter, and a slight crown asymmetry (one side's fronds a
#              little longer and lower)
#   dead       1-2 straw-brown fronds attached under the live ones on the outside of the boots, hanging steeply down and
#              out (they lean away from the trunk, so their leaflets do not cut into it)
# Frond bases sit inside the upper boots (the cup palm_trunk.py leaves for them) at a radius and height that grow with
# age, so the petioles emerge from the boots and nothing floats.
#   build_palm(bm, rng, scale="street" | "roof", ...)   one palm into bm, base at the origin (the soil at z 0, the roots
#           a few centimetres below it); returns {"tris", "height", "radius", "top", "fronds", "spears", "dead",
#           "trunk_tris", "base_tris", "crown_tris", "trunk", "r_base", "lean"}
#   to_mesh(name, bm, mats)   the bmesh as a mesh with the slot materials (smooth faces and creases as the modules set)
#   materials()   the six slot materials in slot order (MATERIAL_NAMES): the frond's three, the trunk's two, the base's
# Scales (proportions measured on b8 through CAM_B8, 2026-10-14):
#   street   b8's frontage palms: a slender trunk (r 0.14-0.155 at the base), the crown's top 7.0-7.7 m up, 26-30 live
#            fronds of up to 2.75 m (the older ones shorter), 1-2 dead; about 10 m tall, radius 2.1-2.3 m (radius /
#            height 0.21-0.23, b8's 4.0-4.6 m crowns on 8.9-10.4 m palms); ~77-79k triangles (fronds ~85 %)
#   roof     the small terrace palms: a 1 m trunk under a compact fan of 20-24 fronds of up to 0.78 m with wider,
#            denser leaflets (b8's bushy roof palms); about 2 m tall, radius ~0.6 m (fitted to <= 0.54 to stay inside
#            the roof guard); ~18-22k triangles
#
# Test renders (the composition lighting; the .blend is never saved; renders go to out=):
#   blender -b tests/artifacts/blender/terramar_recessed/rebuild/terramar_building.blend --python <this file> -- \
#       out=tests/artifacts/screens/buildings/terramar_recessed/rebuild/palm_detail/tree [samples=96] [seed=0] \
#       [shots=street_b8,street,crown,crown_below,crown_top,junction,roof,roof_close]
import importlib
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import palm_frond as PF  # noqa: E402
import palm_trunk as PT  # noqa: E402
import palm_base as PB  # noqa: E402

for _mod in (PF, PT, PB):
    importlib.reload(_mod)

MATERIAL_NAMES = PF.MATERIAL_NAMES + PT.MATERIAL_NAMES + PB.MATERIAL_NAMES      # slot order
SLOT_FROND, SLOT_TRUNK, SLOT_BASE = 0, len(PF.MATERIAL_NAMES), len(PF.MATERIAL_NAMES) + len(PT.MATERIAL_NAMES)
GOLDEN = 2.399963229728653
TAU = 2.0 * math.pi

# Per scale. trunk: the shaft's length above the base (m); r_base / r_top: its radii; lean: the top's offset (m); flare:
# the root base's swelling at the soil, or None for no root base (the trunk's ring 0 capped on the soil: a roof palm
# stands 5 cm from its trough's inner rim, no room for a flare); fronds / spears / dead: counts; length: the longest
# live frond (m), the older ones shorter by up to shrink; elev / droop: a live frond's base elevation and total droop
# (deg), youngest -> oldest; elev_exp: how slowly the elevation falls along the spiral (> 1 keeps more fronds high, b8's
# fountain); old_from: the share of the spiral that is "old"; reach: the attachment radius (x the crown radius),
# youngest -> oldest; drop: how far down the boot zone the oldest live frond attaches (x the boot length); asym: the
# crown's one-sided length change; leaflet_len / leaflet_wid / leaflet_n: scales on palm_frond's longest leaflet
# (0.32 x the frond length), widest blade (0.012 + 0.011 x the length) and leaflet count (24 per metre, per side).
SCALES = {
    "street": {"trunk": (6.7, 7.4), "r_base": (0.140, 0.155), "r_top": (0.110, 0.122), "lean": (0.08, 0.22),
               "flare": 1.4, "sides": 24, "fronds": (26, 30), "spears": (1, 2), "dead": (1, 2),
               "length": (2.65, 2.75), "shrink": 0.34, "spear_len": (0.8, 0.9), "elev": (80.0, -5.0), "elev_exp": 1.35,
               "droop": (20.0, 110.0), "old_from": 0.72, "reach": (0.30, 0.95), "drop": 0.42, "asym": 0.06,
               "leaflet_len": 1.0, "leaflet_wid": 1.2, "leaflet_n": 1.0},
    "roof": {"trunk": (1.05, 1.25), "r_base": (0.044, 0.048), "r_top": (0.034, 0.038), "lean": (0.02, 0.04),
             "flare": None, "sides": 16, "fronds": (20, 24), "spears": (1, 1), "dead": (0, 0),
             "length": (0.7, 0.78), "shrink": 0.35, "spear_len": (0.8, 0.9), "elev": (78.0, 46.0), "elev_exp": 0.8,
             "droop": (16.0, 44.0), "old_from": 0.85, "reach": (0.15, 0.7), "drop": 0.35, "asym": 0.05,
             "leaflet_len": 1.0, "leaflet_wid": 1.6, "leaflet_n": 1.3},
}


def materials():
    """Create or refresh the frond, trunk and base materials; return them in slot order (MATERIAL_NAMES)."""
    return PF.materials() + PT.materials() + PB.materials()


def _ring(bm, z, r):
    """The vertices at height z on radius r (an open ring, found by position)."""
    return [v for v in bm.verts if abs(v.co.z - z) < 1e-5 and abs(math.hypot(v.co.x, v.co.y) - r) < 1e-4]


def _cap(bm, r, sides):
    """Close the trunk's ring 0 (z 0) with a bottom face, facing down onto the soil."""
    ring = sorted(_ring(bm, 0.0, r), key=lambda v: math.atan2(v.co.y, v.co.x) % TAU)
    if len(ring) != sides:
        raise RuntimeError(f"palm_tree: expected {sides} ring vertices at z 0 r {r:.4f}, found {len(ring)}")
    f = bm.faces.new(list(reversed(ring)))
    f.material_index, f.smooth = SLOT_TRUNK, False
    uv = bm.loops.layers.uv.active
    for lp in f.loops:
        lp[uv].uv = (0.5 + 0.5 * lp.vert.co.x / r, 0.5 + 0.5 * lp.vert.co.y / r)


def _weld(bm, z, r, sides):
    """Weld the base's top ring onto the trunk's ring 0: the 2 x sides vertices at height z on radius r."""
    ring = _ring(bm, z, r)
    if len(ring) != 2 * sides:
        raise RuntimeError(f"palm_tree: expected {2 * sides} ring vertices at z {z:.4f} r {r:.4f}, found {len(ring)}")
    n0 = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=ring, dist=1e-4)
    if n0 - len(bm.verts) != sides:
        raise RuntimeError(f"palm_tree: the weld merged {n0 - len(bm.verts)} vertices, expected {sides}")


def _crown(bm, rng, c, top, axis, r_crown, outer_r, l_boot):
    """The fronds on the trunk's top frame (see the header); returns the counts and triangles."""
    tilt = Vector((0.0, 0.0, 1.0)).rotation_difference(axis).to_matrix().to_4x4()
    n = rng.randint(*c["fronds"])
    n_spear, n_dead = rng.randint(*c["spears"]), rng.randint(*c["dead"])
    length = rng.uniform(*c["length"])
    az0, az_heavy = rng.uniform(0.0, TAU), rng.uniform(0.0, TAU)
    drop = c["drop"] * l_boot
    e0, e1 = c["elev"]
    d0, d1 = c["droop"]
    tris = 0

    def frond(az, rr, dz, **kw):
        nonlocal tris
        at = top + tilt @ Vector((rr * math.cos(az), rr * math.sin(az), dz))
        m = Matrix.Translation(at) @ tilt @ Matrix.Rotation(az, 4, "Z")
        ln = kw["length"]
        n_side = None if c["leaflet_n"] == 1.0 else max(8, min(80, round(24.0 * c["leaflet_n"] * ln * 0.84)))
        tris += PF.build_frond(bm, rng, m, leaflets=n_side, leaflet_max=0.32 * ln * c["leaflet_len"],
                               leaflet_width=(0.012 + 0.011 * ln) * c["leaflet_wid"], slot0=SLOT_FROND, **kw)["tris"]

    for i in range(n):
        az = az0 + i * GOLDEN + rng.gauss(0.0, 0.10)
        heavy = math.cos(az - az_heavy)                                   # the crown's fuller side
        if i < n_spear:                                                   # the spear(s), out of the dome
            frond(az, r_crown * rng.uniform(0.05, 0.15), r_crown * rng.uniform(0.30, 0.40),
                  length=length * rng.uniform(*c["spear_len"]), base_elev_deg=rng.uniform(83.0, 88.0),
                  droop_deg=rng.uniform(4.0, 12.0), age="young")
            continue
        g = (i - n_spear) / max(1, n - n_spear - 1)                       # 0 youngest live .. 1 oldest
        elev = e0 + (e1 - e0) * g ** c["elev_exp"] + rng.uniform(-4.0, 4.0) - 60.0 * c["asym"] * heavy
        droop = (d0 + (d1 - d0) * g ** 1.1) * rng.uniform(0.92, 1.08)
        ln = length * (1.0 - c["shrink"] * g) * rng.uniform(0.96, 1.04) * (1.0 + c["asym"] * heavy)
        rr = r_crown * (c["reach"][0] + (c["reach"][1] - c["reach"][0]) * g ** 0.5)
        dz = 0.30 * r_crown - drop * g ** 0.9
        frond(az, rr, dz, length=ln, base_elev_deg=elev, droop_deg=droop, age="mature" if g < c["old_from"] else "old")
    for j in range(n_dead):                                               # hanging under the crown, leaning out
        az = az0 + (n + j) * GOLDEN + rng.gauss(0.0, 0.25)
        frond(az, outer_r * rng.uniform(0.85, 1.0), -drop - l_boot * rng.uniform(0.04, 0.22),
              length=length * rng.uniform(0.78, 0.95), base_elev_deg=-rng.uniform(58.0, 68.0),
              droop_deg=rng.uniform(4.0, 10.0), age="dead")
    return {"fronds": n + n_dead, "spears": n_spear, "dead": n_dead, "tris": tris}


def build_palm(bm, rng, *, scale="street", trunk=None, length=None, lean=None, r_base=None, r_top=None):
    """One palm into bm (see the header). trunk / length / lean / r_base / r_top override the scale's seeded draws."""
    c = dict(SCALES[scale])
    if length is not None:
        c["length"] = (length, length)
    sides = c["sides"]
    rb = r_base if r_base is not None else rng.uniform(*c["r_base"])
    rt = r_top if r_top is not None else rng.uniform(*c["r_top"])
    h_trunk = trunk if trunk is not None else rng.uniform(*c["trunk"])
    lean = lean if lean is not None else rng.uniform(*c["lean"])
    h_base = 2.2 * rb if c["flare"] else 0.0
    if len(bm.verts):
        raise ValueError("palm_tree.build_palm wants an empty bmesh (the trunk's vertex layers come first)")
    t = PT.build_trunk(bm, rng, height=h_trunk, r_base=rb, r_top=rt, lean=lean, sides=sides, slot0=SLOT_TRUNK)
    if c["flare"]:
        bmesh.ops.translate(bm, vec=(0.0, 0.0, h_base), verts=list(bm.verts))
        b = PB.build_base(bm, rng, r_trunk=rb, height=h_base, flare=c["flare"], sides=sides, slot0=SLOT_BASE)
        _weld(bm, h_base, rb, sides)
    else:
        _cap(bm, rb, sides)
        b = {"tris": 0, "max_radius": rb}
    top = t["top"] + Vector((0.0, 0.0, h_base))
    crown = _crown(bm, rng, c, top, t["axis"], t["crown_radius"], t["crown_outer_radius"], t["boot_zone"])
    bm.normal_update()
    zs = [v.co.z for v in bm.verts]
    return {"tris": sum(len(f.verts) - 2 for f in bm.faces), "height": max(zs),
            "radius": max(math.hypot(v.co.x, v.co.y) for v in bm.verts), "top": top, "fronds": crown["fronds"],
            "spears": crown["spears"], "dead": crown["dead"], "trunk_tris": t["tris"], "base_tris": b["tris"],
            "crown_tris": crown["tris"], "trunk": round(h_trunk, 3), "r_base": round(rb, 4), "lean": round(lean, 3),
            "base_radius": round(b["max_radius"], 4)}


def to_mesh(name, bm, mats):
    """The finished bmesh as a mesh with the slot materials (the modules set smooth faces and sharp creases)."""
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    for m in mats:
        me.materials.append(m)
    return me


# ---------------------------------------------------------------- test renders (python palm_tree.py -- out=<dir>)


def _aim(cam, loc, target, vfov):
    cam.location = Vector(loc)
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cam.data.sensor_fit = "VERTICAL"
    cam.data.angle_y = math.radians(vfov)


def _test(argv):
    opts = dict(a.split("=", 1) for a in argv if "=" in a)
    assert "INSPECTION_RIG" in bpy.data.collections, "open terramar_building.blend (its INSPECTION_RIG lights the test)"
    sys.path.insert(0, os.path.dirname(HERE))
    from render_inspection import use_gpu  # noqa: E402
    out = os.path.abspath(opts.get("out", "."))
    os.makedirs(out, exist_ok=True)
    seed = opts.get("seed", "0")
    scene = bpy.context.scene
    device = use_gpu(scene)
    scene.render.engine = "CYCLES"
    scene.cycles.samples = int(opts.get("samples", 96))
    scene.cycles.use_denoising = True
    scene.render.resolution_percentage = int(opts.get("pct", 100))
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    guides = bpy.context.view_layer.layer_collection.children.get("RB_PLAN_GUIDES")
    if guides is not None:
        guides.exclude = True
    coll = bpy.data.collections.new("RBP_palm_tree_test")
    scene.collection.children.link(coll)
    mats = materials()
    spots = {"street": (Vector((40.0, -45.0, 0.0)), "street"), "roof": (Vector((47.0, -45.0, 0.0)), "roof")}
    info = {}
    for name, (at, scale) in spots.items():
        bm = bmesh.new()
        info[name] = build_palm(bm, random.Random(f"palm_tree_test:{scale}:{seed}"), scale=scale)
        me = to_mesh(f"RBP_palm_tree_test_{name}", bm, mats)
        bm.free()
        ob = bpy.data.objects.new(me.name, me)
        ob.location = at
        coll.objects.link(ob)
        print(f"PALM_TREE {name}: " + " ".join(f"{k}={round(v, 3) if isinstance(v, float) else v}"
                                              for k, v in info[name].items() if k != "top"))
    st, rf = spots["street"][0], spots["roof"][0]
    top = info["street"]["top"] + st
    h, hr = info["street"]["height"], info["roof"]["height"]
    views = {   # name: (camera, target, vfov, resolution)
        "street_b8": (st + Vector((-6.0, -27.0, 1.7)), st + Vector((0.0, 0.0, 0.47 * h)), 30.0, (1000, 1400)),
        "street": (st + Vector((8.0, -15.0, 1.6)), st + Vector((0.0, 0.0, 0.47 * h)), 52.0, (1600, 1600)),
        "crown": (top + Vector((3.5, -8.5, 0.6)), top + Vector((0.0, 0.0, 0.6)), 42.0, (1600, 1100)),
        "crown_below": (top + Vector((1.2, -3.0, -4.5)), top + Vector((0.0, 0.0, -0.3)), 50.0, (1600, 1100)),
        "crown_top": (top + Vector((2.0, -4.0, 6.0)), top + Vector((0.0, 0.0, 0.0)), 45.0, (1600, 1100)),
        "junction": (top + Vector((1.1, -1.9, -0.55)), top + Vector((0.0, 0.0, -0.25)), 40.0, (1600, 1100)),
        "roof": (rf + Vector((1.2, -4.2, 1.9)), rf + Vector((0.0, 0.0, 0.5 * hr)), 40.0, (1400, 1100)),
        "roof_close": (rf + Vector((0.6, -1.6, 2.3)), rf + Vector((0.0, 0.0, 0.62 * hr)), 50.0, (1400, 1100)),
    }
    shots = [s for s in opts.get("shots", ",".join(views)).split(",") if s]
    cam = bpy.data.objects.new("RBP_palm_tree_test_cam", bpy.data.cameras.new("RBP_palm_tree_test_cam"))
    cam.data.clip_start = 0.02
    coll.objects.link(cam)
    scene.camera = cam
    for name in shots:
        loc, target, vfov, res = views[name]
        _aim(cam, loc, target, vfov)
        scene.render.resolution_x, scene.render.resolution_y = res
        scene.render.filepath = os.path.join(out, f"tree_{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"PALM_TREE rendered {name} ({device}) -> {scene.render.filepath}")
    print("PALM_TREE TEST DONE (the .blend is not saved)")


if __name__ == "__main__":
    _test(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
