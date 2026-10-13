# balcony_layout.py -- AI 645: the balconies layout of the Terra & Mar rebuild (pure Python; used by make_plan.py).
#
# Read from b8 (2026-10-13 crops): frameless clear glass guards with a slim dark top rail about 1.0 m above the floor,
# on a dark base shoe just behind the slab fascia, following the rounded corners; the first residential floor's guards
# run on the podium edge with planters behind; every slab underside is warm wood with small downlights.
#
# The balcony is the slab's ring outside the tower wall line (uniform 1.5 m, user 2026-10-12). Its walking surface runs
# from the window frames' outer face (wall line + half the frame depth) to the guard shoe (guard line - half the shoe),
# split at the front pilasters like the slabs, and stepping round each rounded chamfer column's front. The guard runs
# on the guard line (the balcony edge inset 0.15 m), stopping against the pilasters: one long run from pilaster to
# pilaster round the building, and the flush centre loggia's run between them. In b8 the chamfer columns stand at the
# slab edge and break the guard; in the approved plan they stand 1.3 m back, so the guard passes in front of them.
import math


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1])


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1]


def column_front_v(col, u):
    """The rounded column section's outward extent at position u along the run (its front corners are arcs)."""
    w, rf = col["width"], col["front_radius"]
    uc, vc = w / 2 - rf, col["proud"] - rf
    au = abs(u)
    if au <= uc:
        return col["proud"]
    if au >= w / 2:
        return -col["behind"]
    return vc + math.sqrt(max(rf * rf - (au - uc) ** 2, 0.0))


def bulge_columns(loop, columns, col, v_line, gap, samples=8):
    """Detour the loop (an offset of the wall line by v_line, CCW) round the column fronts that reach past it."""
    out = [tuple(p) for p in loop]
    for c in columns:
        at, U, N = c["at"], c["along"], c["outward"]
        # the stretch of u where the column front lies beyond v_line
        lo, hi = 0.0, col["width"] / 2
        for _ in range(50):
            mid = (lo + hi) / 2
            if column_front_v(col, mid) > v_line:
                lo = mid
            else:
                hi = mid
        u_lim = lo + gap
        world = lambda u, v: (at[0] + U[0] * u + N[0] * v, at[1] + U[1] * u + N[1] * v)  # noqa: E731
        p0, p1 = world(-u_lim, v_line), world(u_lim, v_line)
        # find the loop edge that carries the column's stretch and splice the detour in
        for i in range(len(out)):
            a, b = out[i], out[(i + 1) % len(out)]
            d = _sub(b, a)
            ln = math.hypot(*d)
            if ln < 1e-9:
                continue
            t0, t1 = _dot(_sub(p0, a), d) / ln ** 2, _dot(_sub(p1, a), d) / ln ** 2
            off = abs(_sub(p0, a)[0] * d[1] - _sub(p0, a)[1] * d[0]) / ln
            if 0 < t0 < t1 < 1 and off < 2e-3:             # the plan rounds the markers to 1 mm
                us = [-u_lim + 2 * u_lim * k / samples for k in range(samples + 1)]
                q0 = (a[0] + d[0] * t0, a[1] + d[1] * t0)  # the detour's ends snapped onto the edge
                q1 = (a[0] + d[0] * t1, a[1] + d[1] * t1)
                detour = [q0] + [world(u, column_front_v(col, u) + gap) for u in us[1:-1]] + [q1]
                out = out[:i + 1] + detour + out[i + 1:]
                break
        else:
            raise ValueError(f"column {c['run']} at {at} is on no straight edge of the loop")
    return out


def _insert(loop, pts, eps=1e-6):
    out = []
    n = len(loop)
    for i in range(n):
        p, q = loop[i], loop[(i + 1) % n]
        out.append(tuple(p))
        d = _sub(q, p)
        ln2 = _dot(d, d)
        on = []
        for r in pts:
            t = _dot(_sub(r, p), d) / ln2 if ln2 > 1e-12 else -1
            if eps < t < 1 - eps and abs(_sub(r, p)[0] * d[1] - _sub(r, p)[1] * d[0]) / math.sqrt(ln2) < 1e-5:
                on.append((t, tuple(r)))
        out += [r for _, r in sorted(on)]
    return out


def _index(loop, p):
    for i, q in enumerate(loop):
        if abs(q[0] - p[0]) < 1e-5 and abs(q[1] - p[1]) < 1e-5:
            return i
    raise ValueError(f"{p} not on the loop")


def _path(loop, a, b):
    i, j = _index(loop, a), _index(loop, b)
    out = [loop[i]]
    while i != j:
        i = (i + 1) % len(loop)
        out.append(loop[i])
    return out


def split_at_pilasters(outer, inner, pilasters, y_outer, y_inner):
    """The ring between two CCW loops, cut by the pilasters: one long piece round the building and the centre piece."""
    (l_out, l_in), (r_in, r_out) = pilasters
    outer = _insert(outer, [(x, y_outer) for x in (l_out, l_in, r_in, r_out)])
    inner = _insert(inner, [(x, y_inner) for x in (l_out, l_in, r_in, r_out)])
    long_piece = _path(outer, (r_out, y_outer), (l_out, y_outer))
    long_piece += list(reversed(_path(inner, (r_out, y_inner), (l_out, y_inner))))
    centre = [(l_in, y_outer), (r_in, y_outer), (r_in, y_inner), (l_in, y_inner)]
    return long_piece, centre, outer, inner


def path_length(pts):
    return sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))


def downlights(centre_line, pilasters, y_front, spacing, margin):
    """Points every ~spacing along the soffit's centre line (CCW loop), clear of the pilasters."""
    pts = list(centre_line) + [centre_line[0]]
    total = path_length(pts)
    n = max(1, round(total / spacing))
    out, acc, k, i = [], 0.0, 0, 0
    targets = [total * (j + 0.5) / n for j in range(n)]
    for a, b in zip(pts, pts[1:]):
        seg = math.dist(a, b)
        while k < len(targets) and targets[k] <= acc + seg:
            t = (targets[k] - acc) / seg if seg > 0 else 0
            p = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
            near_pilaster = any(x0 - margin <= p[0] <= x1 + margin for x0, x1 in pilasters) and p[1] < y_front + 2.0
            if not near_pilaster:
                out.append([round(p[0], 4), round(p[1], 4)])
            k += 1
        acc += seg
    return out


def planter_slots(bays, floors, guard_v, wood_reveal):
    """Pot slots per bay and floor against the guard: in front of the centre bay's wood panels, near the other bays' ends."""
    out = []
    for bay in bays:
        a, U, N, L = bay["a"], bay["along"], bay["outward"], bay["length"]
        if L < 1.2:
            continue
        for var in bay["variants"]:
            if var["wood"]:
                ss = [wood_reveal / 2, L - wood_reveal / 2]
            elif L >= 3.0:
                ss = [0.55, L - 0.55]
            else:
                ss = [L / 2]
            for f in var["floors"]:
                if f not in floors:
                    continue
                for s in ss:
                    out.append({"floor": f, "bay": bay["id"],
                                "at": [round(a[0] + U[0] * s + N[0] * guard_v, 4), round(a[1] + U[1] * s + N[1] * guard_v, 4)],
                                "radius": 0.28})
    return out
