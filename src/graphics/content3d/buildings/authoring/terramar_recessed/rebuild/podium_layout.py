# podium_layout.py -- AI 646: the podium layout of the Terra & Mar rebuild (pure Python; used by make_plan.py).
#
# Read from b8 (2026-10-13 crops, heights through the plan-fitted CAM_B8):
#   - the podium is stone, with stone piers at the corners and, on each chamfer, one under the tower's chamfer column:
#     two bays per chamfer, each a black-steel storefront below (two or three large panes under a transom band, an
#     awning over it at about 4.0-4.75 m) and a deep glazed recess above (5.79-9.15 m, a transom about 0.6 m below the
#     head) with a glass guard and a planter box at its base; stone bands between;
#   - the front: the projecting entrance volume (6.9 m) between the corner piers -- stone jambs about 0.57 m, a stone
#     lintel band from the portal head (4.0 m) carrying the sign, a warm-wood-lined vestibule with black-framed glass
#     double doors, sidelights and a transom row on a 1 m grid with wood panels at the sides; its roof is a terrace
#     with a glass guard, in front of a wood-lined loggia recess with the same glazing grid;
#   - small dark lanterns on the entrance jambs and on the chamfers' outer piers.
# The sides and the rear are seen in neither reference: they follow the chamfers (piers at corners and columns).
#
# Positions are metres along each run of the podium outline (the balcony-edge line) from its sharp start corner; v is
# the offset from the outline (outward positive, so the wall's depth is negative v).
import math


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1])


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1]


def _unit(v):
    n = math.hypot(*v)
    return (v[0] / n, v[1] / n)


def split_panes(length, start_off, end_off, n, member):
    w = (length - start_off - end_off - (n - 1) * member) / n
    out, s = [], start_off
    for _ in range(n):
        out.append([round(s, 4), round(s + w, 4)])
        s += w + member
    return out


def layout(poly, radii, runs, columns, entrance, cfg):
    """Corner piers, column piers and bays per run, the entrance pieces, lanterns and the prop reservations."""
    n = len(poly)
    t = [r * math.tan(math.radians(22.5)) for r in radii]          # every outline corner is 135 degrees
    ext = cfg["pier_ext"]
    e_half, e_front = entrance["half_width"], entrance["y_front"]
    out_runs, piers, bays = [], [], []
    for i, run in enumerate(runs):
        p, q = poly[i], poly[(i + 1) % n]
        along = _unit(_sub(q, p))
        outward = (along[1], -along[0])
        L = math.hypot(*_sub(q, p))
        s_start, s_end = t[i] + ext, L - t[(i + 1) % n] - ext       # the corner piers' inner faces on this run
        stops = []
        if run == "A":                                             # corner piers reach the entrance volume's sides
            s_start = _dot(_sub((-e_half, p[1]), p), along)
            s_end = _dot(_sub((e_half, p[1]), p), along)
        for c in columns:
            if c["run"] == run:
                sc = _dot(_sub(c["at"], p), along)                 # the column projected onto the outline run
                stops.append((sc - cfg["column_pier"] / 2, sc + cfg["column_pier"] / 2))
        out_runs.append({"run": run, "p": [round(p[0], 4), round(p[1], 4)], "along": [round(along[0], 6), round(along[1], 6)],
                         "outward": [round(outward[0], 6), round(outward[1], 6)], "length": round(L, 4),
                         "corner_pier_faces": [round(s_start, 4), round(s_end, 4)]})
        for a, b in stops:
            piers.append({"kind": "column", "run": run, "s": [round(a, 4), round(b, 4)]})
        if run == "A":
            continue                                               # the entrance volume, built on its own
        edges = [s_start] + [x for ab in stops for x in ab] + [s_end]
        for k in range(0, len(edges), 2):
            a, b = edges[k], edges[k + 1]
            length = b - a
            g_n = max(2, round((length - 2 * cfg["member"]) / cfg["storefront_pane"]))
            u_n = max(2, round((length - 2 * cfg["member"]) / cfg["upper_pane"]))
            bays.append({"id": f"{run}{k // 2}", "run": run, "s": [round(a, 4), round(b, 4)], "length": round(length, 4),
                         "storefront_panes": split_panes(length, cfg["member"], cfg["member"], g_n, cfg["member"]),
                         "storefront_door": g_n // 2, "upper_panes": split_panes(length, cfg["member"], cfg["member"], u_n, cfg["member"])})
    corners = []
    for i in range(n):                                             # corner piers: run i-1's end face to run i's start face
        corners.append({"at": runs[i - 1] + "/" + runs[i], "corner": i, "radius": radii[i]})
    # lanterns: the entrance jambs' fronts and the outer piers of both front chamfers
    lanterns = [{"kind": "entrance_jamb", "x": round(sgn * (e_half - entrance["jamb"] / 2), 4), "y": e_front, "outward": [0.0, -1.0]}
                for sgn in (-1, 1)]
    for run, end in (("B", 1), ("H", 0)):
        r = next(o for o in out_runs if o["run"] == run)
        s = r["corner_pier_faces"][end] + (cfg["pier_ext"] / 2 if end == 1 else -cfg["pier_ext"] / 2)
        pt = (r["p"][0] + r["along"][0] * s, r["p"][1] + r["along"][1] * s)
        lanterns.append({"kind": "chamfer_pier", "run": run, "x": round(pt[0], 4), "y": round(pt[1], 4), "outward": r["outward"]})
    return {"runs": out_runs, "corners": corners, "column_piers": piers, "bays": bays, "lanterns": lanterns}
