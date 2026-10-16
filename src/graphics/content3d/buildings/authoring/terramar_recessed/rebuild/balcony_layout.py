# balcony_layout.py -- AI 645: the balconies layout of the Terra & Mar rebuild (pure Python; used by make_plan.py).
#
# Read from b8 (2026-10-13 crops): frameless clear glass guards with a slim dark top rail about 1.0 m above the floor,
# on a dark base shoe just behind the slab fascia, following the rounded corners; the first residential floor's guards
# run on the podium edge with planters behind; every slab underside is warm wood with small downlights.
#
# The balcony is the slab's ring outside the tower wall line (uniform 1.5 m, user 2026-10-12). Its walking surface runs
# from the window frames' outer face (wall line + half the frame depth) to the guard shoe (guard line - half the shoe),
# split at the front pilasters like the slabs. The guard runs on the guard line (the balcony edge inset 0.15 m),
# stopping against the pilasters: the runs round the building from pilaster to pilaster, and the flush centre loggia's
# run between them.
#
# User fix 10 (2026-10-15): b8's chamfer columns stand at the slab edge and break the guard. The room-dividing columns
# now run out across the balcony as piers to the guard's outer face (make_plan.py), so the paving and the guard are
# cut at each pier's sides (split_at_piers, ring_at_piers): a piece and a run per room, each run stopping against the
# pier with an end post ("stop" ends in guard_layout); no downlight sits under a pier's top (fix 14: nor near one).
#
# User fix 8 (2026-10-15): no curved glass. guard_layout() cuts a run into flat panels that never bend: equal panels of
# at most panel_max per straight leg, a slim charcoal post (TM_RB_frame) at every glass-to-glass junction -- between
# panels on a leg and at every corner turn -- under the continuous top rail; the glass stops `clearance` short of each
# post. Fix 8b: the guard line (make_plan.py guard_line()) has sharp corners, no fillet chords, so a leg is a whole run
# from corner to corner (or pilaster) and two legs meet at one post on the corner's bisector.
#
# User fix 14 (2026-10-15: "this light got too close from the wall; redistribute all lights so there is a minimum
# padding, or just remove them if it would be too cluttered; the current distance between lights is good"): the soffit
# downlights were laid out per stretch of the soffit's centre line between its stops (the piers and the pilasters),
# evenly at about the old pitch (since fix 17 they sit at the soffit plates' centres); make_plan.py measures every
# light's rim in plan against the piers, the pilasters, the wall line and the slab edge (loop_distance) and drops any
# light short of the clearance.
#
# User fix 17 (2026-10-15: "use the wood material in the ceiling of all floors replacing the orange finish. favor larger
# wood pieces; horizontally larger (and layout as if it is luxury)"; addendum: "use one light source on each plate,
# centralized"): soffit_plates() lays every balcony soffit with long veneer plates running along the facade, in three
# courses parallel to the slab edge (the border course on the free edge, the light course on the soffit's centre line,
# the inner course against the window frames). Each leg of the sharp outline is cut at the room-dividing piers and the
# pilasters into segments, which are divided symmetrically into equal plates near the target length; the end joints are
# shared by the three courses, the legs meet on mitres (the corner's bisector) and a pier's front gets a filler of the
# border course. One downlight sits at the centre of each light-course plate, so lights and plates are laid out
# together (this replaces fix 14's even pitch).
import hashlib
import math
import random


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1])


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1]


def pier_cuts(path, piers, half):
    """User fix 10 (2026-10-15): the points where the room-dividing piers' sides (u = -half and +half from each pier's
    centre line, along the run) cross an open polyline running the same way as the runs (counter-clockwise), in order
    along it: [(arc length, point, pier index, side -1 / +1)]. A pier the path does not cross is skipped. A pier may
    carry its own "half" (user fix 14: the soffit lights' stops mix the piers and the pilasters)."""
    cuts = []
    for k, c in enumerate(piers):
        at, U, N = c["at"], c["along"], c["outward"]
        h = c.get("half", half)
        for side in (-1, 1):
            o = (at[0] + U[0] * side * h, at[1] + U[1] * side * h)
            acc = 0.0
            for a, b in zip(path, path[1:]):
                d = _sub(b, a)
                ln = math.hypot(*d)
                den = d[0] * N[1] - d[1] * N[0]                       # the segment against the cut line o + N * t
                if ln > 1e-9 and abs(den) > 1e-9:
                    t = ((o[0] - a[0]) * N[1] - (o[1] - a[1]) * N[0]) / den
                    if -1e-9 <= t <= 1 + 1e-9:
                        q = (a[0] + d[0] * t, a[1] + d[1] * t)
                        if _dot(_sub(q, at), N) > -0.5:               # on the pier's own side of the building
                            cuts.append((acc + ln * t, q, k, side))
                            break
                acc += ln
    return sorted(cuts)


