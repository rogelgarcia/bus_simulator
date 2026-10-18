"""The horn's arm and the heart as clean quad cards in their part's card frame (mm, y up, origin at the alpha box's
bottom-left): arm_strip3, a ladder between the arm's two edges with a station per row; the heart with its beads and
berries cut out (cut_heart) and its half round each eye as an envelope in polar coordinates (polar_ring,
heart_polar)."""
import numpy as np
from layout import Card, arc
from quadcards import ccw, ray_params, seg_array, mirror_merge


# ---------------------------------------------------------------- the heart: beads and berries cut out (their spheres fill the holes)
HEART_BALLS = [  # (x frac, y frac, rx frac of W, ry frac of H): measured on the texture (user 2026-10-03 rework)
    (0.502, 0.788, 0.0715, 0.085), (0.502, 0.647, 0.0635, 0.065), (0.503, 0.500, 0.0635, 0.072), (0.503, 0.338, 0.0675, 0.090),
    (0.360, 0.264, 0.0757, 0.110), (0.640, 0.264, 0.0757, 0.110)]


def balls_mm(W, H):
    return [(fx * W, fy * H, rx * W, ry * H) for fx, fy, rx, ry in HEART_BALLS]


def cut_heart(sub, mmpx, W, H, grow=1.5, spine=5.0):
    """The heart's mask with every bead and berry cut out (their drawn outlines + `grow` mm: no crescent of them stays
    in the card, so no wall stands at their edges -- the 3D beads and berries fill the holes), except a thin spine
    down the middle that keeps the two eyes apart (hidden behind the beads)."""
    Hs, Ws = sub.shape
    yy, xx = np.mgrid[0:Hs, 0:Ws]
    X = (xx + 0.5) * mmpx; Y = (Hs - yy - 0.5) * mmpx
    out = sub.copy()
    balls = balls_mm(W, H)
    xc = 0.502 * W
    keep_spine = np.abs(X - xc) < spine
    for k, (cx, cy, rx, ry) in enumerate(balls):
        g = grow if k < 4 else -4.0                         # the berries: a smaller hole (the C-scrolls pass under them)
        inside = ((X - cx) / max(rx + g, 1.0)) ** 2 + ((Y - cy) / max(ry + g, 1.0)) ** 2 <= 1.0
        if k < 4: inside &= ~keep_spine                     # the beads: the spine stays
        if k == 0: inside &= Y < cy                         # the top bead: only its lower half (the connector bar runs behind its upper half)
        out &= ~inside
    # the necks between the beads: the column between them, except the spine
    top, bot = balls[0], balls[3]
    half = max(b[2] for b in balls[:4]) + grow
    col = (np.abs(X - xc) < half) & (Y > bot[1]) & (Y < top[1]) & ~keep_spine
    out &= ~col
    return out


def near_balls(W, H, margin=3.0):
    """wall_skip for the heart: True near a bead or berry (their 3D bodies give the volume there)."""
    balls = balls_mm(W, H)
    def f(u, v):
        return any(((u - cx) / (rx + margin)) ** 2 + ((v - cy) / (ry + margin)) ** 2 < 1.0 for cx, cy, rx, ry in balls)
    return f


