# Glass grime on the panes (AI 571): the dust film a window pane gathers between two cleanings. Dust settles out of the
# city's air over the whole pane, so the film is fairly even; the little rain that reaches a pane runs down it and
# dries at its bottom rail, so a pane the rain reaches gathers a little more along its bottom edge and in its lower
# corners. Seen from the street a dusty pane is a little duller, greyer and hazier than a clean one: its reflection
# weakens, a faint grey veil lies over it, and less of the room behind shows through. It is no lighter, and it never
# becomes opaque.
#
# ONE WINDOW AT A TIME (the rework of 2026-09-23). The first cut laid the grime out by the pane's frame alone: a tide
# line and a pale band along every bottom rail, pale lower corners and drying lines hanging evenly from every head. On a
# block whose windows are all the same it stamped the same whitening at every window (user 2026-09-23: "i don't
# remember seeing such a dirty whitening pattern on a window"), and the photos agree: the Commons colour photos show
# each window a little different, some clean, some hazy, and no band along any rail, and the 1960 HABS photos none
# either. What sets one pane apart from the next on a real front is what the model does not carry -- when its tenant
# last cleaned it -- so each window draws, from a seed of its own (the sha256 of "glass_grime:" and its glass object's
# name; a portal's glass, which the building's staff clean as one, its portal's): when it was last cleaned (anywhere in
# its cycle, evenly: a window cleaned last week beside one due next week; a few tenants' windows neglected, older than a
# cycle), whether that cleaning missed the light that is hard to reach (a sash's upper light from inside, a top-floor
# arched light, fixed, a portal's transom lights), which then keeps some of the dust of the cycle before, and each light
# a little more or less than its window. Where the building offers a real reason, that leads and the draw modulates it:
#   - the height: a light a hand reaches from the pavement is washed often (the storefronts and the doors stay nearly
#     clean, CLEAN_HAND of an upper window's dust), now and then with a pole above that, and never from the street
#     above CLEAN_TOP;
#   - the shelter of its reveal (565's measure over the light: the share of the wind-driven rain its reveal, head and
#     neighbours keep off it): a light the rain rarely rinses keeps a little more (SHELTER_KEEP);
#   - the rain on the light (565's exposure over it): only a light the rain reaches has water to run down to its rail,
#     so only it gathers there, and each light draws how much, how high and how much more each lower corner holds.
# A film saturates (FILM_KNEE, FILM_MAX): past about a cycle's dust a pane sheds as much as settles on it, so the
# neglected windows, the missed lights and the arched lights' deep reveals do not pile up without end.
# The drying lines are gone: they hung at the same pitch from every head, and nothing in the photos shows them.
#
# THE LIGHTS. Each glass object is read as the street sees it: its plane, its outline, and the lights its frame leaves
# open, found with short rays from just in front of the glass (the frame's bars stand 2 to 6 cm proud of it, a wall's
# reveal much further out): the sashes of floors 2 to 4 are split by their meeting rail into a lower and an upper light,
# the top floor's arched windows by the transom bar into a rectangle and an arch-headed light, the storefronts by their
# dividers into two or three, the portal's transom glass by the door post into two.
#
# THE ATTRIBUTES: each face corner of the glass carries its light's own coordinates in metres (x from its left stile, y
# up from its bottom rail: linear over the planar glass, so exact at any distance), the light's size, its film and the
# shape of its gathering. So that every face lies in one light, a pane is cut along its bars' centre lines, behind the
# bars. The cutting is done on a COPY of each of the block's glass objects, which renders in the original's place while
# the feature is on (the framework's add_object(..., replaces=...)): the originals, meshes shared by up to 46 windows,
# stay exactly as they were for the feature and the layer off. The portal's glass needs no cut (each light is its own
# box) and carries its attributes in place; it is one mesh seen at three portals, so its film is written once per face
# of the block and the shader reads the one for the face the shading point stands on (the three portals stand on three
# faces): each portal's glass keeps its own.
#
# THE LOOK: the dust covers a share of the pane in proportion to its film, and there the pane is dust, not glass: the
# room behind no longer shows through (Alpha rises, Transmission falls), there is no glass to reflect (the BSDF's
# specular level falls: the layer routes it on glass since the rework), and the colour is the dust's own, a sooty warm
# grey about as dark as the window glass it hides. So the dust acts on the pane's contrast, not on its brightness:
# greyer, flatter and hazier, the reflection weaker, in sun no lighter than the clean pane (critique of 2026-09-24: the
# rework's light grey dust read up to a quarter lighter in sun, the whitening the user had rejected, where the Commons
# photo's hazy pane reads 0.94 of its clear neighbour; and its blur, the roughness raised, spread the sun's glint over a
# dusty pane near the mirror direction as a white sheet, so the glass keeps its own roughness), each held under a
# ceiling whatever the strength, so never opaque. No noise: over each light the film is one value, gathering smoothly
# toward its rail and lower corners, and nothing in the shader is drawn at random.
#
# PUBLISHED: `lights`, `windows` and `profile` (see the README's "Glass grime on the panes (AI 571)").
import hashlib, math
from collections import defaultdict
import numpy as np
from .. import classes
from ..geometry import FACADES, Z_GROUND, facade_of
from . import soiling

NAME = "glass_grime"
AI = 571
LABEL = "glass grime on the panes"
ORDER = 300                     # after the deposits on the masonry; glass is no other feature's
NEEDS = ("soiling",)            # the rain the glass takes and the shelter of its reveal (565's `exposure`, `shelter`)
DEFAULT_STRENGTH = 1.0
DEBUG_COLOR = (0.00, 0.55, 0.45)
# no MASK: the grime lies on the glass's own meshes, as attributes (a light's own frame is its coordinate system)

# ---------------------------------------------------------------------------------------------------- the lights
FRONT = 0.12            # the lights are looked for with rays from this far in front of the glass: the frame's bars
                        # stand 2 to 6 cm proud of it, a wall's reveal (0.3 m and more) and the portal's arch far more
