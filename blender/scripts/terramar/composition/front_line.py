# front_line.py -- which city buildings the cameras actually see (2026-10-17): every city / context building's share of
# every still (render_city_shots.py VIEWS) and of the flyover's shots (first, middle and last pose of each), measured
# with a grid of rays from each camera. city_neighbours.FRONT_LINE is the list of those at MIN_SHARE or more of some
# frame (plus the buildings the user marked); rerun this after moving cameras to see what the new framings reach.
#
#   blender -b <city scene .blend> -P front_line.py -- [min=0.4] [grid=160]
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
import city_common as C  # noqa: E402

args, _ = C.parse_args(sys.argv)
MIN_SHARE = float(args.get("min", 0.4))       # percent of a frame
NX = int(args.get("grid", 160))               # rays across the frame's long side

# the stills: the VIEWS table of render_city_shots.py, evaluated as that script does
src = open(BP.script('terramar/render/render_city_shots.py'), encoding="utf-8").read()
a = src.index("VIEWS = {"); b = src.index("\n}\n", a) + 3
ns = {"G": C.Z_GROUND, "E": C.Z_GROUND + C.EYE}
exec(src[a:b], ns)
views = {k: (v[0], v[1], v[2], False) for k, v in ns["VIEWS"].items()}
# the flyover: its shots' poses at the start, middle and end of each move
fsrc = open(BP.script('terramar/render/render_flyover.py'), encoding="utf-8").read()
fa = fsrc.index("G = C.Z_GROUND  "); fb = fsrc.index("N_MOVE = int(round(SECS * FPS))")
fns = {"C": C, "math": math, "EYE": C.EYE, "TAIL_SECS": 2.0, "lerp": lambda p, q, t: tuple(x + (y - x) * t for x, y in zip(p, q))}
exec(fsrc[fa:fb], fns)
for s in fns["SHOTS"]:
    for t in (0.0, 0.5, 1.0):
        eye, aim = s[2](t)
        views[f"fly_{s[0]}_{t:g}"] = (eye, aim, s[1], True)

S = bpy.context.scene
dg = bpy.context.evaluated_depsgraph_get()
cand = {o.name for o in bpy.data.objects if o.library is None and o.type == 'MESH'
        and o.name.startswith(("city_bld", "ctx_neighbour", "ctx_shed", "ctx_far", "nb_"))}
share = {}
for vn, (eye, aim, lens, portrait) in views.items():
    eye, aim = Vector(eye), Vector(aim)
    f = (aim - eye).normalized(); r = f.cross(Vector((0, 0, 1))).normalized(); u = r.cross(f)
    w, h = (9, 16) if portrait else (16, 9)
    half = 18.0 / lens
    hx, hy = half * w / max(w, h), half * h / max(w, h)
    nx, ny = (NX * 9 // 16, NX) if portrait else (NX, NX * 9 // 16)
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
print("FRONT LINE (>= %.2f%%): %s" % (MIN_SHARE, [k for m, k, _ in rows if m >= MIN_SHARE]))
