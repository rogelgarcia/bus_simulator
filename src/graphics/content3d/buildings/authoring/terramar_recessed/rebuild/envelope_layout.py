# envelope_layout.py -- AI 644: the glazing layout of the Terra & Mar rebuild (pure Python; used by make_plan.py).
#
# Read from b8 (2026-10-13 crops):
#   - every residential opening is a black-framed slider, panes about 1.0 m wide, a transom about 0.4 m below the head;
#   - the glazing wraps the front corners onto the chamfers, and meets the rounded chamfer columns and the pilasters;
#   - the front centre bay (between the pilasters) has warm wood reveal panels, about 0.66 m wide, on both sides on
#     floors 1-4, with four 1.0 m panes between; on floor 5 the panel zones are glazed (six panes).
#   - (user fix 7, 2026-10-15) the front chamfers are not glazed end to end: a solid stone panel stands on both sides of
#     each chamfer column and at the chamfer's far end, on every floor (env["wall_panels"]; a variant's "walls").
# The sides (C, G) and the rear (D, E, F) are seen in neither reference: they repeat the chamfer glazing.
#   - (user fix 10, 2026-10-15) the chamfer columns are piers out to the guard line (plan.structure.columns): at the
#     wall line their sides are flat, so a bay ends at the pier's side and its jamb or wall panel meets it face on.
#
# The tower wall line is the glazing line. Each run's straight part is cut into bays by its posts -- the rounded
# corner posts (on the wall line's 0.25 m fillets), the front pilasters and the chamfer columns -- and each bay into
# equal panes. Positions are metres along the bay from its start point a; v is the offset from the wall line (outward
# positive). The layer script turns the layout into frames, glass and wood; later layers read the door panes here.
import math


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1])


def _unit(v):
    n = math.hypot(*v)
    return (v[0] / n, v[1] / n)


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1]


def column_surface_u(col, v):
    """Half-width of the rounded column section at offset v from the wall line (its front corners are arcs)."""
    w, rf, rb = col["width"], col["front_radius"], col["back_radius"]
    vc = col["proud"] - rf
    if v <= vc:
        return w / 2 if v >= -col["behind"] + rb else w / 2 - rb + math.sqrt(max(rb * rb - (v + col["behind"] - rb) ** 2, 0.0))
    return (w / 2 - rf) + math.sqrt(max(rf * rf - (v - vc) ** 2, 0.0))


def panes(length, start_off, end_off, n, member):
    """n equal panes between the end offsets, (n - 1) mullions of `member` between them."""
    w = (length - start_off - end_off - (n - 1) * member) / n
    out, s = [], start_off
    for _ in range(n):
        out.append([round(s, 4), round(s + w, 4)])
        s += w + member
    return out