SCAN = 0.01             # the scan lines' step
SCAN_AT = (0.1, 0.3, 0.5, 0.7, 0.9)   # the scan lines across the glass, as shares of its width or height
REFINE = 0.0005         # a light's edges are refined to this
BROAD = 0.9             # the glass's broad faces: their normal within 25 degrees of the face's own
ARCH_DROP = 0.02        # a light whose top edge falls this much from its middle toward its stiles is arch-headed
DEPTH_TOL = 0.03        # 565's texels over a light count where their recorded surface is within this of the glass
SAMPLE_MIN = 6          # ... and at least this many of them must (else the light takes its other instances' measure, its
                        # window's other lights' or its kind's)

# ---------------------------------------------------------------------------------------------------- the physics
CLEAN_HAND, CLEAN_REACH, CLEAN_TOP = 0.18, 2.0, 6.0   # the share of an upper window's dust a light keeps against its
                        # height over the pavement (at its middle): washed at street level where a hand reaches (up to
                        # CLEAN_REACH), now and then with a pole above that, and not from the street at all from CLEAN_TOP
SHELTER = (0.15, 0.80)  # the rain kept off a light (1 - 565's `open`) passes from 0.15 (a lower sash, 0.18 to 0.22) to
SHELTER_KEEP = (0.85, 1.25)   # 0.80 (the portal's doors, 0.79; its transom lights 0.99), and the dust it keeps from
                        # SHELTER_KEEP[0] to SHELTER_KEEP[1] of its window's (a smoothstep): rinsed less, it keeps more
RAIN_REF = 0.50         # the rain on a light (the mean of 565's `exposure` data over it) that runs the most water down it:
                        # about the most exposed lights' (floor 4's lower sashes, 0.46 to 0.56); a light taking more
                        # gathers no more

# ---------------------------------------------------------------------------------------------------- one window at a time
# Every draw comes from draw(key, n): the sha256 of "glass_grime:" and a stable key, two bytes per uniform, so every
# rebuild draws the same values and nothing drawn for one window moves when another changes. A window's key is its glass
# object's name; a portal's glass is cleaned as one, by the building's staff, and keys on the portal (its instancer). A
# range is the mean of two uniforms (the middle likelier than the ends). The film is in units of the dust one cleaning
# cycle leaves on an upper window.
NEGLECT_P = 0.08        # a window its tenant does not clean (a vacant office or shop) this often: its dust is older
NEGLECT = (1.00, 1.40)  # than a cycle, this much; any other window was last cleaned anywhere in its cycle, evenly
                        # (0..1). The entrances (the doors, the portals) are the building's own and never neglected
MISS_P = {"sash": 0.25, "arched": 0.35, "portal transom": 0.35}   # the cleaning missed the light that is hard to reach
                        # this often: a sash's upper light, whose outside a tenant barely reaches from inside, a top-floor
                        # arched light (fixed), a portal's transom lights (behind the arch, 3 m up) ...
MISS_EXTRA = (0.35, 0.90)   # ... which then keeps this much of the cycle before's dust as well
AGE_MAX = 1.40          # no light keeps more than this
JITTER = (0.85, 1.15)   # each light takes this much of its window's: one cleaning leaves each pane a little different
FILM_KNEE, FILM_MAX = 1.00, 1.40    # the film saturates: past about a cycle's dust a pane sheds, to the wind and to
                        # what rain reaches it, about as much as settles on it, so an older film grows ever more slowly
                        # from FILM_KNEE toward FILM_MAX (exponentially, and as steeply as below at the knee). It caps
                        # what the neglected windows, the missed lights and the arched lights' deep reveals add up to
FILM_FLOOR = 0.001      # a light's film is at least this (a pane cleaned this morning still carries the layer's gate)

# the gathering at the bottom rail, where the rain that runs down a pane dries: mild, and only as much as its rain
GATHER = (0.10, 0.50)   # its extra share of the light's film at the rail, at full rain (RAIN_REF), drawn per light ...
REACH = (0.10, 0.26)    # ... fading to nothing this far up (m, a smoothstep; times the square root of the light's height
REACH_MAX = 0.40        # in metres: a taller light runs more water), at most this share of the light's height
CORNER = (0.00, 0.70)   # each lower corner (the meniscus holds the water there longest): its own extra share of the
CORNER_W = (0.04, 0.10)     # gathering, drawn per corner, over this far from its stile (m, a smoothstep)

# ---------------------------------------------------------------------------------------------------- the look
# The dust does not roughen the glass: the glass between its grains still mirrors sharply, and what the grains scatter
# is the covered share's grey. The rework's blur (the roughness 0.06 of the way to 0.40 at a grime of 1) spread the
# sun's glint over a dusty pane near its mirror direction as a white sheet, twice the clean pane's light (critique
# 2026-09-24).
DUST = (0.054, 0.051, 0.046)        # the dust film's own colour (linear): a sooty warm grey, as dark as the game's
                                    # window glass's own colour (luminance 0.051), the tone the clean pane renders in
                                    # sun: in sun a dusty pane reads no lighter than a clean one, only greyer. A light
                                    # grey (0.17, the rework's) read up to a quarter lighter in sun: the whitening the
                                    # user rejected
COVER = 0.12                        # at strength 1 a grime of 1 (the film, gathering included) covers this share of the
                                    # pane: there it is dust, not glass
COVER_MAX = 0.45                    # ... and never more, whatever the strength: never opaque
DEBUG_GAIN = 0.75                   # the debug view shows a light's grime at full colour from 1 / DEBUG_GAIN of it

ATTR_P = "wear_glass_grime_p"      # per face corner: (x, y, 0), the point in its light's own frame (metres)
ATTR_L = "wear_glass_grime_l"      # (W, H, 0): the light's width and height
ATTR_K = "wear_glass_grime_k"      # (gather, reach, corner width): the gathering at the rail, its reach, its corners' width
ATTR_C = "wear_glass_grime_c"      # (left, right, 0): each lower corner's own extra share of the gathering
ATTR_F = "wear_glass_grime_f"      # (S, SE, E): the light's film as seen on each face of the block ...
ATTR_G = "wear_glass_grime_g"      # (N, W, 0): ... (the block's glass: its own film on all five; the portal's glass: each
                                    # portal's on the face it stands on)