def cut_path(path, s0, s1):
    """The stretch of an open polyline from arc length s0 to s1."""
    out, acc = [], 0.0
    for a, b in zip(path, path[1:]):
        ln = math.dist(a, b)
        lerp = lambda s: (a[0] + (b[0] - a[0]) * (s - acc) / ln, a[1] + (b[1] - a[1]) * (s - acc) / ln)  # noqa: E731
        if ln > 1e-12 and acc + ln > s0 and acc < s1:
            if not out:
                out.append(lerp(max(s0, acc)))
            if acc + ln < s1:
                out.append(tuple(b))
            else:
                out.append(lerp(s1))
        acc += ln
    return [p for i, p in enumerate(out) if i == 0 or math.dist(p, out[i - 1]) > 1e-7]


def split_at_piers(path, piers, half):
    """An open path cut by the piers into the stretches between them: [(stretch, start end, finish end)], an end
    "pier" where it stops against a pier's side, else "end" (the path's own end)."""
    cuts = pier_cuts(path, piers, half)
    marks = [(0.0, "end")] + [(s, "pier") for s, _, _, _ in cuts] + [(path_length(path), "end")]
    out = []
    for (s0, k0), (s1, k1) in zip(marks[0::2], marks[1::2]):
        out.append((cut_path(path, s0, s1), k0, k1))
    return out


def ring_at_piers(ring, piers, half):
    """A closed path (ring[0] == ring[-1]) cut by the piers: the open stretches from one pier to the next."""
    cuts = pier_cuts(ring, piers, half)
    if not cuts:
        return [(ring, "end", "end")]
    total = path_length(ring)
    s = [c[0] for c in cuts]                                # each pier's near side, then its far side, in turn
    doubled = list(ring) + list(ring[1:])                   # the ring twice, so the last stretch runs on past its start
    out = []
    for k in range(1, len(s), 2):
        s1 = s[k + 1] if k + 1 < len(s) else s[0] + total
        out.append((cut_path(doubled, s[k], s1), "pier", "pier"))
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


def _seg_dist(p, a, b):
    d = _sub(b, a)
    ln2 = _dot(d, d)
    t = min(max(_dot(_sub(p, a), d) / ln2, 0.0), 1.0) if ln2 > 1e-18 else 0.0
    return math.dist(p, (a[0] + d[0] * t, a[1] + d[1] * t))


def _inside(p, loop):
    c = False
    for a, b in zip(loop, loop[1:] + loop[:1]):
        if (a[1] > p[1]) != (b[1] > p[1]) and p[0] < a[0] + (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]):
            c = not c
    return c


def loop_distance(p, loop):
    """Plan distance from p to a closed loop's outline, negative inside it."""
    d = min(_seg_dist(p, a, b) for a, b in zip(loop, loop[1:] + loop[:1]))
    return -d if _inside(p, loop) else d


def plate_count(length, lo, hi, target):
    """User fix 17: how many equal plates a segment `length` long divides into: the count whose plate length lies in
    [lo, hi] nearest `target` by ratio; when none fits, the count nearest the target (at least one)."""
    fits = [n for n in range(1, int(length / max(lo, 1e-6)) + 2) if lo - 1e-9 <= length / n <= hi + 1e-9]
    if fits:
        return min(fits, key=lambda n: abs(math.log(length / n / target)))
    return max(1, round(length / target))


def clip_convex(poly, clip):
    """Sutherland-Hodgman: the part of the polygon inside the convex CCW loop `clip`."""
    out = list(poly)
    for a, b in zip(clip, clip[1:] + clip[:1]):
        side = lambda p: (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])  # noqa: E731
        src, out = out, []
        for i, p in enumerate(src):
            q = src[i - 1]
            sp, sq = side(p), side(q)
            if sp >= 0:
                if sq < 0:
                    t = sq / (sq - sp)
                    out.append((q[0] + (p[0] - q[0]) * t, q[1] + (p[1] - q[1]) * t))
                out.append(p)
            elif sq >= 0:
                t = sq / (sq - sp)
                out.append((q[0] + (p[0] - q[0]) * t, q[1] + (p[1] - q[1]) * t))
        if not out:
            return []
    return [p for i, p in enumerate(out) if math.dist(p, out[i - 1]) > 1e-6]


