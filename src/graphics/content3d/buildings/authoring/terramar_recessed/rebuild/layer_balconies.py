# layer_balconies.py -- AI 645: the balconies layer of the Terra & Mar rebuild, from plan["balconies"].
#
# Run through build.py (layers=balconies; needs the structure and the envelope). Builds RB_BALCONIES under
# its part root, per floor (1-5; floor 1 is the terrace on the podium roof, out to the podium edge):
#   rb_paving_f<n>      the walking surface (TM_RB_paving, 30 mm) from the window frames to the guard shoe
#   rb_guard_f<n>       the guard: a dark base shoe and top rail (TM_RB_frame) and frameless glass panels
#                       (TM_RB_glass, <= 1.6 m, 10 mm joints), on the guard line; one run round the building from
#                       pilaster to pilaster and the centre loggia's run between them
#   rb_thresholds_f<n>  a stone threshold (TM_RB_threshold) before every sliding pane of plan["envelope"]: the step
#                       from the balcony (paving top) to the door sill
#   rb_downlights_f<n>  the small downlights b8 shows in the soffit above the floor's balcony (TM_RB_downlight)
# It also sets the soffit tone: the structure's TM_RB_soffit face sets (every balcony underside) take
# plan["balconies"]["soffit_rgb"], matched to b8 under the calibrated rig.
import importlib
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import rb_lib as L  # noqa: E402

importlib.reload(L)

COLLECTION = "RB_BALCONIES"
LAYER = "balconies"


def tags(element, name, floor):
    return {"rb_layer": LAYER, "rb_element": element, "tm_element": COLLECTION, "tm_role": element, "rb_name": name,
            "rb_floor": floor}


def _unit(v):
    n = math.hypot(*v)
    return (v[0] / n, v[1] / n)


def ribbon(path, half):
    """Footprint of a strip of half-width `half` along an open polyline, mitred at the joints."""
    pts = [tuple(p) for i, p in enumerate(path) if i == 0 or math.dist(p, path[i - 1]) > 1e-6]
    n = len(pts)
    segs = [_unit((pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])) for i in range(n - 1)]
    normals = [(d[1], -d[0]) for d in segs]
    left, right = [], []
    for i in range(n):
        if i == 0:
            m = normals[0]
        elif i == n - 1:
            m = normals[-1]
        else:
            a, b = normals[i - 1], normals[i]
            k = 1.0 + a[0] * b[0] + a[1] * b[1]
            m = ((a[0] + b[0]) / k, (a[1] + b[1]) / k)
        right.append((pts[i][0] + m[0] * half, pts[i][1] + m[1] * half))
        left.append((pts[i][0] - m[0] * half, pts[i][1] - m[1] * half))
    return right + list(reversed(left))


def sub_path(path, s0, s1):
    """The part of an open polyline between arc lengths s0 and s1."""
    out, acc = [], 0.0
    for a, b in zip(path, path[1:]):
        seg = math.dist(a, b)
        lerp = lambda s: (a[0] + (b[0] - a[0]) * (s - acc) / seg, a[1] + (b[1] - a[1]) * (s - acc) / seg)  # noqa: E731
        if acc + seg >= s0 and acc <= s1 and seg > 0:
            if not out:
                out.append(lerp(max(s0, acc)))
            if acc + seg <= s1:
                out.append(tuple(b))
            else:
                out.append(lerp(s1))
                break
        acc += seg
    return [q for i, q in enumerate(out) if i == 0 or math.dist(q, out[i - 1]) > 1e-6]


def panels(path, max_len, gap):
    total = sum(math.dist(a, b) for a, b in zip(path, path[1:]))
    n = max(1, math.ceil(total / max_len))
    w = total / n
    return [sub_path(path, k * w + (gap / 2 if k else 0.0), (k + 1) * w - (gap / 2 if k < n - 1 else 0.0)) for k in range(n)]


def disc(centre, r, n=12):
    return [(centre[0] + r * math.cos(2 * math.pi * k / n), centre[1] + r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def build(plan):
    coll = L.layer_collection(COLLECTION)
    b, env = plan["balconies"], plan["envelope"]
    half_frame = env["frame_depth"] / 2
    shoe_h, shoe_w = b["shoe"]["height"], b["shoe"]["width"]
    rail_h, rail_w = b["rail"]["height"], b["rail"]["width"]
    soffit = L.material("TM_RB_soffit")
    bsdf = soffit.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*b["soffit_rgb"], 1.0)
    soffit.diffuse_color = (*b["soffit_rgb"], 1.0)
    made, glass_panels = [], 0
    for floor, (top, above) in enumerate(env["storeys"], start=1):
        walk = top + b["paving"]
        paving = [L.piece(loop, [(top, walk)], "TM_RB_paving", mat_bottom="TM_RB_hidden") for loop in b["paving_pieces"]]
        made.append(L.pieces(f"rb_paving_f{floor}", coll, paving, tags("paving", f"paving_f{floor}", floor)))

        rail_top = walk + b["guard_height"]
        guard = []
        for run in b["guard_runs"]:
            guard.append(L.piece(ribbon(run, shoe_w / 2), [(top, top + shoe_h)], "TM_RB_frame"))
            guard.append(L.piece(ribbon(run, rail_w / 2), [(rail_top - rail_h, rail_top)], "TM_RB_frame"))
            for pan in panels(run, b["panel_max"], b["panel_gap"]):
                guard.append(L.piece(ribbon(pan, b["glass"] / 2), [(top + shoe_h, rail_top - rail_h)], "TM_RB_glass"))
                glass_panels += 1
        made.append(L.pieces(f"rb_guard_f{floor}", coll, guard, tags("guard", f"guard_f{floor}", floor)))

        sills = []
        for bay in env["bays"]:
            var = next(v for v in bay["variants"] if floor in v["floors"])
            a, U, N = bay["a"], bay["along"], bay["outward"]
            for i in var["doors"]:
                s0, s1 = var["panes"][i]
                v0, v1 = half_frame, half_frame + b["threshold"]["depth"]
                loop = [(a[0] + U[0] * s + N[0] * v, a[1] + U[1] * s + N[1] * v) for s, v in ((s0, v0), (s1, v0), (s1, v1), (s0, v1))]
                sills.append(L.piece(loop, [(walk, walk + b["threshold"]["height"])], "TM_RB_threshold", mat_bottom="TM_RB_hidden"))
        made.append(L.pieces(f"rb_thresholds_f{floor}", coll, sills, tags("threshold", f"thresholds_f{floor}", floor)))

        dl = b["downlight"]
        lights = [L.piece(disc(p, dl["radius"]), [(above - dl["height"], above)], "TM_RB_downlight", mat_top="TM_RB_hidden")
                  for p in b["downlight_points"]]
        made.append(L.pieces(f"rb_downlights_f{floor}", coll, lights, tags("downlight", f"downlights_f{floor}", floor)))
    return {"collection": COLLECTION, "objects": len(made), "faces": sum(len(o.data.polygons) for o in made),
            "glass_panels": glass_panels, "soffit_rgb": b["soffit_rgb"], "names": [o.name for o in made]}