def smooth(e0, e1, x):
    t = np.clip((np.asarray(x, np.float64) - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def clean_share(h):
    """The share of an upper window's dust a light keeps against its middle's height over the pavement."""
    return CLEAN_HAND + (1.0 - CLEAN_HAND) * float(smooth(CLEAN_REACH, CLEAN_TOP, h))


def shelter_keep(kept):
    """How much of its window's dust a light keeps against the rain its reveal keeps off it."""
    return SHELTER_KEEP[0] + (SHELTER_KEEP[1] - SHELTER_KEEP[0]) * float(smooth(SHELTER[0], SHELTER[1], kept))


def saturate(film):
    """A light's film as it saturates: itself up to FILM_KNEE, then rising ever more slowly toward FILM_MAX."""
    if film <= FILM_KNEE: return film
    span = FILM_MAX - FILM_KNEE
    return FILM_KNEE + span * (1.0 - math.exp(-(film - FILM_KNEE) / span))


def draw(key, n):
    """n uniforms in 0..1 from a window's or a light's own seed: the sha256 of "glass_grime:" and its key, two bytes
    each, so every rebuild draws the same values and nothing drawn for one window moves when another changes."""
    h = hashlib.sha256(("glass_grime:" + key).encode("utf-8")).digest()
    return [int.from_bytes(h[2 * i:2 * i + 2], "big") / 65535.0 for i in range(n)]


def mid(bounds, u, v):
    # the mean of two uniforms across the bounds: the middle likelier than the ends
    return bounds[0] + (bounds[1] - bounds[0]) * 0.5 * (u + v)


def window_draw(key, tenant=True):
    """A window's own: when it was last cleaned, as a share of the dust a cleaning cycle leaves (evenly anywhere in its
    cycle, or, a tenant's window, neglected and older), whether that cleaning missed its hard-to-reach light (a uniform,
    against MISS_P) and how much of the cycle before's dust that light then keeps as well."""
    u = draw("window:" + key, 6)
    neglected = tenant and u[0] < NEGLECT_P
    age = mid(NEGLECT, u[1], u[2]) if neglected else u[1]
    return dict(age=age, neglected=neglected, miss=u[3], extra=mid(MISS_EXTRA, u[4], u[5]))


def light_draw(key):
    # a light's own share of its window's dust
    u = draw("light:" + key, 2)
    return mid(JITTER, u[0], u[1])


def shape_draw(key):
    """A light's gathering at its rail: its extra share at full rain, how far up it reaches (before the height's square
    root), each lower corner's own extra share, and the corners' width."""
    u = draw("shape:" + key, 10)
    return dict(gather=mid(GATHER, u[0], u[1]), reach=mid(REACH, u[2], u[3]), left=mid(CORNER, u[4], u[5]),
                right=mid(CORNER, u[6], u[7]), corner_w=mid(CORNER_W, u[8], u[9]))


def hard_to_reach(kind):
    # the light a cleaning may miss, and how often: a sash's upper light, a top-floor arched light, a portal's transom
    if kind.endswith("sash, upper"): return MISS_P["sash"]
    if kind == "arched, upper": return MISS_P["arched"]
    return MISS_P.get(kind, 0.0)


ENTRANCES = ("door", "portal door", "portal transom")   # the building's own glass: its staff clean it, never neglected


# ---------------------------------------------------------------------------------------------------- one glass object
class Pane:
    """One glass instance as the street sees it: its plane, the frame (u along it, the street's left to right, and n
    out of it toward the street), its outline in the pane's coordinates (x along u from the object's own centre, y the
    world z), the bars its frame lays over it and the lights between them."""

    def __init__(self, blk, rec):
        from mathutils import Vector
        self.blk, self.rec, self.Vector = blk, rec, Vector
        P, N, A, C = blk.triangles(rec)
        M = np.array(rec["matrix"], np.float64)
        self.M = M
        cen = (P.mean(axis=1) * A[:, None]).sum(axis=0) / max(A.sum(), 1e-12)
        self.f = int(facade_of(cen[0], cen[1])); F = FACADES[self.f]
        out = np.array([F.n[0], F.n[1], 0.0])
        nd = N @ out
        broad = np.abs(nd) > BROAD
        self.ok = bool(broad.any())
        if not self.ok: return
        n = (N[broad] * (np.sign(nd[broad]) * A[broad])[:, None]).sum(axis=0); n[2] = 0.0
        n /= np.linalg.norm(n)
        u = np.cross([0.0, 0.0, 1.0], n); u /= np.linalg.norm(u)
        if u @ np.array([F.t[0], F.t[1], 0.0]) < 0: u = -u
        self.n, self.u = n, u
        V = P[broad].reshape(-1, 3)
        # the frame's origin: the object's own centre (its local centroid, carried by the instance's matrix), on the
        # glass's front plane, so every instance of one mesh reads the same x
        Minv = np.linalg.inv(M)
        loc = (np.c_[V, np.ones(len(V))] @ Minv.T)[:, :3]
        c_loc = loc.mean(axis=0)
        c_w = M[:3, :3] @ c_loc + M[:3, 3]
        front = float((V @ n).max())
        self.O = c_w + n * (front - c_w @ n)
        self.O[2] = 0.0
        x = (V - self.O) @ u; y = V[:, 2]
        self.gx0, self.gx1, self.gy0, self.gy1 = float(x.min()), float(x.max()), float(y.min()), float(y.max())
        self.rays = 0
        # the local -> pane map: x = ax . p + bx, y = ay . p + by, p the object's own coordinates
        M3, t = M[:3, :3], M[:3, 3]
        self.affine = [list(map(float, list(u @ M3) + [float(u @ (t - self.O))])),
                       list(map(float, list(M3[2]) + [float(t[2])]))]

    # ---- rays
    def world(self, x, y):
        p = self.O + self.u * x
        return np.array([p[0], p[1], y])

    def seen(self, x, y):
        """Is the glass itself the first thing seen at (x, y), from FRONT in front of it?"""
        p = self.world(x, y) + self.n * FRONT
        self.rays += 1
        loc, nor, ti, dist = self.blk.bvh.ray_cast(self.Vector(p), self.Vector(-self.n), FRONT + 0.03)
        return loc is not None and int(self.blk.tri_inst[ti]) == self.rec["i"]

    def edge(self, fixed, a, b, along_x):
        """Between a (seen) and b (not seen) along one line, where the glass stops being seen (to REFINE)."""
        look = (lambda v: self.seen(v, fixed)) if along_x else (lambda v: self.seen(fixed, v))
        if not look(a): return None
        while abs(b - a) > REFINE:
            m = 0.5 * (a + b)
            if look(m): a = m
            else: b = m
        return 0.5 * (a + b)

    def march(self, fixed, start, stop, along_x):
        """From start (seen) toward stop, the last position the glass is still seen (to REFINE)."""
        step = SCAN if stop > start else -SCAN
        v = start
        look = (lambda q: self.seen(q, fixed)) if along_x else (lambda q: self.seen(fixed, q))
        if not look(v): return None
        while (v + step - stop) * np.sign(step) <= 0:
            if not look(v + step): return self.edge(fixed, v, v + step, along_x)
            v += step
        return stop

    # ---- the frame's bars and the lights
    def bars(self, lo, hi, across, along_x):
        """The bars across the glass along one axis: runs of positions from lo to hi where no scan line sees the glass,
        with glass seen on both sides."""
        pos = np.arange(lo + 0.5 * SCAN, hi, SCAN)
        cov = np.array([not any(self.seen(v, c) if along_x else self.seen(c, v) for c in across) for v in pos])
        runs, start = [], None
        for k, cv in enumerate(cov):
            if cv and start is None: start = k
            if not cv and start is not None: runs.append((start, k - 1)); start = None
        out = []
        for a, b in runs:                                   # a run touching the outline is an edge, not a bar
            if a == 0 or b == len(cov) - 1: continue
            out.append((float(pos[a] - 0.5 * SCAN), float(pos[b] + 0.5 * SCAN)))
        return out

    def lights(self):
        W, H = self.gx1 - self.gx0, self.gy1 - self.gy0
        xs = [self.gx0 + a * W for a in SCAN_AT]; ys = [self.gy0 + a * H for a in SCAN_AT]
        hbars = self.bars(self.gy0, self.gy1, xs, along_x=False)      # meeting rails, transom bars
        vbars = self.bars(self.gx0, self.gx1, ys, along_x=True)       # storefront dividers, the door post
        self.hbars, self.vbars = hbars, vbars
        ycuts = [0.5 * (a + b) for a, b in hbars]; xcuts = [0.5 * (a + b) for a, b in vbars]
        ylim = [self.gy0 - 1.0] + ycuts + [self.gy1 + 1.0]
        xlim = [self.gx0 - 1.0] + xcuts + [self.gx1 + 1.0]
        yb = [self.gy0] + [b for a, b in hbars]; yt = [a for a, b in hbars] + [self.gy1]
        xb = [self.gx0] + [b for a, b in vbars]; xt = [a for a, b in vbars] + [self.gx1]
        out = []
        for r in range(len(yb)):
            for c in range(len(xb)):
                cx, cy = 0.5 * (xb[c] + xt[c]), 0.5 * (yb[r] + yt[r])
                if not self.seen(cx, cy): continue
                x0 = self.march(cy, cx, xb[c] - 2 * SCAN, along_x=True)
                x1 = self.march(cy, cx, xt[c] + 2 * SCAN, along_x=True)
                y0 = self.march(cx, cy, yb[r] - 2 * SCAN, along_x=False)
                y1 = self.march(cx, cy, yt[r] + 2 * SCAN, along_x=False)
                if None in (x0, x1, y0, y1): continue
                L = dict(row=r, col=c, rows=len(yb), cols=len(xb), x0=x0, x1=x1, y0=y0, y1=y1, arch=None,
                         cell=(xlim[c], xlim[c + 1], ylim[r], ylim[r + 1]))
                # an arch-headed light: its top edge falls toward its stiles; the frame's inner edge is fitted as a circle
                w = x1 - x0
                tops = []
                for a in (-0.42, -0.35, -0.25, -0.12, 0.0, 0.12, 0.25, 0.35, 0.42):
                    xx = 0.5 * (x0 + x1) + a * w
                    t = self.march(xx, cy, yt[r] + 2 * SCAN, along_x=False)
                    if t is not None: tops.append((xx, t))
                tops = np.array(tops)
                mid_ = tops[np.argmin(np.abs(tops[:, 0] - 0.5 * (x0 + x1))), 1]
                if len(tops) >= 5 and mid_ - tops[:, 1].min() > ARCH_DROP:
                    X, Y = tops[:, 0], tops[:, 1]
                    Am = np.c_[X, Y, np.ones(len(X))]
                    D, E, Fc = np.linalg.lstsq(Am, -(X ** 2 + Y ** 2), rcond=None)[0]
                    xc, yc = -D / 2.0, -E / 2.0
                    R = math.sqrt(max(xc ** 2 + yc ** 2 - Fc, 0.0))
                    fit = float(np.abs(np.hypot(X - xc, Y - yc) - R).max())
                    L["arch"] = dict(xc=float(xc), yc=float(yc), R=float(R), fit=fit)
                    L["y1"] = float(yc + R)
                out.append(L)
        self.cuts = [("y", c) for c in ycuts] + [("x", c) for c in xcuts]
        return out


# ---------------------------------------------------------------------------------------------------- the measure
def light_points(p, L, step=0.04, inset=0.03):
    """Sample points inside a light (pane coordinates): a grid at `step`, `inset` in from its edges and its head."""
    xs = np.arange(L["x0"] + inset, L["x1"] - inset + 1e-9, step)
    ys = np.arange(L["y0"] + inset, L["y1"] - inset + 1e-9, step)
    X, Y = np.meshgrid(xs, ys)
    keep = Y <= top_edge(L, X) - inset
    return X[keep], Y[keep]


def top_edge(L, x):
    """A light's top edge at x (pane coordinates): its head, or the frame's arc over an arch-headed light."""
    x = np.asarray(x, np.float64)
    if L["arch"] is None: return np.full(x.shape, L["y1"])
    a = L["arch"]
    return a["yc"] + np.sqrt(np.maximum(a["R"] ** 2 - (x - a["xc"]) ** 2, 0.0))


def texel(field, f, s, z, key):
    """A published 565 field at face f's (s, z), the texel's own value (no filtering: across a depth step a filtered
    value belongs to neither surface)."""
    res, z0, data = field["res"], field["z0"], np.asarray(field[key])
    F = FACADES[f]
    c = np.clip(np.floor((F.off + (np.asarray(s, np.float64) - F.s0)) / res).astype(np.int64), 0, data.shape[1] - 1)
    r = np.clip(np.floor((np.asarray(z, np.float64) - z0) / res).astype(np.int64), 0, data.shape[0] - 1)
    return data[r, c].astype(np.float64)


def factors(p, L, fields):
    """The physics of one light on one instance, from 565's measure over it: the rain kept off it (1 - `open`: its
    reveal, its head, its neighbours), the overhangs' share of that (`shelter`), and the wind-driven rain on it (the
    mean of `exposure`'s data). Only texels whose recorded surface is the glass itself count: where the street sees
    something else in front of it (the portal's arch before its transom lights, a fire escape's platform) the measure is
    that surface's, not the glass's."""
    shelter, expo, front = fields
    F = FACADES[p.f]
    d_glass = float(F.sdz(*p.world(0.5 * (L["x0"] + L["x1"]), 0.0))[1])
    X, Y = light_points(p, L)
    Wp = p.O[None, :] + p.u[None, :] * X[:, None]
    S, _, _ = F.sdz(Wp[:, 0], Wp[:, 1], Y)
    own = np.abs(texel(front, p.f, S, Y, "depth") - d_glass) < DEPTH_TOL
    if own.sum() < SAMPLE_MIN: return None
    S, Y = S[own], Y[own]
    return dict(kept=float(np.mean(1.0 - texel(expo, p.f, S, Y, "open"))),
                shelter=float(np.mean(texel(shelter, p.f, S, Y, "data"))),
                rain=float(np.mean(texel(expo, p.f, S, Y, "data"))), n=int(len(S)), seen=float(own.mean()))


def kind_of(p, L):
    """A light's kind, for the tables: where it is and which of its window's lights it is."""
    y0 = L["y0"]
    inst = p.rec["instancer"]
    if inst: return "portal door" if L["y1"] < 2.9 else "portal transom"
    if y0 < 5.5:
        h0 = y0 - Z_GROUND
        return "storefront" if h0 < 0.3 else ("door" if h0 < 1.5 else "transom")
    storey = 2 if y0 < 9.3 else 3 if y0 < 12.3 else 4 if y0 < 15.9 else 5
    if storey == 5: return "arched, upper" if L["arch"] else "arched, lower"
    if L["rows"] == 1: return f"floor {storey} sash"
    return f"floor {storey} sash, " + ("lower" if L["row"] == 0 else "upper")


# ---------------------------------------------------------------------------------------------------- build
def build(ctx):
    import time, bpy
    t0 = time.time()
    blk = ctx.block
    fields = (ctx.field("soiling", "shelter"), ctx.field("soiling", "exposure"), ctx.field("soiling", "front"))
    glass = [r for r in blk.inst if (blk.tri_inst == r["i"]).any()
             and (blk.tri_class[blk.tri_inst == r["i"]] == classes.GLASS).all()]
    by_obj = defaultdict(list)
    for r in glass: by_obj[(r["object"], r["instancer"] is not None)].append(r)
    stash = dict(block={}, portal={})
    pub, rays, skipped = [], 0, []
    # 1. every glass object's lights, and 565's measure over each light on each instance
    objs = []
    for (obj, linked), recs in sorted(by_obj.items()):
        recs = sorted(recs, key=lambda r: (r["instancer"] or "", r["name"]))
        panes = [Pane(blk, r) for r in recs]
        if not all(p.ok for p in panes):
            skipped.append(obj); continue
        found = [p.lights() for p in panes]
        rays += sum(p.rays for p in panes)
        lights = found[0]
        if not lights:
            skipped.append(obj); continue
        for p, ls in zip(panes[1:], found[1:]):          # the instances of one mesh stand alike
            assert len(ls) == len(lights) and all(abs(a[k] - b[k]) < 0.003 for a, b in zip(ls, lights)
                                                  for k in ("x0", "x1", "y0", "y1")), \
                f"glass_grime: {obj}'s instances do not show the same lights"
        if linked:                                       # the shader tells the portals apart by the face they stand on
            faces = [p.f for p in panes]
            assert len(set(faces)) == len(faces), f"glass_grime: two of {obj}'s instances stand on one face ({faces})"
        meas = [[factors(p, ls[li], fields) for p, ls in zip(panes, found)] for li in range(len(lights))]
        objs.append(dict(obj=obj, linked=linked, panes=panes, lights=lights,
                         kinds=[kind_of(panes[0], L) for L in lights], meas=meas))
    # 2. a light an instance does not show the street (565's texels over it all record something in front of it) takes
    # the light's other instances' measure, else its window's other lights', else its kind's median
    KEYS = ("kept", "shelter", "rain")
    by_kind = defaultdict(list)
    for o in objs:
        for k, ms in zip(o["kinds"], o["meas"]):
            by_kind[k] += [m for m in ms if m is not None]
    filled = defaultdict(int)
    for o in objs:
        seen_all = [m for ms in o["meas"] for m in ms if m is not None]
        for li, ms in enumerate(o["meas"]):
            own = [m for m in ms if m is not None]
            for ii in range(len(ms)):
                if ms[ii] is not None:
                    ms[ii] = dict(ms[ii], taken="own"); continue
                pool, taken = ((own, "instances") if own else (seen_all, "window") if seen_all
                               else (by_kind.get(o["kinds"][li], []), "kind"))
                assert pool, f"glass_grime: {o['obj']} light {li}: nothing measured to take its factors from"
                ms[ii] = dict({k: float(np.median([m[k] for m in pool])) for k in KEYS}, taken=taken)
                filled[taken] += 1
    # 3. each light's film on each instance, its gathering, its attributes' stash, and its sources and marks
    wins = {}
    for o in objs:
        obj, linked, panes, lights = o["obj"], o["linked"], o["panes"], o["lights"]
        ref = panes[0]
        rows = []
        wdraws = {}
        tenant = not all(k in ENTRANCES for k in o["kinds"])
        for p in panes:                                  # a block window by its object, a portal's glass by its portal
            tag = p.rec["instancer"] or "block"
            wkey = obj if tag == "block" else tag
            wdraws[tag] = (wkey, window_draw(wkey, tenant))
            w = wins.setdefault(wkey, dict(window=wkey, instance=tag, objects=[], lights=0, tenant=tenant,
                                           age=round(wdraws[tag][1]["age"], 3), neglected=wdraws[tag][1]["neglected"]))
            w["objects"].append(obj); w["lights"] += len(lights)
        for li, L in enumerate(lights):
            kind = o["kinds"][li]
            width, height = L["x1"] - L["x0"], L["y1"] - L["y0"]
            clean = clean_share(0.5 * (L["y0"] + L["y1"]) - Z_GROUND)
            p_miss = hard_to_reach(kind)
            ms = o["meas"][li]
            # the gathering is the mesh's own (the portal's three instances share it): as much as the rain on the light
            sd = shape_draw(f"{obj}:{li}")
            rain = float(np.clip(np.mean([m["rain"] for m in ms]) / RAIN_REF, 0.0, 1.0))
            gather = sd["gather"] * rain
            reach = min(sd["reach"] * math.sqrt(height), REACH_MAX * height)
            films = {}
            for p, m in zip(panes, ms):
                tag = p.rec["instancer"] or "block"
                wkey, wd = wdraws[tag]
                missed = wd["miss"] < p_miss
                age = min(wd["age"] + (wd["extra"] if missed else 0.0), AGE_MAX)
                keep = shelter_keep(m["kept"])
                jit = light_draw(f"{obj}:{li}" if tag == "block" else f"{tag}:{obj}:{li}")
                raw = clean * age * keep * jit
                film = max(saturate(raw), FILM_FLOOR)
                films[p.f] = film
                F = FACADES[p.f]
                lift = p.n * 0.03                             # on the frame's face, in front of the glass
                a0, a1 = p.world(L["x0"], L["y0"] - 0.022) + lift, p.world(L["x1"], L["y0"] - 0.022) + lift
                src = ctx.source(f"rail:{tag}:{obj}:{li}", "line", [a0, a1], facade=p.f, what=kind, object=obj,
                                 instance=tag)
                ctx.mark(src, p.f, what="film", kind=kind, film=round(film, 3))
                s0 = float(F.sdz(*p.world(L["x0"], 0.0))[0]); s1 = float(F.sdz(*p.world(L["x1"], 0.0))[0])
                pub.append(dict(id=src.id, object=obj, instance=tag, window=wkey, kind=kind, facade=p.f,
                                s0=round(min(s0, s1), 3), s1=round(max(s0, s1), 3), z0=round(L["y0"], 3),
                                z1=round(L["y1"], 3), width=round(width, 3), height=round(height, 3),
                                arch=round(L["arch"]["R"], 3) if L["arch"] else 0.0, cleaning=round(clean, 3),
                                kept=round(m["kept"], 3), shelter=round(m["shelter"], 3), rain=round(m["rain"], 3),
                                measured=m["taken"], age=round(wd["age"], 3), neglected=wd["neglected"],
                                missed=bool(missed), keep=round(keep, 3), jitter=round(jit, 3), raw=round(raw, 4),
                                film=round(film, 4),
                                gather=round(gather, 3), reach=round(reach, 3), corners=[round(sd["left"], 3),
                                round(sd["right"], 3)], corner_w=round(sd["corner_w"], 3)))
            mean = float(np.mean(list(films.values())))
            faces = [films.get(f, mean) for f in range(len(FACADES))]
            rows.append(dict(kind=kind, x0=L["x0"], x1=L["x1"], y0=L["y0"], y1=L["y1"], cell=L["cell"], W=width,
                             H=height, film=mean, faces=faces, gather=gather, reach=reach, corner_w=sd["corner_w"],
                             left=sd["left"], right=sd["right"]))
        ob = next(b for b in bpy.data.objects if b.name == obj and ((b.library is not None) == linked))
        me = ob.data
        co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", co)
        entry = dict(affine=ref.affine, cuts=ref.cuts, lights=rows,
                     check=(len(me.vertices), round(float(co.sum()), 4)))
        (stash["portal"] if linked else stash["block"])[obj] = entry
    wins = [wins[k] for k in sorted(wins)]
    ctx.stash.update(stash)
    ctx.publish("lights", pub)
    ctx.publish("windows", wins)
    ctx.publish("profile", dict(
        clean=dict(hand=CLEAN_HAND, reach=CLEAN_REACH, top=CLEAN_TOP), shelter=SHELTER, shelter_keep=SHELTER_KEEP,
        rain_ref=RAIN_REF, neglect=dict(p=NEGLECT_P, age=NEGLECT), miss=dict(p=MISS_P, extra=MISS_EXTRA),
        age_max=AGE_MAX, jitter=JITTER, film=dict(knee=FILM_KNEE, max=FILM_MAX), gather=GATHER,
        reach=dict(m=REACH, max=REACH_MAX), corner=CORNER,
        corner_w=CORNER_W, look=dict(dust=DUST, cover=COVER, cover_max=COVER_MAX),
        note=("a light's film = its cleaning (by height) x its window's age since cleaning (drawn; plus the cycle "
              "before's where the cleaning missed it) x what its shelter keeps x its own jitter, saturating from "
              "FILM_KNEE toward FILM_MAX; over the light, film x (1 + gather x b(y) x (1 + left x c(x) + right x "
              "c(W - x))), b and c smoothsteps falling from the rail and the stiles; the look: the dust covers COVER x "
              "that of the pane, which there shows no room behind, reflects nothing and takes the dust's colour, a "
              "sooty grey as dark as the window glass: greyer and flatter, the reflection weaker, no lighter")))
    log_build(ctx, pub, wins, glass, stash, rays, skipped, filled, t0)


def log_build(ctx, pub, wins, glass, stash, rays, skipped, filled, t0):
    import time
    ctx.log(f"   glass_grime: {len(glass)} glass instances, {len(stash['block'])} glass objects in the block and "
            f"{len(stash['portal'])} in the portal, {len(pub)} lights over all instances; {rays} rays, "
            f"{time.time() - t0:.1f} s" + (f"; no lights on {', '.join(skipped)}" if skipped else "")
            + (f"; unseen lights measured from " + ", ".join(f"their {k} {v}" for k, v in sorted(filled.items()))
               if filled else ""))
    ages = np.array([w["age"] for w in wins])
    ctx.log(f"   glass_grime windows {len(wins)}: last cleaned {np.median(ages):.2f} of a cycle ago "
            f"({ages.min():.2f}..{ages.max():.2f}), {sum(w['neglected'] for w in wins)} neglected; "
            f"{sum(r['missed'] for r in pub)} hard-to-reach lights missed")
    kinds = defaultdict(list)
    for r in pub: kinds[r["kind"]].append(r)
    for k in sorted(kinds):
        v = kinds[k]
        def rng(key, fmt="{:.2f}"):
            a = [x[key] for x in v]
            return fmt.format(np.median(a)) + " (" + fmt.format(min(a)) + ".." + fmt.format(max(a)) + ")"
        f = np.array([x["film"] for x in v])
        ctx.log(f"   glass_grime {k:<22} {len(v):4d}: {rng('width')} x {rng('height')} m, cleaning {rng('cleaning')}, "
                f"rain kept off {rng('kept')}, rain {rng('rain')}, film {rng('film')} [under 0.15: {int((f < 0.15).sum())}, "
                f"over 0.8: {int((f > 0.8).sum())}], gather {rng('gather')}, reach {rng('reach')}")
    # how alike neighbours are: the upper windows' lights in a row on one face, one kind, next to each other
    rows = defaultdict(list)
    for r in pub:
        if r["instance"] == "block" and (r["kind"].startswith("floor") or r["kind"].startswith("arched")):
            rows[(r["facade"], r["kind"])].append(r)
    d = []
    for v in rows.values():
        v = sorted(v, key=lambda r: r["s0"])
        d += [abs(a["film"] - b["film"]) for a, b in zip(v, v[1:])]
    d = np.array(d)
    ctx.log(f"   glass_grime neighbours: {len(d)} pairs of upper lights side by side, their films differ by "
            f"{np.median(d):.2f} (median), {int((d < 0.05).sum())} within 0.05 of each other")


# ---------------------------------------------------------------------------------------------------- apply
COPY = "WEAR_glass_"    # the block's glass copies, cut along their bars and carrying the attributes, are called this


def _check(me, entry, name):
    co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", co)
    got = (len(me.vertices), round(float(co.sum()), 4))
    assert got == tuple(entry["check"]), f"glass_grime: {name} is not the mesh the build measured ({got} vs {entry['check']})"


def _straddled(me, row, c):
    """Does a face of the mesh lie on both sides of the pane line row . p + b = c (a bar's centre line)?"""
    co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", co)
    side = co.reshape(-1, 3) @ np.asarray(row[:3]) + row[3] - c
    for poly in me.polygons:
        s = side[list(poly.vertices)]
        if s.min() < -1e-5 and s.max() > 1e-5: return True
    return False


def _copy_flags(src, dst):
    # the copy renders as its original does: its ray visibility, and any material given to the object's own slots
    for a in ("visible_camera", "visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter",
              "visible_shadow", "hide_render"):
        setattr(dst, a, getattr(src, a))
    for i, slot in enumerate(src.material_slots):
        if slot.link == 'OBJECT':
            dst.material_slots[i].link = 'OBJECT'; dst.material_slots[i].material = slot.material


def _write(actx, obj, me, entry):
    """Cut the mesh along the bars that one of its faces straddles (behind the bars: every face then lies in one
    light) and write each face corner's light coordinates, film and gathering. `me` is obj's own mesh."""
    import bmesh
    from mathutils import Vector
    A = np.array(entry["affine"], np.float64)
    cuts = [(axis, c) for axis, c in entry["cuts"] if _straddled(me, A[0] if axis == "x" else A[1], c)]
    if cuts:
        bm = bmesh.new(); bm.from_mesh(me)
        for axis, c in cuts:
            row = A[0] if axis == "x" else A[1]
            nv = row[:3]; k = float(nv @ nv)
            p0 = nv * (c - row[3]) / k
            bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-6,
                                   plane_co=Vector(p0), plane_no=Vector(nv / math.sqrt(k)))
        bm.to_mesh(me); bm.free()
        me.update()
    nv_ = len(me.vertices)
    co = np.empty(nv_ * 3); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
    X = co @ A[0, :3] + A[0, 3]; Y = co @ A[1, :3] + A[1, 3]
    nl = len(me.loops)
    lv = np.empty(nl, np.int64); me.loops.foreach_get("vertex_index", lv)
    ls = np.empty(len(me.polygons), np.int64); me.polygons.foreach_get("loop_start", ls)
    lt = np.empty(len(me.polygons), np.int64); me.polygons.foreach_get("loop_total", lt)
    lights = entry["lights"]
    face_light = np.zeros(len(me.polygons), np.int64)
    for fi in range(len(me.polygons)):
        vi = lv[ls[fi]:ls[fi] + lt[fi]]
        cx, cy = X[vi].mean(), Y[vi].mean()
        best, bd = 0, 1e9
        for li, L in enumerate(lights):
            x0, x1, y0, y1 = L["cell"]
            d = max(x0 - cx, cx - x1, 0.0) + max(y0 - cy, cy - y1, 0.0)
            if d < bd: best, bd = li, d
        face_light[fi] = best
    # every loop's face (the loops of a face are consecutive from its loop_start)
    loop_face = np.empty(nl, np.int64)
    for fi in range(len(me.polygons)): loop_face[ls[fi]:ls[fi] + lt[fi]] = fi
    li = face_light[loop_face]
    Lx0 = np.array([L["x0"] for L in lights])[li]; Ly0 = np.array([L["y0"] for L in lights])[li]
    P = np.c_[X[lv] - Lx0, Y[lv] - Ly0, np.zeros(nl)]
    Lv = np.array([[L["W"], L["H"], 0.0] for L in lights])[li]
    Kv = np.array([[L["gather"], L["reach"], L["corner_w"]] for L in lights])[li]
    Cv = np.array([[L["left"], L["right"], 0.0] for L in lights])[li]
    Fv = np.array([L["faces"][:3] for L in lights])[li]
    Gv = np.array([L["faces"][3:] + [0.0] for L in lights])[li]
    film = np.array([L["film"] for L in lights])[li]
    actx.set_attribute(obj, film, 'CORNER')
    for nm, arr in ((ATTR_P, P), (ATTR_L, Lv), (ATTR_K, Kv), (ATTR_C, Cv), (ATTR_F, Fv), (ATTR_G, Gv)):
        if nm in me.attributes: me.attributes.remove(me.attributes[nm])
        me.attributes.new(nm, 'FLOAT_VECTOR', 'CORNER').data.foreach_set("vector", arr.reshape(-1).tolist())
    return len(me.polygons), len(lights), len(cuts)


def apply(actx):
    """The block's glass: a copy of each glass object, its mesh cut along its bars and carrying its lights' coordinates,
    film and gathering, rendered in place of the original while the feature is on (the framework's add_object(...,
    replaces=...)). The original is left exactly as it was -- its mesh, its sharing with other windows, its triangles --
    so with the feature or the layer off the glass renders as it always did: a cut planar pane is the same surface, but
    the renderer samples a differently triangulated, no longer instanced alpha-blended pane a little differently."""
    import bpy
    bpy.context.view_layer.update()
    n_obj = n_faces = n_lights = n_cut = 0
    for name, entry in sorted(actx.stash.get("block", {}).items()):
        o = actx.object(name)
        _check(o.data, entry, name)
        me = o.data.copy(); me.name = COPY + name
        c = actx.add_object(COPY + name, me, replaces=name)
        c.matrix_world = o.matrix_world.copy()
        _copy_flags(o, c)
        fcount, lcount, ncut = _write(actx, c, me, entry)
        n_obj += 1; n_faces += fcount; n_lights += lcount; n_cut += ncut > 0
    actx.log(f"glass_grime: {n_obj} glass objects in the block have a copy carrying {n_lights} lights on {n_faces} "
             f"faces ({n_cut} cut along their bars), rendered in their place while the feature is on")


def apply_portal(actx):
    """The portal's glass (one set of meshes, instanced three times: each light's film written once per face, the
    portals standing on three faces): its attributes in place. Its geometry is not touched -- each door's glass and each
    transom light is its own box, so no face straddles a bar -- and a mesh is never cut here: the portal cannot be
    switched per feature."""
    n_obj = n_lights = 0
    for name, entry in sorted(actx.stash.get("portal", {}).items()):
        o = actx.object(name)
        _check(o.data, entry, name)
        A = np.array(entry["affine"], np.float64)
        assert not any(_straddled(o.data, A[0] if axis == "x" else A[1], c) for axis, c in entry["cuts"]), \
            f"glass_grime: the portal's {name} has a face across a bar: it would have to be cut, and the portal's " \
            f"pieces cannot be switched per feature"
        _, lcount, _ = _write(actx, o, actx.own_mesh(o), entry)
        n_obj += 1; n_lights += lcount
    actx.log(f"glass_grime: {n_obj} glass objects in the portal carry {n_lights} lights (attributes only)")


# ---------------------------------------------------------------------------------------------------- shader
def shader(g):
    def attr(nm):
        return g.node('ShaderNodeAttribute', attribute_type='GEOMETRY', attribute_name=nm).outputs['Vector']
    x, y, _ = g.xyz(attr(ATTR_P))
    W, _, _ = g.xyz(attr(ATTR_L))
    gather, reach, cw = g.xyz(attr(ATTR_K))
    left, right, _ = g.xyz(attr(ATTR_C))
    f0, f1, f2 = g.xyz(attr(ATTR_F))
    f3, f4, _ = g.xyz(attr(ATTR_G))
    glass = g.mul(g.is_class(classes.GLASS), g.gt(g.i("Attr"), 0.0))
    # the light's film, as seen on the face the shading point stands on (the portal's glass: that portal's own)
    face = g.i("Facade")
    film = None
    for k, fk in enumerate((f0, f1, f2, f3, f4)):
        term = g.mul(g.eq(face, float(k)), fk)
        film = term if film is None else g.add(film, term)
    # the gathering at the bottom rail, a little more toward each lower corner: smooth from the rail, no tide line
    yy = g.mx(y, 0.0)
    rail = g.one_minus(g.smooth(0.0, g.mx(reach, 0.01), yy))
    xl = g.mx(x, 0.0); xr = g.mx(g.sub(W, x), 0.0)
    cwm = g.mx(cw, 0.005)
    corners = g.add(g.mul(left, g.one_minus(g.smooth(0.0, cwm, xl))), g.mul(right, g.one_minus(g.smooth(0.0, cwm, xr))))
    lift = g.mul(g.mul(gather, rail), g.add(corners, 1.0))
    grime = g.mul(g.mul(film, g.add(lift, 1.0)), glass)
    k = g.mul(grime, g.i("Strength"))
    col, alpha, trans = g.i("Color"), g.i("Alpha"), g.i("Transmission")
    # the dust's share of the pane: there it is dust, not glass. The room behind shows through the rest only (Alpha
    # rises by the cover's share of the see-through, Transmission falls by it). Of what the pane itself shows (Alpha')
    # the covered share (cover / Alpha') does not reflect -- the specular level falls by it: the reflection weakens --
    # and its colour is the dust's, a sooty grey about as dark as the glass it hides, so the pane turns greyer and
    # flatter but no lighter: the dust acts on the pane's contrast, not on its brightness. The roughness stays the
    # glass's own: the glass between the grains still mirrors sharply (a rougher pane spread the sun's glint over its
    # light as a white sheet)
    cover = g.mn(g.mul(k, COVER), COVER_MAX)
    alpha2 = g.mix(alpha, 1.0, cover)
    share = g.div(cover, g.mx(alpha2, 0.05))
    g.o("Color", g.mix(col, g.rgb(*DUST), share, 'RGBA'))
    g.o("Alpha", alpha2)
    g.o("Transmission", g.mix(trans, 0.0, cover))
    g.o("Specular", g.mix(g.i("Specular"), 0.0, share))
    g.o("Debug", g.clamp(g.mul(grime, DEBUG_GAIN)))