def soffit_plates(sharp, stops, cfg, clip, names):
    """User fix 17 (2026-10-15): the veneer plates and the downlights of a balcony soffit.

    sharp: the balcony edge's sharp polygon (CCW); leg i runs from sharp[i] to sharp[i + 1], named names[i]. Plan
    coordinates on a leg: s along it from its start corner, t inwards from the slab edge. stops: the room-dividing piers
    and the pilasters ({"at", "along", "outward", "half", "front"}: front = the t of the face towards the slab edge, a
    pier's; None for a pilaster, which is proud of the edge). cfg: "edge" (t of the free edge's shadow gap line, where the
    plates start), "wall" (t of the window frames' outer face), "joints" (the two course joints' t), "light_course",
    "plate" ([lo, hi]) and "target" (the light course's plate length), "reveal", "seed". clip: the free edge's line
    inset by the reveal (convex, CCW; it rounds the border plates at the filleted corners).

    Each leg is cut at the stops into segments; a segment (between a corner mitre and a stop, two stops or two mitres) is
    divided, measured on the light course's centre line, into plate_count() equal plates; the joints are square to the
    leg and shared by the three courses, the plates stop a reveal short of a stop, half a reveal from a joint or a mitre
    (the corner's bisector), and the border course's plates are clipped to the rounded free edge. In front of a pier the
    border course gets a filler plate from the free edge to the pier's face. One light at the centre of each plate of the
    light course. Returns {"plates": [...], "lights": [[x, y]], "segments": [...]}."""
    r = cfg["reveal"]
    e0, e1 = cfg["edge"], cfg["wall"]
    tj = cfg["joints"]
    lc = cfg["light_course"]
    bounds = [e0, tj[0], tj[1], e1]
    tc = (bounds[lc] + bounds[lc + 1]) / 2
    n = len(sharp)
    unit = lambda v: (lambda ln: (v[0] / ln, v[1] / ln))(math.hypot(*v))  # noqa: E731
    dirs = [unit(_sub(sharp[(i + 1) % n], sharp[i])) for i in range(n)]
    half_turn = [math.atan2(dirs[i - 1][0] * dirs[i][1] - dirs[i - 1][1] * dirs[i][0], _dot(dirs[i - 1], dirs[i])) / 2
                 for i in range(n)]                                      # half the turn at each corner (CCW: > 0)
    plates, lights, segments = [], [], []
    for i in range(n):
        p0, U = sharp[i], dirs[i]
        N = (-U[1], U[0])                                                # inwards (left of a CCW leg)
        length = math.dist(p0, sharp[(i + 1) % n])
        h0, h1 = half_turn[i], half_turn[(i + 1) % n]
        world = lambda s, t, p0=p0, U=U, N=N: (p0[0] + U[0] * s + N[0] * t, p0[1] + U[1] * s + N[1] * t)  # noqa: E731
        # a segment end: (kind, value): "mitre" at the start (value 0) or the end (1), or "stop" at s = value
        marks = [("mitre", 0)]
        on_leg = []
        for st in stops:
            if abs(_dot(st["along"], U)) < 0.999:
                continue
            sc = _dot(_sub(st["at"], p0), U)
            tt = _dot(_sub(st["at"], p0), N)
            if -0.5 < tt < e1 + 1.0 and 0.0 < sc < length:
                on_leg.append((sc, st))
        on_leg.sort(key=lambda q: q[0])
        for sc, st in on_leg:
            marks += [("stop", sc - st["half"]), ("stop", sc + st["half"])]
        marks.append(("mitre", 1))

        def s_at(mark, t, side):
            """The s of a segment end at depth t: its line (a mitre slants with t), moved into the plate by the reveal
            (`side` +1 at a segment's start, -1 at its end)."""
            kind, v = mark
            if kind == "stop":
                return v + side * r
            if v == 0:
                return t * math.tan(h0) + side * (r / 2) / math.cos(h0)
            return length - t * math.tan(h1) + side * (r / 2) / math.cos(h1)

        for k in range(0, len(marks), 2):
            a, b = marks[k], marks[k + 1]
            sa, sb = s_at(a, tc, 0), s_at(b, tc, 0)                      # the segment on the light course's centre line
            seg_len = sb - sa
            if seg_len < 0.3:
                continue
            m = plate_count(seg_len, cfg["plate"][0], cfg["plate"][1], cfg["target"])
            joints = [sa + seg_len * q / m for q in range(1, m)]
            segments.append({"leg": names[i], "length": round(seg_len, 3), "plates": m, "plate": round(seg_len / m, 3),
                             "ends": [a[0], b[0]]})
            for q in range(m):
                p = world(sa + seg_len * (q + 0.5) / m, tc)
                lights.append([round(p[0], 4), round(p[1], 4)])
            for c in range(3):
                ta = bounds[c] + (r - 0.002 if c == 0 else r / 2)        # the border: 2 mm past the clip line
                tb = bounds[c + 1] - (r if c == 2 else r / 2)
                for q in range(m):
                    lo = (lambda t: s_at(a, t, 1)) if q == 0 else (lambda t, s=joints[q - 1]: s + r / 2)
                    hi = (lambda t: s_at(b, t, -1)) if q == m - 1 else (lambda t, s=joints[q]: s - r / 2)
                    loop = [world(lo(ta), ta), world(hi(ta), ta), world(hi(tb), tb), world(lo(tb), tb)]
                    if c == 0:
                        loop = clip_convex(loop, clip)
                    plates.append({"loop": loop, "leg": names[i], "course": c, "light": c == lc, "u": U,
                                   "p0": p0, "n": N, "t0": max(ta, bounds[0] + r), "w": tb - max(ta, bounds[0] + r),
                                   "key": f"{names[i]}:{sa:.3f}:{c}:{q}"})
        for sc, st in on_leg:                                            # a pier's front: the border course's filler
            if st.get("front") is None:
                continue
            ta, tb = bounds[0] + r - 0.002, st["front"] - r
            loop = [world(sc - st["half"], ta), world(sc + st["half"], ta), world(sc + st["half"], tb),
                    world(sc - st["half"], tb)]
            plates.append({"loop": clip_convex(loop, clip), "leg": names[i], "course": 0, "light": False, "u": U,
                           "p0": p0, "n": N, "t0": bounds[0] + r, "w": tb - bounds[0] - r, "key": f"{names[i]}:{sc:.3f}:filler"})
    rd = lambda v: [round(v[0], 5), round(v[1], 5)]  # noqa: E731
    out = []
    for pl in plates:
        rng = random.Random(hashlib.md5(f"{cfg['seed']}:{pl['key']}".encode()).hexdigest())
        out.append({"loop": [rd(p) for p in pl["loop"]], "leg": pl["leg"], "course": pl["course"], "light": pl["light"],
                    "u": rd(pl["u"]), "p0": rd(pl["p0"]), "n": rd(pl["n"]), "t0": round(pl["t0"], 5),
                    "w": round(pl["w"], 5), "seed": round(rng.random(), 6), "dv": round(rng.uniform(0.0, 3.0), 4)})
    return {"plates": out, "lights": lights, "segments": segments, "light_t": round(tc, 4)}


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


