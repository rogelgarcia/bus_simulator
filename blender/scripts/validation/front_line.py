# front_line.py -- which city buildings a hero's cameras actually see (AI 651; from the Terra & Mar city's
# front_line.py, 2026-10-17): every city / context building's share of every still and of each flyover shot's first,
# middle and last pose, measured with a grid of rays from each camera in the hero's COMPOSITION (so the hero itself
# hides what it hides). city_neighbours.FRONT_LINE is the union, over both heroes, of the buildings at MIN_SHARE or more
# of some frame (plus the ones the user marked); rerun on both compositions after moving cameras.
#
#   blender -b <composition .blend> -P front_line.py -- hero=bradbury|terramar [min=0.4] [grid=160]
#
# The views: Bradbury -- the composition's cameras (build_scene.py's VIEWS) and BradburyBlock/render_flyover.py's
# SHOTS; Terra & Mar -- render_city_shots.py's VIEWS and its render_flyover.py's SHOTS. Prints FRONT LINE [...].
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import city_site as CS  # noqa: E402

args, _ = CS.parse_args(sys.argv)
HERO = args.get("hero", bpy.context.scene.get("composition", "terramar"))
MIN_SHARE = float(args.get("min", 0.4))       # percent of a frame
NX = int(args.get("grid", 160))               # rays across the frame's long side
lerp = lambda p, q, t: tuple(x + (y - x) * t for x, y in zip(p, q))   # noqa: E731

views = {}   # name -> (eye, aim, lens, (w, h))
if HERO == "terramar":
    TMC = BP.script('terramar/composition/.')
    sys.path.insert(0, TMC)
    import city_common as C  # noqa: E402
    src = open(BP.script('terramar/render/render_city_shots.py'), encoding="utf-8").read()
    a = src.index("VIEWS = {"); b = src.index("\n}\n", a) + 3
    ns = {"G": C.Z_GROUND, "E": C.Z_GROUND + C.EYE}
    exec(src[a:b], ns)
    views = {k: (v[0], v[1], v[2], (16, 9)) for k, v in ns["VIEWS"].items()}
    fsrc = open(BP.script('terramar/render/render_flyover.py'), encoding="utf-8").read()
    fa = fsrc.index("G = C.Z_GROUND  "); fb = fsrc.index("N_MOVE = int(round(SECS * FPS))")
    fns = {"C": C, "math": math, "EYE": C.EYE, "TAIL_SECS": 2.0, "lerp": lerp}
    exec(fsrc[fa:fb], fns)
else:
    for o in bpy.context.scene.objects:
        if o.type == 'CAMERA' and o.library is None:
            f = o.matrix_world.to_quaternion() @ Vector((0.0, 0.0, -1.0))
            views[o.name] = (tuple(o.location), tuple(o.location + f * 10.0), o.data.lens, tuple(o.get("frame", (16, 10))))
    fsrc = open(BP.script('bradbury/render/render_flyover.py'), encoding="utf-8").read()
    fa = fsrc.index("Z_GROUND, EYE = 0.201, 1.62"); fb = fsrc.index("N_MOVE = int(round(SECS * FPS))")
    fns = {"math": math, "args": {}}
    exec(fsrc[fa:fb], fns)
for s in fns["SHOTS"]:
    for t in (0.0, 0.5, 1.0):
        eye, aim = s[2](t)
        views[f"fly_{s[0]}_{t:g}"] = (eye, aim, s[1], (9, 16))

S = bpy.context.scene
dg = bpy.context.evaluated_depsgraph_get()
cand = {o.name for o in bpy.data.objects if o.type == 'MESH'
        and o.name.startswith(("city_bld", "ctx_neighbour", "ctx_shed", "ctx_far", "nb_"))}
share = {}
for vn, (eye, aim, lens, (w, h)) in views.items():
    eye, aim = Vector(eye), Vector(aim)
    f = (aim - eye).normalized(); r = f.cross(Vector((0, 0, 1))).normalized(); u = r.cross(f)
    half = 18.0 / lens
    hx, hy = half * w / max(w, h), half * h / max(w, h)
    nx, ny = (NX, max(1, NX * h // w)) if w >= h else (max(1, NX * w // h), NX)
    counts = {}
    for j in range(ny):
        for i in range(nx):
            d = (f + r * (((i + 0.5) / nx * 2 - 1) * hx) + u * ((1 - (j + 0.5) / ny * 2) * hy)).normalized()
            hit, _, _, _, ob, _ = S.ray_cast(dg, eye, d, distance=3000.0)
            if hit and ob is not None and ob.name in cand:
                key = ob.name[3:ob.name.rindex("_")] if ob.name.startswith("nb_") else ob.name   # a modelled building's parts count as the building
                counts[key] = counts.get(key, 0) + 1
    for k, c in counts.items():
        share.setdefault(k, {})[vn] = 100.0 * c / (nx * ny)
rows = sorted(((max(d.values()), k, sorted(d.items(), key=lambda kv: -kv[1])[:3]) for k, d in share.items()), reverse=True)
for m, k, top in rows:
    print(f"FRONT {'*' if m >= MIN_SHARE else ' '} {k:22s} {m:5.2f}%  " + ", ".join(f"{v} {s:.2f}" for v, s in top))
print(f"FRONT LINE {HERO} ({len(views)} views, >= {MIN_SHARE:.2f}%): {[k for m, k, _ in rows if m >= MIN_SHARE]}")