def polar_ring(outer, eye, x0, tol=2.5, merge_deg=3.0, max_deg=18.0, rows=2, side=1.0):
    """The heart's half round one eye, as an envelope in polar coordinates about the eye's centre: per angle the eye's
    edge (first crossing) and the outer outline's farthest crossing, capped at the symmetry line x = x0; tight two-sided
    DP on both (corners ON the outlines, re-inserted wherever a straight edge would trim more than `tol`), rays at the
    corners, `rows` rows between. Rays from one centre cannot cross. Returns a Card (one half; mirror it on x0)."""
    from layout import Card
    import envelope as EVm
    P = ccw(outer); E = ccw(eye)
    A_ = 0.5 * np.sum(E[:, 0] * np.roll(E[:, 1], -1) - np.roll(E[:, 0], -1) * E[:, 1])
    cxe = np.sum((E[:, 0] + np.roll(E[:, 0], -1)) * (E[:, 0] * np.roll(E[:, 1], -1) - np.roll(E[:, 0], -1) * E[:, 1])) / (6 * A_)
    cye = np.sum((E[:, 1] + np.roll(E[:, 1], -1)) * (E[:, 0] * np.roll(E[:, 1], -1) - np.roll(E[:, 0], -1) * E[:, 1])) / (6 * A_)
    c = np.array([cxe, cye])
    SO, SE = seg_array([P]), seg_array([E])
    angs = np.radians(np.arange(0.0, 360.0, 0.5))
    rin, rout = [], []
    for a in angs:
        d = np.array([np.cos(a), np.sin(a)])
        te = ray_params(c, d, SE); te = te[te > 1e-6]
        to = ray_params(c, d, SO); to = to[to > 1e-6]
        r_i = float(te[0]) if len(te) else 0.0
        r_o = float(to[-1]) if len(to) else r_i
        if side * d[0] < -1e-9:                               # toward the symmetry line: capped there
            t_ax = (x0 - c[0]) / d[0]
            if t_ax > 0: r_o = min(r_o, t_ax); r_i = min(r_i, r_o)
        rin.append(r_i); rout.append(max(r_o, r_i))
    rin, rout = np.array(rin), np.array(rout)
    Rm = float(np.mean(rout))
    xs = angs * Rm                                            # the angle as arc length on a mean radius: DP tolerances in mm
    # unwrap: start the profile at the angle where the outer radius is smallest (a seam where nothing happens)
    k0 = int(np.argmin(np.abs(np.diff(np.r_[rout, rout[0]]))))
    order = np.r_[np.arange(k0, len(angs)), np.arange(0, k0)]
    xs_u = np.r_[xs[order[0]:], xs[:order[0]] + 2 * np.pi * Rm] if k0 > 0 else xs.copy()
    xs_u = np.r_[xs_u, xs_u[0] + 2 * np.pi * Rm]
    ro_u = np.r_[rout[order], rout[order[0]]]; ri_u = np.r_[rin[order], rin[order[0]]]
    tx, _ = EVm.tight_polyline(xs_u, ro_u, tol, merge_deg * np.pi / 180 * Rm)
    ix, _ = EVm.tight_polyline(xs_u, -ri_u, tol, merge_deg * np.pi / 180 * Rm)   # the eye: its edge must not be trimmed either (the card must not cover the eye... it may, the alpha clears it)
    cols = np.array(sorted(set(np.round(np.r_[tx, ix], 4))))
    out = [cols[0]]
    step = max_deg * np.pi / 180 * Rm
    for cc in cols[1:]:
        gap = cc - out[-1]; n = int(np.ceil(gap / step)); a0 = out[-1]
        for k in range(1, n): out.append(a0 + gap * k / n)
        out.append(cc)
    cx_ = np.array(out[:-1])                                  # the last one is the first again (closed)
    R_o = np.interp(cx_, xs_u, ro_u); R_i = np.interp(cx_, xs_u, ri_u)
    # the outer polyline at the columns: exact at its corners, linear in between (as tight_polyline's segments)
    R_o = np.interp(cx_, tx, np.interp(tx, xs_u, ro_u))
    R_i = np.interp(cx_, ix, np.interp(ix, xs_u, ri_u))
    th = cx_ / Rm
    card = Card()
    ids = []
    for t, r_i, r_o in zip(th, R_i, R_o):
        d = np.array([np.cos(t), np.sin(t)])
        ids.append([card.v(c + d * (r_i + (r_o - r_i) * k / rows)) for k in range(rows + 1)])
    nr = len(ids)
    for i in range(nr):
        j = (i + 1) % nr
        for k in range(rows):
            card.q(ids[i][k], ids[j][k], ids[j][k + 1], ids[i][k + 1])
    card.finish()
    card.info = dict(rays=nr, rows=rows)
    return card


def heart_polar(outer, holes, W, tol=2.5, rows=2):
    from trace import signed_area as _sa
    x0 = W / 2.0
    eyes = sorted(holes, key=lambda h: -abs(_sa(h)))[:2]
    eR = [h for h in eyes if np.mean(h[:, 0]) > x0][0]
    card = polar_ring(outer, eR, x0, tol=tol, rows=rows, side=1.0)
    return mirror_merge(card, x0)