def doors(n):
    """The sliding panes: the middle pair of an even bay, the middle pane of an odd one; a single pane is fixed."""
    if n <= 1:
        return []
    if n % 2:
        return [n // 2]
    return [n // 2 - 1, n // 2]


def solid_ends(var, length, ends):
    """User fix 7 (2026-10-15): the end panes listed in `ends` ("start" / "end") become solid wall panels. A panel spans
    from the bay's end (its jamb included) to the mullion before the next pane; the doors keep their panes (renumbered)."""
    keep = list(range(len(var["panes"])))
    walls = []
    if "start" in ends and len(keep) > 1:
        walls.append([0.0, var["panes"][keep.pop(0)][1]])
    if "end" in ends and len(keep) > 1:
        walls.append([var["panes"][keep.pop()][0], round(length, 4)])
    return {**var, "panes": [var["panes"][i] for i in keep], "doors": [keep.index(i) for i in var["doors"] if i in keep],
            "walls": sorted(walls)}


def layout(wall_sharp, wall_radius, pilasters, columns, col_spec, env, runs):
    """Bays per run: [{id, run, a, b, along, outward, length, ends, variants: [{floors, panes, doors, wood}]}] + corners."""
    n = len(wall_sharp)
    t = wall_radius * math.tan(math.radians(22.5))          # every wall-line corner is 135 degrees
    d = env["frame_depth"] / 2
    member, gap, ext = env["member"], env["column_gap"], env["post_ext"]
    u_back = column_surface_u(col_spec, -d)
    floors = list(range(1, len(env["storeys"]) + 1))
    bays, corners = [], []
    for i, run in enumerate(runs):
        p, q = wall_sharp[i], wall_sharp[(i + 1) % n]
        along = _unit(_sub(q, p))
        outward = (along[1], -along[0])
        run_len = math.hypot(*_sub(q, p))
        posts = []                                            # (s0, s1, kind) occupied stretches along the run
        posts.append((0.0, t + ext, "corner"))
        posts.append((run_len - t - ext, run_len, "corner"))
        if run == "A":
            for x0, x1 in pilasters:
                posts.append((_dot(_sub((x0, p[1]), p), along), _dot(_sub((x1, p[1]), p), along), "pilaster"))
        for c in columns:
            if c["run"] == run:
                sc = _dot(_sub(c["at"], p), along)
                posts.append((sc - u_back - gap, sc + u_back + gap, "column"))
        posts.sort()
        k = 0
        for (s_a, e_a, kind_a), (s_b, e_b, kind_b) in zip(posts, posts[1:]):
            length = s_b - e_a
            if length <= 0.2:
                continue
            a = (p[0] + along[0] * e_a, p[1] + along[1] * e_a)
            b = (p[0] + along[0] * s_b, p[1] + along[1] * s_b)
            start_off = 0.0 if kind_a == "corner" else member
            end_off = 0.0 if kind_b == "corner" else member
            bay = {"id": f"{run}{k}", "run": run, "a": [round(a[0], 4), round(a[1], 4)], "b": [round(b[0], 4), round(b[1], 4)],
                   "along": [round(along[0], 6), round(along[1], 6)], "outward": [round(outward[0], 6), round(outward[1], 6)],
                   "length": round(length, 4), "ends": [kind_a, kind_b]}
            if run == "A" and kind_a == "pilaster" and kind_b == "pilaster":          # the front centre bay
                wood = env["wood_reveal"]
                inner = panes(length - 2 * wood, member, member, env["centre_panes"], member)
                inner = [[s0 + wood, s1 + wood] for s0, s1 in inner]
                wood_floors = [f for f in floors if f in env["wood_floors"]]
                glazed_floors = [f for f in floors if f not in env["wood_floors"]]
                bay["variants"] = [
                    {"floors": wood_floors, "wood": [[0.0, wood], [round(length - wood, 4), round(length, 4)]],
                     "panes": inner, "doors": doors(len(inner))},
                    {"floors": glazed_floors, "wood": [],
                     "panes": [[member, wood]] + inner + [[round(length - wood, 4), round(length - member, 4)]],
                     "doors": [m + 1 for m in doors(len(inner))]},
                ]
            else:
                count = max(1, round((length - start_off - end_off) / env["pane_target"]))
                pp = panes(length, start_off, end_off, count, member)
                bay["variants"] = [solid_ends({"floors": floors, "wood": [], "panes": pp, "doors": doors(count)}, length,
                                              env.get("wall_panels", {}).get(bay["id"], []))]
            bays.append(bay)
            k += 1
    for i in range(n):                                        # corner posts: the fillet at sharp corner i
        prev, p, nxt = wall_sharp[i - 1], wall_sharp[i], wall_sharp[(i + 1) % n]
        a_in, a_out = _unit(_sub(p, prev)), _unit(_sub(nxt, p))
        corners.append({"at": runs[i - 1] + "/" + runs[i], "sharp": [round(p[0], 4), round(p[1], 4)],
                        "in": [round(a_in[0], 6), round(a_in[1], 6)], "out": [round(a_out[0], 6), round(a_out[1], 6)]})
    return bays, corners