def guard_layout(path, g, ends=("open", "open")):
    """User fix 8: the flat glass panels and the connector posts of a guard run (g = plan["balconies"] dimensions).

    The run is cut into straight legs where it turns (facets, corners); each leg into equal panels of at most
    g["panel_max"]. A post stands at every junction: between two panels of a leg (square to it) and at every turn (on
    the turn's bisector). A closed run (path[0] == path[-1]) also has a post where it starts. An open run's ends are
    `ends`: "open" (the glass runs to the end: a pilaster, a pier, a wall), "post" (a post on the end point, owned by
    this run), "joint" (the glass stops clear of another run's post there) or "stop" (user fix 10, 2026-10-15: the run
    stops against a pier's side at the end point, and an end post stands there, its face on the pier; the leg's panels
    divide the span between the end posts' centres, so they stay equal). Returns {"panels": [[p0, p1], ...], "posts":
    [{"p", "t" (unit, along the post's width), "s" (arc length), "turn" (degrees), "kind"}]}, kind "straight",
    "corner" or "end" (a stop's post)."""
    pts = [tuple(p) for i, p in enumerate(path) if i == 0 or math.dist(p, path[i - 1]) > 1e-6]
    closed = math.dist(pts[0], pts[-1]) < 1e-6
    n = len(pts)
    dirs = [(lambda d, ln: (d[0] / ln, d[1] / ln))(_sub(pts[i + 1], pts[i]), math.dist(pts[i + 1], pts[i]))
            for i in range(n - 1)]
    cum = [0.0]
    for i in range(n - 1):
        cum.append(cum[-1] + math.dist(pts[i], pts[i + 1]))

    def turn(a, b):
        return math.atan2(a[0] * b[1] - a[1] * b[0], _dot(a, b))

    breaks = [0] + [i for i in range(1, n - 1) if abs(turn(dirs[i - 1], dirs[i])) > math.radians(0.1)] + [n - 1]
    pw, pd, cl = g["post"]["width"] / 2, g["post"]["depth"] / 2, g["post"]["clearance"]
    gh = g["glass"] / 2

    def clear(alpha):
        """How far the glass stops from a post on a turn of alpha (radians): clear of the post's square, set on the
        bisector, by `clearance` along the leg (the glass's inner arris is the nearest point)."""
        h = abs(alpha) / 2
        return (pw + cl + gh * math.sin(h)) / math.cos(h)

    posts, panels = [], []

    def post(p, a, b, s, kind=None):
        t = (a[0] + b[0], a[1] + b[1])
        ln = math.hypot(*t)
        alpha = turn(a, b)
        posts.append({"p": [round(p[0], 5), round(p[1], 5)], "t": [round(t[0] / ln, 6), round(t[1] / ln, 6)],
                      "s": round(s, 5), "turn": round(math.degrees(alpha), 3),
                      "kind": kind or ("corner" if abs(math.degrees(alpha)) > 1.0 else "straight")})
        return clear(alpha)

    legs = list(zip(breaks, breaks[1:]))
    end_clear = []                                            # each leg's start: the post there, or the run's end
    for k, (i, j) in enumerate(legs):
        if k > 0 or closed:                                   # a turn (or a closed run's start): dirs[-1] is the last leg's
            e0 = post(pts[i], dirs[i - 1], dirs[i], cum[i])
        elif ends[0] == "post":
            e0 = post(pts[i], dirs[i], dirs[i], cum[i])
        elif ends[0] == "stop":                               # the end post's centre, its face on the pier
            d = dirs[i]
            e0 = post((pts[i][0] + d[0] * pw, pts[i][1] + d[1] * pw), d, d, cum[i] + pw, "end")
        else:
            e0 = clear(0.0) if ends[0] == "joint" else 0.0
        end_clear.append(e0)
    for k, (i, j) in enumerate(legs):
        e0 = end_clear[k]
        if k + 1 < len(legs):
            e1 = end_clear[k + 1]
        elif closed:
            e1 = end_clear[0]
        elif ends[1] == "post":
            e1 = post(pts[j], dirs[j - 1], dirs[j - 1], cum[j])
        elif ends[1] == "stop":
            d = dirs[j - 1]
            e1 = post((pts[j][0] - d[0] * pw, pts[j][1] - d[1] * pw), d, d, cum[j] - pw, "end")
        else:
            e1 = clear(0.0) if ends[1] == "joint" else 0.0
        o0 = pw if k == 0 and not closed and ends[0] == "stop" else 0.0          # a stop: divide from the post's centre
        o1 = pw if k == len(legs) - 1 and not closed and ends[1] == "stop" else 0.0
        a, d, length = (pts[i][0] + dirs[i][0] * o0, pts[i][1] + dirs[i][1] * o0), dirs[i], cum[j] - cum[i] - o0 - o1
        at = lambda s, a=a, d=d: (a[0] + d[0] * s, a[1] + d[1] * s)  # noqa: E731
        m = max(1, math.ceil(length / g["panel_max"] - 1e-9))
        w = length / m
        for q in range(m):
            s0 = q * w + (e0 if q == 0 else clear(0.0))
            s1 = (q + 1) * w - (e1 if q == m - 1 else clear(0.0))
            panels.append([[round(c, 5) for c in at(s0)], [round(c, 5) for c in at(s1)]])
            if q:
                post(at(q * w), d, d, cum[i] + o0 + q * w)
    posts.sort(key=lambda p: p["s"])
    return {"panels": panels, "posts": posts}


def post_loop(post, g):
    """The footprint of a guard post: a square-cornered section, width along post["t"], depth across."""
    (x, y), (tx, ty) = post["p"], post["t"]
    w, d = g["post"]["width"] / 2, g["post"]["depth"] / 2
    return [(x + tx * su * w - ty * sv * d, y + ty * su * w + tx * sv * d) for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1))]


def corner_groups(layout, span=1.2):
    """The corner posts grouped by slab corner: consecutive corner posts less than `span` apart (a fillet's facets)."""
    groups = []
    for p in layout["posts"]:
        if p["kind"] != "corner":
            continue
        if groups and p["s"] - groups[-1][-1]["s"] < span:
            groups[-1].append(p)
        else:
            groups.append([p])
    return groups