def arm_strip3(band_outline, circle, mask_mm_mid, row=30.0, inset=0.0, root_fracs=(0.03, 0.07, 0.12, 0.18), debug=False):
    """The arm as a ladder between its two edges: the upper edge from the root's top corner to the tip, the lower edge
    from the root's bottom corner to the tip, each row pairing the points at the same fraction of both edges' lengths
    (rows cannot fan or cross; at the root they take the band's oblique exit from the roll). Closer rows near the root
    (root_fracs), then every ~`row` mm; a quad round the tip."""
    from bandlayout import catmull_rom
    from layout import Card, arc, resample, arc_len
    P = ccw(band_outline)
    cx, cy, r = circle; cc = np.array([cx, cy])
    d = np.hypot(P[:, 0] - cx, P[:, 1] - cy)
    n = len(P)
    idx = np.nonzero(d < r + 4.0)[0]
    runs = []; start = idx[0]; prev = idx[0]
    for i in idx[1:]:
        if i != prev + 1: runs.append((start, prev)); start = i
        prev = i
    runs.append((start, prev))
    if len(runs) > 1 and runs[0][0] == 0 and runs[-1][1] == n - 1:
        runs = [(runs[-1][0], runs[0][1])] + runs[1:-1]
    i0, i1 = max(runs, key=lambda rr: ((rr[1] - rr[0]) % n))
    A, B = P[i0], P[i1]
    m_orig = (A + B) / 2
    # the tip: the outline point farthest from the root chord's middle
    itip = int(np.argmax(np.hypot(*(P - m_orig).T)))
    # the two edges, both from their root corner to the tip (the outline is ccw: one of them runs backwards)
    E1 = arc(P, i1, itip) if True else None                               # from B forward to the tip
    E2 = arc(P, itip, i0)[::-1]                                           # from A to the tip (A forward = the other way round)
    if np.hypot(*(E1[0] - B)) > 1e-6: E1, E2 = arc(P, i0, itip), arc(P, itip, i1)[::-1]
    # which is the upper edge: the one starting at the corner farther from the circle's centre side ... keep A's edge as "L"
    if np.hypot(*(E1[0] - A)) < np.hypot(*(E1[0] - B)): EA, EB = E1, E2
    else: EA, EB = E2, E1
    Ai = cc + (A - cc) * (r - inset) / np.hypot(*(A - cc)); Bi = cc + (B - cc) * (r - inset) / np.hypot(*(B - cc))
    if inset > 0:                                                       # the root moved inside the circle: each edge starts there
        EA = np.vstack([Ai, EA]); EB = np.vstack([Bi, EB])
    sA = arc_len(EA); sB_ = arc_len(EB)
    def at(E, sE, f):
        t = f * sE[-1]; return np.array([np.interp(t, sE, E[:, 0]), np.interp(t, sE, E[:, 1])])
    Lmean = 0.5 * (sA[-1] + sB_[-1])
    fr = [0.0] + [f for f in root_fracs]
    nfree = max(1, int(round(Lmean * (1.0 - fr[-1]) / row)))
    fr += [fr[-1] + (1.0 - fr[-1]) * k / nfree for k in range(1, nfree)]  # stop short of the tip (the tip quad closes it)
    rowsL = [at(EA, sA, f) for f in fr]; rowsR = [at(EB, sB_, f) for f in fr]
    card = Card()
    Lv = [card.v(q) for q in rowsL]; Rv = [card.v(q) for q in rowsR]
    for k in range(len(fr) - 1):
        card.q(Lv[k], Rv[k], Rv[k + 1], Lv[k + 1])
    # the tip quad: the last row to two points round the tip
    tip = P[itip]
    qa = at(EA, sA, 1.0 - 0.35 * (1.0 - fr[-1])); qb = at(EB, sB_, 1.0 - 0.35 * (1.0 - fr[-1]))
    card.q(Lv[-1], Rv[-1], card.v(qb), card.v(tip))
    card.q(Lv[-1], card.v(tip), card.v(qa), Lv[-1]) if False else None
    card.finish()
    # the spine (texture centre line) from the (inset) root's middle to the tip, through the row middles
    mids = np.array([(l + r_) / 2 for l, r_ in zip(rowsL, rowsR)] + [tip])
    card.spine = catmull_rom(mids) if len(mids) > 3 else mids
    sS = arc_len(card.spine)
    card.spine_shift = float(sS[int(np.argmin(np.hypot(*(card.spine - m_orig).T)))]) if inset > 0 else 0.0
    card.root = (np.asarray(rowsL[0], float), np.asarray(rowsR[0], float))
    card.rows = (rowsL, [(l + r_) / 2 for l, r_ in zip(rowsL, rowsR)], rowsR)
    card.top_pts = np.array(rowsL, float)                                 # the top edge (first = the root's top corner)
    card.row_te = {}
    for l, r_ in zip(rowsL, rowsR):
        t_mid = float(sS[int(np.argmin(np.hypot(*(card.spine - (l + r_) / 2).T)))]) - card.spine_shift
        for q_ in (l, r_): card.row_te[(round(float(q_[0]), 2), round(float(q_[1]), 2))] = t_mid
    for q_ in (qa, qb, tip): card.row_te[(round(float(q_[0]), 2), round(float(q_[1]), 2))] = sS[-1] - card.spine_shift
    if debug: print("  arm_strip3: %d rows, edges %.0f / %.0f mm" % (len(fr), sA[-1], sB_[-1]))
    return card
