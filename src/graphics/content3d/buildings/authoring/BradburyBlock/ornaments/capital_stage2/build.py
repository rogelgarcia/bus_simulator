"""Stage 2 of the pilaster capital: the carved capital, cut from the PBR ornament atlas.

Each ornament of the atlas (assets/public/textures/bradbury_capital/atlas: the two leaf banks, the horn, the heart, the
pendant and the crown) is its silhouette cut out as a quad card, extruded ("it must have volume") and wrapped onto the
photo-proportioned blank (bell.py); the texture does the rest (basecolor, normal, roughness, AO). The horn's roll is a
drum on the band's end; the corner leaf of each bank rolls forward into a horizontal roll under the drums. The front
is the same everywhere; the side faces are each placement's own (SIDES: the pilasters, the brick columns, the portal's
piers, the narrow piers), a run of whole leaves from under the corner to the wall beside that placement.

    python build.py [build_dir]

System python (numpy + PIL); ../capital.py runs it and imports the result into capital.blend (blender_import.py).
Writes into build_dir (default: the gitignored cache portal_project/ornaments/cache/capital_stage2) the parts cut from
the atlas (parts.py), the drum's roll textures (rolltex.py) and stage2_mesh.json: the objects in metres, in the
capital's frame (x across the face, y depth with the street at -y, z up from the neck), with per-face UVs and slots,
each tagged with its placement (`variant`; None for the pieces every placement shares), and SIDES' walls (`sides`)."""
import sys, os, json, math
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE]
import bell, cards3d as c3, gridlayout as gl, bandlayout as bl, layout, skirt, rolltex, parts as atlas_parts
import quadcards as qc, pieces as PC, envelope as EV
from trace import signed_area

REPO = os.path.abspath(os.path.join(HERE, *[".."] * 8))
TEX_DIR = os.path.join(REPO, "assets", "public", "textures", "bradbury_capital")   # the atlas as delivered + the blank's textures
ATLAS_DIR = os.path.join(TEX_DIR, "atlas")
FLOWER_DIR = os.path.join(TEX_DIR, "wall_flower")                     # the owner's wall-facing floral scroll (2026-10-05): its own 2048 x 1024 maps
BUILD_DIR = os.path.abspath(sys.argv[1]) if __name__ == "__main__" and len(sys.argv) > 1 else os.path.join(
    REPO, "tests", "artifacts", "blender", "bradbury", "portal_project", "ornaments", "cache", "capital_stage2")
PARTS_DIR = os.path.join(BUILD_DIR, "parts")
ROLL_TEX_DIR = os.path.join(BUILD_DIR, "rolltex")
if __name__ == "__main__": atlas_parts.cut(ATLAS_DIR, PARTS_DIR)
PARTS = json.load(open(os.path.join(PARTS_DIR, "parts.json")))
ATLAS = PARTS["atlas"]
MM_PX = bell.M_PER_PX * 1000.0
def photo_z(Y): return (bell.BASE_PX - Y) * MM_PX * bell.VSCALE
H_CELL = 16.0


class Part:
    """A part's silhouette as a grid card (mm, y up, origin at its alpha box's bottom-left) and its atlas mapping."""
    def __init__(self, name, mmpx, rot180=False, exclude=None, mask_fn=None, layout_fn=None, sub_fn=None, image=None):
        """layout_fn(part) -> card: the piece's own box-modelling layout (quadcards / pieces), built in the card frame
        from self.sub (the alpha crop; sub_fn may edit it first, e.g. cut the heart's berries). image: a picture
        outside the atlas (its path), with a texture of its own: the card's uvs then run over that picture."""
        self.name, self.mmpx, self.rot180 = name, mmpx, rot180
        im = Image.open(image or os.path.join(PARTS_DIR, name + ".png")).convert("RGBA")
        self.src_w, self.src_h = im.size
        mask = np.array(im)[:, :, 3] >= 128
        if mask_fn is not None: mask = mask_fn(mask)
        if rot180: mask = mask[::-1, ::-1]
        ys, xs = np.nonzero(mask)
        bbox = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
        self.bx0, self.by0, self.bx1, self.by1 = bbox                    # in the (possibly rotated) part image
        sub = mask[bbox[1]:bbox[3], bbox[0]:bbox[2]].copy()
        self.W, self.H = (bbox[2] - bbox[0]) * mmpx, (bbox[3] - bbox[1]) * mmpx
        if exclude is not None:                                          # the excluded region (e.g. the roll's circle) leaves the picture
            Hs, Ws = sub.shape; step = 2
            for py in range(0, Hs, step):
                for px in range(0, Ws, step):
                    if exclude((px + step / 2) * mmpx, (Hs - py - step / 2) * mmpx): sub[py:py + step, px:px + step] = False
        if sub_fn is not None: sub = sub_fn(sub, self)
        self.sub = sub
        polys = skirt.outlines(sub, mmpx, eps_mm=1.0, min_hole_px=40)
        polys.sort(key=lambda q: -abs(signed_area(q)))
        self.polys = polys
        self.skirts = []
        self.crop = (0, 0) if image else PARTS["parts"][name]["crop"]   # the part image's offset in the atlas
        self.tex = im.size if image else (ATLAS, ATLAS)                  # the texture the uvs run over
        self.card = layout_fn(self) if layout_fn is not None else None
        if self.card is not None:
            print("  %-8s %3d x %3d mm  %4d quads" % (name, self.W, self.H, len(self.card.quads)))
    def atlas_uv(self, u, v):
        """Card mm -> atlas uv (v up). The card's origin is the alpha box's bottom-left in the (rotated) image."""
        px = self.bx0 + u / self.mmpx; py = self.by1 - v / self.mmpx       # in the rotated image
        if self.rot180: px, py = self.src_w - px, self.src_h - py
        return ((self.crop[0] + px) / self.tex[0], 1.0 - (self.crop[1] + py) / self.tex[1])


# ---------------------------------------------------------------- the pieces
def horn_circle(mask, mmpx):
    """The roll's circle in the horn (left third of the silhouette), least squares on its boundary pixels: (cx, cy, r) mm, y up."""
    B = gl.outline_points(mask)
    ys, xs = np.nonzero(mask); x0, y0, y1 = xs.min(), ys.min(), ys.max() + 1
    W = xs.max() + 1 - x0
    sel = B[(B[:, 0] < x0 + 0.42 * W)]
    A = np.column_stack([sel[:, 0], sel[:, 1], np.ones(len(sel))]); rhs = -(sel[:, 0] ** 2 + sel[:, 1] ** 2)
    D, E, F = np.linalg.lstsq(A, rhs, rcond=None)[0]
    cx, cy = -D / 2, -E / 2; r = math.sqrt(cx * cx + cy * cy - F)
    return ((cx - x0) * mmpx, (y1 - cy) * mmpx, r * mmpx)

def bank_layout(pt):
    """A leaf bank's card: the tight envelope, its corners ON the outline at the tips and notches (walls on the
    picture's edge), 3 rows."""
    return EV.envelope_card_tight(pt.sub, pt.mmpx, tol=3.0, merge=8.0, rows=3)


def build_pieces():
    print("pieces:")
    P = {}
    P["bank_R"] = Part("bank_R", 0.40, layout_fn=bank_layout); P["bank_L"] = Part("bank_L", 0.40, layout_fn=bank_layout)   # whole: the sides' leaves are sliced from them (side_run)
    P["flower"] = Part("flower", 0.20, image=os.path.join(FLOWER_DIR, "basecolor_rgba.png"), layout_fn=bank_layout)   # the sides' scroll over the leaves (side_crest): cut out like the banks, on its own texture
    P["flower"].wall_inset, P["flower"].edge_factor = 2.0, 0.35
    P["heart"] = Part("heart", 0.294, sub_fn=lambda sub, pt: PC.cut_heart(sub, pt.mmpx, pt.W, pt.H),
                      layout_fn=lambda pt: PC.heart_polar(pt.polys[0], pt.polys[1:], pt.W, tol=2.5, rows=3))   # beads and berries cut out (3D), a polar ring round each eye
    P["heart"].wall_skip = PC.near_balls(P["heart"].W, P["heart"].H)    # no walls where the 3D beads and berries give the volume
    P["pendant"] = Part("pendant", 0.26, layout_fn=lambda pt: EV.envelope_card_sym_tight(pt.sub, pt.mmpx, tol=3.0, merge=9.0, rows=3))   # symmetric, corners on the outline
    P["crown"] = Part("crown", 0.217, layout_fn=lambda pt: EV.envelope_card_sym_tight(pt.sub, pt.mmpx, tol=2.0, merge=6.0, rows=3))   # point up, as the texture and the photo (the 180-degree turn was "upside down", user 2026-10-03)
    def cut_knob(side):
        """The front banks' painted knob (the corner leaf's rolled tip) cut out: the connected part of the picture above
        v 196 mm at the outer top corner (the 3D roll replaces it)."""
        def f(sub, pt):
            Hs, Ws = sub.shape; mm = pt.mmpx
            v_cut = KNOB["v_cut"]; py_cut = int(Hs - v_cut / mm)
            top = sub[:py_cut, :].copy()
            corner_px = int(KNOB["corner_w"] / mm)                     # only the knob's own corner (the neighbouring leaf tips stay)
            if side > 0: top[:, :Ws - corner_px] = False
            else: top[:, corner_px:] = False
            seed_u = (Ws * mm - KNOB["seed_in"]) if side > 0 else KNOB["seed_in"]
            sx_, sy_ = int(seed_u / mm), int(Hs - KNOB["seed_v"] / mm)
            if not top[sy_, sx_]: return sub
            comp = np.zeros_like(top); stack = [(sy_, sx_)]; comp[sy_, sx_] = True
            while stack:
                y, x = stack.pop()
                for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= ny < top.shape[0] and 0 <= nx < Ws and top[ny, nx] and not comp[ny, nx]:
                        comp[ny, nx] = True; stack.append((ny, nx))
            out = sub.copy(); out[:py_cut, :][comp] = False
            ys_, xs_ = np.nonzero(comp)
            pt.knob_box = ((xs_.min()) * mm, (xs_.max() + 1) * mm)          # the cut's u range (card mm)
            return out
        return f
    for nm_, side_ in (("bank_R", 1.0), ("bank_L", -1.0)):
        q_ = Part(nm_, 0.40, layout_fn=bank_layout, sub_fn=cut_knob(side_))
        q_.spiral = ((q_.W - KNOB["eye_in"]) if side_ > 0 else KNOB["eye_in"], KNOB["eye_v"])   # the knob's spiral eye (card mm)
        kb = getattr(q_, "knob_box", (q_.W - 95.0, q_.W) if side_ > 0 else (0.0, 95.0))
        q_.wall_skip = (lambda u, v, kb=kb: v > KNOB["v_cut"] - 8.0 and kb[0] - 6.0 < u < kb[1] + 6.0)   # the roll covers the cut
        P[nm_ + "_front"] = q_
    for nm_ in ("bank_R", "bank_L", "pendant", "crown", "bank_R_front", "bank_L_front"): P[nm_].wall_inset = 2.0   # walls are kept only on the picture's edge: their colour from 2 mm inside
    for nm_ in ("bank_R", "bank_L", "pendant", "crown", "heart", "bank_R_front", "bank_L_front"): P[nm_].edge_factor = 0.35   # a cushion: edges at 35 % of the relief (of the thickness, on a plate), short walls
    for nm_, side_ in (("bank_R", 1.0), ("bank_L", -1.0)): P[nm_].blob = blob_circle(P[nm_], side_)
    hm = np.array(Image.open(os.path.join(PARTS_DIR, "horn.png")).convert("RGBA"))[:, :, 3] >= 128
    cx, cy, r = horn_circle(hm, 0.32)
    ys_, xs_ = np.nonzero(hm); hx0, hy1 = xs_.min(), ys_.max() + 1
    def in_band_dir(x, y):
        """Does the silhouette go on 45 mm past the circle in this cell's direction? Then the cell is the band's
        root; otherwise it is the roll's own rim bulging past the fitted circle (dropped: the drum covers the roll)."""
        dx, dy = x - cx, y - cy; L = math.hypot(dx, dy)
        if L < 1e-6: return False
        for reach in (26.0, 45.0):
            qx, qy = cx + dx / L * (r + reach), cy + dy / L * (r + reach)
            px, py = int(hx0 + qx / 0.32), int(hy1 - qy / 0.32)
            if 0 <= py < hm.shape[0] and 0 <= px < hm.shape[1] and bool(hm[py, px]): return True
        return False
    def horn_exclude(x, y):
        d = math.hypot(x - cx, y - cy)
        return d < r or (d < r + 26.0 and not in_band_dir(x, y))
    P["horn"] = Part("horn", 0.32, exclude=horn_exclude)              # the band ends on the roll's circle; the drum covers the roll
    P["horn"].circle = (cx, cy, r)
    # the band's direction out of the roll (toward its tail, the point farthest from the circle) and its width there
    # the band's midline and half-width, column by column from the roll's edge to the tail (card mm)
    mid, half = [], []
    x_start = int((cx + r + 6.0) / 0.32); xmax = xs_.max()
    for px in range(hx0 + x_start, xmax + 1, 4):
        col = np.nonzero(hm[:, px])[0]
        if len(col) == 0: continue
        y_top, y_bot = (hy1 - col.min() - 0.5) * 0.32, (hy1 - col.max() - 0.5) * 0.32
        mid.append(((px - hx0 + 0.5) * 0.32, 0.5 * (y_top + y_bot))); half.append(0.5 * (y_top - y_bot))
    mid = np.array(mid); half = np.array(half)
    seg = np.hypot(*np.diff(mid, axis=0).T); sarc = np.concatenate([[0.0], np.cumsum(seg)])
    P["horn"].band_mid = (mid, half, sarc)
    P["horn"].card = PC.arm_strip3(P["horn"].polys[0], (cx, cy, r), mid[::3], row=30.0, inset=ROLL["fillet"] + 1.0)   # a ladder between the two edges: rows cannot fan or cross   # the arm: one strip, rows where it bends (user 2026-10-03)
    print("  %-8s %3d x %3d mm  %4d quads (arm strip)" % ("horn", P["horn"].W, P["horn"].H, len(P["horn"].card.quads)))
    P["horn"].flat = band_flatness(P["horn"])
    j0 = np.array([cx, cy]) + (mid[0] - np.array([cx, cy])) / np.linalg.norm(mid[0] - np.array([cx, cy])) * r
    P["horn"].band_junction = j0
    disc = layout.Card()
    bl.disc_patch(disc, np.zeros((3, 2)), None, None, k=4, circle=(np.array([cx, cy]), r))
    P["disc"] = disc
    print("  horn roll: centre (%.0f, %.0f) r %.0f mm" % (cx, cy, r))
    h = P["horn"]
    u0, v0 = h.atlas_uv(cx, cy); u1, _ = h.atlas_uv(cx + r, cy)
    cpx, cpy, rpx = u0 * ATLAS, (1.0 - v0) * ATLAS, (u1 - u0) * ATLAS
    x0, y0, x1, y1 = rolltex.build(ATLAS_DIR, (cpx, cpy), rpx, ROLL_TEX_DIR)
    def roll_uv(u, v, h=h, box=(x0, y0, x1, y1)):
        au, av = h.atlas_uv(u, v); px, py = au * ATLAS, (1.0 - av) * ATLAS
        return ((px - box[0]) / (box[2] - box[0]), 1.0 - (py - box[1]) / (box[3] - box[1]))
    h.roll_uv = roll_uv
    print("  roll texture: atlas px %d..%d x %d..%d" % (x0, x1, y0, y1))
    return P


# ---------------------------------------------------------------- placements (mm, the photo's frame of the front face)
Z_ROLL = photo_z(305)                                                 # the volute's eye in the photo
ROLL_AT_END = 10.0                                                    # the drum's centre past its face's end (user's hand placement)
ROLL = dict(relief=52.0, depth=70.0, yaw=0.0, tilt=2.0, fillet=9.0, dish=8.0)   # 52 proud: the corner's other drum (they cross) stays behind this face, dish included   # the roll: a cylinder, its front edge rounded, its spiral face dished 8 mm toward the eye (user 2026-10-03 sketch)
BAND_STRETCH = 1.17
ARM_ROT = 5.0
ARM_TAIL = (45.0, 222.0)                                              # the arm's tail: mm from the face's middle, height (under the heart's lower C curl; photo: the tail ends there, a gap over the leaves)
ARM_LEVEL = 0.40
ARM_GAP = 8.0
ARM_SCALE_CAP = 1.20
ARM_SCALE_CAP_SIDE = 1.30                                            # the side faces are longer: their arms are 40 % longer than the texture                                                  # the arm's texture grows uniformly to at most this; the rest goes along its flattest stretch                                                         # the arm's outline keeps this far above the leaves' tips
ARM_TAIL_MIN = 190.0                                                  # never below the heart's lower curl                                                      # how far (fraction of the root-tail chord) the arm runs level under the abacus before it dives                                                         # degrees: the arm turned up about the roll, more room for the leaves under it (user 2026-10-03)                                                   # the band stretched toward the face's middle about the roll (its tail reaches the heart's knot: "MOVE")   # each drum faces its own face (user 2026-10-03 "ROTATE" arrows: turn them back to their faces), the two meeting at the corner edge
BANK_ROLL = dict(u_from=282.0)   # bank_R card mm: where the outer leaf's rolled tip (the texture's blob, drawn in 3/4, "shows a bit of the side") begins; mirrored for bank_L
PLACES = [
    # the front face: name, piece, options: x0/x1/x (inner edge or centre, mm from the face's middle), z0/z1, relief
    # (u, v) -> mm, sx (stretch about the inner edge), mirror (card u negated), roll (the outer leaf's curl, "R"/"L" end).
    # The side faces are each placement's own (SIDES).
    ("crown",   "crown",        dict(x=0.0, z0=368.0, k=1.3, relief=lambda u, v: 44.0 + 61.0 * min(max(v / 90.0, 0.0), 1.0), thick=lambda u, v: 30.0 - 20.0 * (lambda t: t * t * (3 - 2 * t))(min(max(v / 90.0, 0.0), 1.0)))),   # standing over the abacus's top edge (user 2026-10-05: "it should show above the top edge ... incline it forward so it outstands over the top edge"): 1.3 alike on both axes from its foot on the heart's top bead (368) to 485, 22 over the abacus top (463); a plate leaning forward, its face 44 mm proud at the foot to 105 at the top, 30 mm thick at the foot thinning to 10 at its tips (as a carved leaf; thicker tips read as blocks seen level with the abacus top), closed behind
    ("heart",   "heart",        dict(x=0.0, z0=200.0, relief=lambda u, v: 30.0)),
    ("pendant", "pendant",      dict(x=0.0, z1=222.0, relief=lambda u, v: 28.0)),
    ("bank_R",  "bank_R_front", dict(x0=40.0, z0=76.0, sx=1.15, relief=lambda u, v: 6.0 + 14.0 * min(v / 260.0, 1.0), roll="R", drum_touch=True)),   # its corner leaf lands on the corner cut's middle
    ("bank_L",  "bank_L_front", dict(x1=-40.0, z0=76.0, sx=1.15, relief=lambda u, v: 6.0 + 14.0 * min(v / 260.0, 1.0), roll="L", drum_touch=True)),
    ("horn_L",  "horn",         dict(drum=-1)),
    ("horn_R",  "horn",         dict(drum=+1, mirror=True)),
]
# The side faces, one capital per kind of placement (user 2026-10-05, a pier capital's plain side: "this one should be
# completed till the wall ... don't do a blind cut where ornaments are cut in places where the piece is not complete.
# put the flowers ... arrange in a way that the full or at least a natural seam (in between flowers) is where it is
# cut"; "you can resize a bit ... the side doesn't need to be the same drawing as the front"). Each side carries the
# corner's drum and its whole arm, and a run of whole leaves from under the corner to the wall beside the capital
# (side_run); the longer sides a crest over the leaves by the wall (side_crest). The front and the blank are the same
# in every one.
BANK_SEAMS = dict(bank_L=(132.8, 210.4, 300.8, 342.4), bank_R=(35.2, 76.8, 166.0, 280.4))   # card mm: the notches between neighbouring leaves (the deepest dip of the top edge between two leaf tips); bank_L's corner leaf ends at its first, bank_R's begins at its last
SL, SR = BANK_SEAMS["bank_L"], BANK_SEAMS["bank_R"]
SIDES = {
    # wall: mm behind the neck's front where the wall beside the capital starts (or the capital is cut), the same on
    # both sides; run: the slices from the corner to the wall, (bank, from, to) in card mm, None for the picture's own
    # end -- the drum's arm ends over the valley between two slices, or, after one, at the wall; crest: (piece, largest
    # scale) over the leaves, its right end at the wall
    "pilaster":  dict(wall=180.0, run=(("bank_L", SL[1], None),)),                               # piece 07: the wall 0.18 behind the pilaster's face (the user's line), the arch block 0.20 on its inner side
    "column":    dict(wall=273.0, run=(("bank_L", SL[0], None),)),                               # the block's brick columns: 0.30 proud of the brick, the capital at 1.097
    "pier":      dict(wall=504.0, run=(("bank_L", SL[1], None), ("bank_R", None, SR[3])), crest=("flower", 1.3)),   # piece 02: the pier 0.2365 wide, the capital at 0.469
    "springing": dict(wall=593.0, run=(("bank_L", SL[0], None), ("bank_R", None, SR[3])), crest=("flower", 1.3)),   # the block's narrow piers: cut 0.305 behind the foot (2 cm inside the wall's back) at 0.514, the widest pier's scale
}
RUN = dict(z0=76.0, start=-20.0, sink=40.0, gap=3.0)                  # the runs: their foot (the front banks'), where a run's one scale would start (mm behind the neck's front: under the corner), its first 40 mm growing out of the bell from the corner's edge, its end 3 mm short of the wall
ARM_WALL = dict(tail_in=12.0, dives=(45.0, 55.0, 65.0, 75.0))        # a one-slice side's arm (user 2026-10-05, a sketch on the pilaster's side, "complete the arm there"): its tail 12 mm short of the wall over the last leaf, diving to it steeply
CREST = dict(top_gap=4.0, gap=6.0, relief=12.0)                       # the crest (user 2026-10-05, on the pier's plain side over its leaves: "get another ornament to put above the flowers"; the atlas's crown "too stand alone ... doesn't integrate well", then their wall_flower_ornament_PBR): its top at least 4 mm under the abacus soffit, its underside 6 mm over the leaves, the arm and the drum, 12 mm proud


def band_flatness(horn):
    """Where along the band its texture changes least (user: "find a flatter texture area"): the luminance gradient
    along the band's centre line, at five offsets across, smoothed over 20 mm. Returns (te, weight) with the weight
    zero within 60 mm of the roll and 50 mm of the tip, highest where the texture is flattest, integrating to 1."""
    card = horn.card; T = card.spine; sT = layout.arc_len(T); sh = card.spine_shift; LT0 = sT[-1] - sh
    img = np.array(Image.open(os.path.join(ATLAS_DIR, "basecolor_rgba.png")).convert("RGBA")).astype(np.float32)
    lum = img[:, :, :3] @ np.array([0.299, 0.587, 0.114]); alpha = img[:, :, 3]
    tes = np.arange(0.0, LT0, 1.0)
    grads = []
    for off in (-12.0, -6.0, 0.0, 6.0, 12.0):
        vals = []
        for te in tes:
            t = te + sh
            q = np.array([np.interp(t, sT, T[:, 0]), np.interp(t, sT, T[:, 1])])
            q2 = np.array([np.interp(t + 1.0, sT, T[:, 0]), np.interp(t + 1.0, sT, T[:, 1])])
            tg = q2 - q; tg = tg / max(np.hypot(*tg), 1e-9); nrm = np.array([-tg[1], tg[0]])
            pnt = q + nrm * off
            u, v = horn.atlas_uv(*pnt); px, py = int(u * ATLAS), int((1.0 - v) * ATLAS)
            ok = 0 <= px < ATLAS and 0 <= py < ATLAS and alpha[py, px] >= 128
            vals.append(lum[py, px] if ok else np.nan)
        vals = np.array(vals); g = np.abs(np.gradient(vals)); grads.append(g)
    gm = np.nanmean(np.array(grads), axis=0); gm = np.where(np.isnan(gm), np.nanmax(gm), gm)
    k = 20; sm = np.convolve(gm, np.ones(k) / k, mode="same")
    w = 1.0 / (sm + 0.2 * np.median(sm))
    w[(tes < 60.0) | (tes > LT0 - 50.0)] = 0.0
    w = w ** 2                                                         # concentrate on the flattest stretch
    w /= max(np.trapezoid(w, tes), 1e-9)
    i = int(np.argmax(w)); print("  band flattest at %.0f mm of %.0f (weight peak)" % (tes[i], LT0))
    return tes, w


CURL = dict(relief=44.0, depth=34.0, fillet=6.0, dish=5.0)
CURL_ROLL = dict(r=27.0, L=76.0, fillet=4.0, overlap=3.0, axis_out=31.0)   # the corner curl as a roll: radius, length, rounded ends, its top this far into the volutes, its axis this far out of the chamfer
KNOB = dict(v_cut=196.0, seed_in=30.0, seed_v=240.0, eye_in=52.0, eye_v=228.0, corner_w=95.0)
ARM_TOP = dict(dt=12.0, hold=70.0, fade=140.0)                       # the arm's top edge near the drum: on the drum's top tangent (from dt mm past its top), held to 70 mm, back to its own line by 140   # the painted knob in the bank texture: cut above v_cut; flood seed; the spiral's eye (card mm from the outer edge / up)


def curl_roll(C, t_ax, n_out, R, L, f, cap_uv, side_uv, m=16):
    """A roll lying on its side: axis t_ax through C, radius R, length L, quarter-round ends of radius f, each end a
    Coons disc. The angle origin points back into the leaf (-n_out), so the side texture's seam hides there. Returns
    verts, faces, uvs, mats (slot 1: the unclipped atlas)."""
    zhat = np.array([0.0, 0.0, 1.0])
    verts, faces, uvs, mats = [], [], [], []
    def V(p): verts.append(tuple(float(c) for c in p)); return len(verts) - 1
    phi0 = math.pi
    def dirv(phi): return math.cos(phi + phi0) * n_out + math.sin(phi + phi0) * zhat
    def at(a, rho, phi): return C + (t_ax * a + dirv(phi) * rho) / 1000.0
    angs = [2 * math.pi * k / m for k in range(m)]
    s45 = math.sin(math.pi / 4)
    disc = layout.Card(); bl.disc_patch(disc, np.zeros((3, 2)), None, None, k=4, circle=(np.array([0.0, 0.0]), R - f))
    def cap(end):
        a = end * L / 2.0; ids, uv = [], []
        for (dx, dy) in disc.verts:                                    # local (cos, sin) of the disc -> the same angle frame as the rings
            rho = math.hypot(dx, dy); ph = math.atan2(dy, dx)
            ids.append(V(at(a, rho, ph)))
            d3 = dirv(ph) * rho
            uv.append(cap_uv(float(d3 @ n_out), float(d3 @ zhat)))
        for q in disc.quads:
            fq = tuple(ids[i] for i in q) if end > 0 else tuple(ids[i] for i in reversed(q))
            uq = tuple(uv[i] for i in q) if end > 0 else tuple(uv[i] for i in reversed(q))
            faces.append(fq); uvs.append(uq); mats.append(1)
        return ids[:m]
    def ring(a, rho): return [V(at(a, rho, ph)) for ph in angs]
    def cap_ring_uv(rho): return [cap_uv(float((dirv(ph) * rho) @ n_out), float((dirv(ph) * rho) @ zhat)) for ph in angs]
    ends = []
    for end in (1.0, -1.0):
        ends.append((cap(end), ring(end * (L / 2 - f + f * s45), R - f + f * s45), ring(end * (L / 2 - f), R)))
    (capP, f45P, f90P), (capN, f45N, f90N) = ends
    # side rings between the two fillet ends (every ~20 mm)
    nseg = max(1, int(round((L - 2 * f) / 20.0)))
    side = [f90P] + [ring(L / 2 - f - (L - 2 * f) * k / nseg, R) for k in range(1, nseg)] + [f90N]
    side_a = [L / 2 - f - (L - 2 * f) * k / nseg for k in range(nseg + 1)]
    def band(A_, B_, UA, UB):
        for i in range(m):
            j = (i + 1) % m
            faces.append((A_[i], A_[j], B_[j], B_[i])); uvs.append((UA[i], UA[j], UB[j], UB[i])); mats.append(1)
    # the rounded ends: the spiral's UVs carried out over the fillet (one material, no smear)
    band(capP, f45P, cap_ring_uv(R - f), cap_ring_uv(R - f + f * s45))
    band(f45P, f90P, cap_ring_uv(R - f + f * s45), cap_ring_uv(R))
    band(f45N, capN, cap_ring_uv(R - f + f * s45), cap_ring_uv(R - f))
    band(f90N, f45N, cap_ring_uv(R), cap_ring_uv(R - f + f * s45))
    # the side: the band wound round, s = angle x R (unwrapped per quad: no seam inside a quad)
    for k in range(nseg):
        A_, B_ = side[k], side[k + 1]; aA, aB = side_a[k], side_a[k + 1]
        for i in range(m):
            j = i + 1; jj = j % m
            sA_i, sA_j = angs[i] * R, (angs[i] + 2 * math.pi / m) * R
            faces.append((A_[i], A_[jj], B_[jj], B_[i]))
            uvs.append((side_uv(sA_i, aA), side_uv(sA_j, aA), side_uv(sA_j, aB), side_uv(sA_i, aB))); mats.append(1)
    return verts, faces, uvs, mats      # the corner leaf's curl: face 44 mm proud (under the volute's 52), back inside the leaf


def blob_circle(piece, side):
    """The corner leaf's rolled tip in the bank texture: a least-squares circle on the outline points of the bank's
    outer top corner (side +1: the right end, -1: the left end). Returns (cu, cv, r) in card mm."""
    P = np.asarray(piece.polys[0], float)
    W, H = piece.W, piece.H
    sel = P[((P[:, 0] > W - 0.25 * W) if side > 0 else (P[:, 0] < 0.25 * W)) & (P[:, 1] > 0.80 * H)]   # the knob's top arc only
    A = np.column_stack([sel[:, 0], sel[:, 1], np.ones(len(sel))]); rhs = -(sel[:, 0] ** 2 + sel[:, 1] ** 2)
    D, E, F = np.linalg.lstsq(A, rhs, rcond=None)[0]
    cx, cy = -D / 2, -E / 2; r = math.sqrt(max(cx * cx + cy * cy - F, 1.0))
    r = min(r, 42.0)
    print("  %-8s curl circle: centre (%.0f, %.0f) r %.0f mm" % (piece.name, cx, cy, r))
    return (cx, cy, r)


def build_drum(disc, circle, C, n_b, e_b, up_b, relief, roll, horn, rot=0.0):
    """The volute's roll in 3D. Face: the texture's circle (a Coons disc) scaled in to R - fillet, recessed `dish`
    toward its centre; a quarter-round fillet to the side; the side a cylinder `depth` long; a back cap. Face and
    fillet carry the spiral; the rim carries the band's own texture wound round it. Returns verts, faces, uvs, mats."""
    cx, cy, R = circle; f = roll["fillet"]; depth = roll["depth"]; dish = roll["dish"]
    c2 = np.array([cx, cy])
    verts, faces, uvs, mats = [], [], [], []
    def V(p): verts.append(tuple(float(c) for c in p)); return len(verts) - 1
    cr_, sr_ = math.cos(rot), math.sin(rot)
    def at(dx, dy, t):                                                    # rotated by `rot` (texture frame): the spiral turned with the arm
        dx, dy = cr_ * dx - sr_ * dy, sr_ * dx + cr_ * dy
        return C + (dx * e_b + dy * up_b - t * n_b) / 1000.0
    # the rounded edge per angle: flat (a hair, 0.5 mm) over the arc the arm covers -- from the band's lower edge to the
    # drum's top tangent point -- so the arm runs on flush with the face; full elsewhere, eased over 15 degrees
    B_ = horn.card.root[1]
    aB = math.atan2(B_[1] - cy, B_[0] - cx) - math.radians(5.0)
    aT = (math.pi / 2 - math.asin(min(ARM_TOP["dt"] / R, 1.0))) - rot + math.radians(5.0)
    span = (aT - aB) % (2 * math.pi)
    def fil(a):
        x = (a - aB) % (2 * math.pi)
        if x <= span: return 0.5
        d_ = min(x - span, 2 * math.pi - x)
        t = min(d_ / math.radians(15.0), 1.0); return 0.5 + (f - 0.5) * t * t * (3 - 2 * t)
    # face: disc vertices (the first 16 are the boundary, in angle order)
    s_in = (R - f) / R
    face_ids = []
    face_sc = []
    for (px, py) in disc.verts:
        sc_ = (R - fil(math.atan2(py - cy, px - cx))) / R; face_sc.append(sc_)
        dx, dy = (px - cx) * sc_, (py - cy) * sc_
        rho = math.hypot(dx, dy)
        tq = min(max(1.0 - rho / (0.8 * (R - f)), 0.0), 1.0)                   # the dish: deepest at the eye, flat on the outer turn
        face_ids.append(V(at(dx, dy, dish * tq * tq * (3.0 - 2.0 * tq))))
    face_uv = [horn.roll_uv(cx + (px - cx) * sc_, cy + (py - cy) * sc_) for (px, py), sc_ in zip(disc.verts, face_sc)]   # 1:1 with the arm
    for q in disc.quads:
        faces.append(tuple(face_ids[i] for i in q)); uvs.append(tuple(face_uv[i] for i in q)); mats.append(6)
    # rings: boundary (alpha = 0), fillet mid, fillet end, side middle, back
    m = 16
    angs = [2 * math.pi * k / m for k in range(m)]
    def ring(rho_f, t_f):                                                  # rho, t as functions of the angle
        return [V(at(rho_f(a) * math.cos(a), rho_f(a) * math.sin(a), t_f(a))) for a in angs]
    def face_uv_ring(rho_f):
        return [horn.roll_uv(cx + rho_f(a) * math.cos(a), cy + rho_f(a) * math.sin(a)) for a in angs]
    s45 = math.sin(math.pi / 4)
    rings = [face_ids[:m],
             ring(lambda a: R - fil(a) + fil(a) * s45, lambda a: fil(a) - fil(a) * s45),
             ring(lambda a: R, lambda a: fil(a)),
             ring(lambda a: R, lambda a: 0.5 * (fil(a) + depth)),
             ring(lambda a: R, lambda a: depth)]
    # rim uv: the band wound round the roll from its junction: a point `s` along the rim samples the band's midline
    # `s` along the band (wrapping), across its width down the depth
    mid, half, sarc = horn.band_mid; L = sarc[-1]
    pj = horn.band_junction; a_j = math.atan2(pj[1] - cy, pj[0] - cx)
    def rim_uv(a, tf):
        s = ((a - a_j) % (2 * math.pi)) * R % (L - 1e-6)
        k = int(np.searchsorted(sarc, s)) - 1; k = max(0, min(k, len(mid) - 2))
        u = (s - sarc[k]) / max(sarc[k + 1] - sarc[k], 1e-9)
        pm = mid[k] + (mid[k + 1] - mid[k]) * u; hw = half[k] + (half[k + 1] - half[k]) * u
        tg = mid[k + 1] - mid[k]; tg = tg / max(np.hypot(*tg), 1e-9); nb = np.array([-tg[1], tg[0]])
        q = pm + nb * ((0.5 - tf) * 2.0 * hw * abs(tg[0]) * 0.75)    # inside the band's true (perpendicular) half-width
        return horn.atlas_uv(q[0], q[1])
    # per band of quads: (inner ring UVs, outer ring UVs, material). The fillet stays on the roll texture (its outer ring at
    # the texture circle's edge), the side wears the band wound round the roll (atlas)
    bands = [(face_uv[:m], face_uv_ring(lambda a: R - fil(a) + fil(a) * s45), 6),
             (face_uv_ring(lambda a: R - fil(a) + fil(a) * s45), face_uv_ring(lambda a: R - 0.5), 6),
             ([rim_uv(a, 0.0) for a in angs], [rim_uv(a, 0.5) for a in angs], 1),
             ([rim_uv(a, 0.5) for a in angs], [rim_uv(a, 1.0) for a in angs], 1)]
    for k in range(len(rings) - 1):
        A, B = rings[k], rings[k + 1]; UA, UB, mt = bands[k]
        for i in range(m):
            j = (i + 1) % m
            faces.append((A[i], A[j], B[j], B[i])); uvs.append((UA[i], UA[j], UB[j], UB[i])); mats.append(mt)
    # back cap (hidden in the bell): the disc again at the back, reversed
    back_ids = [V(at((px - cx), (py - cy), depth)) for (px, py) in disc.verts]
    for q in disc.quads:
        faces.append(tuple(back_ids[i] for i in reversed(q))); uvs.append(tuple(face_uv[i] for i in reversed(q))); mats.append(6)
    # the back cap's boundary must share the last ring: weld by index map (same angles): replace the first 16 back ids
    for i in range(m):
        bi = back_ids[i]; ri = rings[-1][i]
        faces = [tuple(ri if x == bi else x for x in fc) for fc in faces]
    return verts, faces, uvs, mats


def build():
    P = build_pieces()
    objects = []
    leaf_tops = {}                                                        # face_tag -> [(s, z) polylines]: the banks' placed top edges
    arm_tops = {}                                                         # face_tag -> [(s, z) polyline]: the top of the arm, its web and its drum (the crest keeps over it)
    def front_face():
        """The front face (anchor centre): the PLACES pieces."""
        face_len = bell.frame_at(0.38).s_cut_start * 1000.0
        for name, pname, o in PLACES:
            piece = P[pname]
            obj = c3.MeshOut("front_%s" % name)
            if "drum" in o:                                              # the horn: band + drum
                place_horn(obj, objects, P, "front", "centre", 1.0, o["drum"], face_len, o.get("mirror", False))
                continue
            place_card(obj, piece, o, "centre", 1.0, False, o.get("sx", 1.0))
            objects.append(obj)
            if pname == "heart": add_balls("front", piece, o, "centre", 1.0)
    def side_face(variant, spec, face_tag, sign):
        """One side face (anchor side, sign +1 the right one, -1 the left) of one placement's capital: its leaves
        (side_run), the front corner's drum and its whole arm -- its tail over the leaves' valley, or at the wall when
        the run is one slice -- and the crest, if any (side_crest). The objects are named after the placement:
        pier_side_R_bank_0, pier_side_R_drum_L, pier_side_R_flower, ..."""
        tag = "%s_%s" % (variant, face_tag)
        tail_s, spans = side_run(tag, sign, spec)
        F = bell.frame_at(0.38)
        place_horn(c3.MeshOut("%s_horn_L" % tag), objects, P, tag, "side", sign, -1, (F.s_side_centre - F.s_cut_end) * 1000.0,
                   False, tail_s=tail_s, dives=ARM_WALL["dives"] if len(spans) == 1 else None)
        if spec.get("crest"): side_crest(tag, sign, spec["crest"], spec["wall"] - RUN["gap"])
    def side_crest(tag, sign, crest, y_end):
        """The scroll over the side's leaves (the owner's wall_flower: one acanthus scroll, its right stem a flush end
        made to meet the wall): that end at y_end (mm behind the neck's front, the run's own end), the largest scale
        alike on both axes, up to the crest's own, at which it fits under the abacus -- its underside, column by column
        of the picture, CREST gap over whatever is below it (the leaves' top edges, the arm, its web and the drum) and
        its top CREST top_gap under the soffit -- and sitting on them as low as that allows."""
        pname, k_max = crest
        piece = P[pname]; W, H = piece.W, piece.H; mm = piece.mmpx; Hs, Ws = piece.sub.shape
        prof = [((c + 0.5) * mm, (Hs - 1 - int(np.nonzero(piece.sub[:, c])[0].max())) * mm)
                for c in range(0, Ws, 4) if piece.sub[:, c].any()]            # (u, the picture's lowest v) per column
        tops = leaf_tops.get(tag, []) + arm_tops.get(tag, [])
        def floor(s):
            zs = [float(np.interp(s, pl[:, 0], pl[:, 1], left=-1e9, right=-1e9)) for pl in tops]
            return max(zs) if zs else -1e9
        z_lid = bell.Z_ABACUS * 1000.0 - CREST["top_gap"]
        fit = None
        for k in np.arange(k_max, 0.4, -0.01):
            z0 = max(floor(bell.side_s(y_end - (W - u) * k, 250.0)) + CREST["gap"] - v * k for (u, v) in prof)
            if z0 + H * k <= z_lid: fit = (float(k), float(z0)); break
        if fit is None: raise RuntimeError("%s: no room for the %s over the leaves" % (tag, pname))
        k, z0 = fit
        def place(u, v, w):
            z = z0 + v * k
            return bell.wrap(bell.side_s(y_end - (W - u) * k, z), z, w, anchor="side", sign=sign)
        verts, faces, uvs, mats = extrude(piece.card, place, piece.atlas_uv, lambda u, v: CREST["relief"], None, back_cap=None, piece=piece)
        mats = [7 if m == 0 else m for m in mats]                         # its face on its own texture (slot flower)
        if sign < 0: faces = [tuple(reversed(f)) for f in faces]; uvs = [tuple(reversed(uv)) for uv in uvs]
        obj = c3.MeshOut("%s_%s" % (tag, pname)); obj.add(verts, faces, uvs, 0); obj.mats[-len(mats):] = mats
        objects.append(obj)
        print("  %-18s %s at %.2f: %.0f x %.0f mm over y %.0f..%.0f, z %.0f..%.0f" % (tag, pname, k, W * k, H * k, y_end - W * k, y_end, z0, z0 + H * k))
    def side_run(tag, sign, spec):
        """A side face's leaves: slices of the banks, each from one notch between two leaves to another (BANK_SEAMS)
        or to the picture's own end, laid end to end from under the front corner to RUN gap mm short of the wall
        (spec wall, mm behind the neck's front), all at one stretch along the side (near the front banks' 1.15) and at
        the front banks' height and relief. The first RUN sink mm grow out of the bell from the corner's edge at every
        height (the bell flares: the side starts further forward higher up); past them the one stretch holds, so the
        last leaf meets the wall whole or at its notch. Registers the run's top edge for the arm's search; returns the
        arm's tail (anchor-relative s: the valley after the first slice, or ARM_WALL tail_in short of the wall for one
        slice) and each slice's y range."""
        Z0, SINK = RUN["z0"], RUN["sink"]
        y_end = spec["wall"] - RUN["gap"]
        slices, L = [], 0.0
        for bank, ua, ub in spec["run"]:
            full = P[bank]; mm = full.mmpx
            c0 = full.bx0 + int(round((0.0 if ua is None else ua) / mm)); c1 = full.bx1 if ub is None else full.bx0 + int(round(ub / mm))
            def keep(m, c0=c0, c1=c1):
                m = m.copy(); m[:, :c0] = False; m[:, c1:] = False; return m
            pt = Part(bank, mm, mask_fn=keep, layout_fn=bank_layout)
            pt.wall_inset, pt.edge_factor = 2.0, 0.35
            slices.append((pt, L + (pt.bx0 - c0) * mm, (full.by1 - pt.by1) * mm, L))   # its card's u 0 along the run, its v 0 over the bank's foot, its start
            L += (c1 - c0) * mm
        sx = (y_end - RUN["start"]) / L
        y_sink = y_end - (L - SINK) * sx
        def y_at(r, z):
            if r >= SINK: return y_end - (L - r) * sx
            y0 = bell.side_start_y(z) - 2.0                               # the corner's edge at this height, 2 mm round it
            return y0 + (y_sink - y0) * max(r, 0.0) / SINK
        print("  %-18s %d slice(s): %.0f mm of leaves at %.3f, to %.0f mm behind the neck's front" % (tag, len(slices), L, sx, y_end))
        for k, (pt, r0, v0, _) in enumerate(slices):
            def rel(u, v, r0=r0, v0=v0):                                  # the front banks' relief, from nothing at the corner
                t = min(max((r0 + u) / SINK, 0.0), 1.0); t = t * t * (3 - 2 * t)
                return (6.0 + 14.0 * min((v + v0) / 260.0, 1.0)) * t
            def place(u, v, w, r0=r0, v0=v0):
                z = Z0 + v0 + v
                return bell.wrap(bell.side_s(y_at(r0 + u, z), z), z, w, anchor="side", sign=sign)
            if k == 0: pt.wall_skip = lambda u, v, r0=r0: r0 + u < 2.0     # no walls on the edge that starts flat at the corner
            verts, faces, uvs, mats = extrude(pt.card, place, pt.atlas_uv, rel, None, back_cap=None, piece=pt)
            if sign < 0: faces = [tuple(reversed(f)) for f in faces]; uvs = [tuple(reversed(uv)) for uv in uvs]
            obj = c3.MeshOut("%s_bank_%d" % (tag, k)); obj.add(verts, faces, uvs, 0); obj.mats[-len(mats):] = mats
            objects.append(obj)
            pts = []
            for (u, T_) in pt.card.top:
                z = Z0 + v0 + T_; pts.append((bell.side_s(y_at(r0 + u, z), z), z))
            leaf_tops.setdefault(tag, []).append(np.array(sorted(pts)))
        spans = [(y_at(max(r_, SINK), 200.0), y_at(slices[i + 1][3] if i + 1 < len(slices) else L, 200.0))
                 for i, (_, _, _, r_) in enumerate(slices)]
        if len(slices) < 2: return bell.side_s(y_end - ARM_WALL["tail_in"], 200.0), spans
        return bell.side_s(y_at(slices[1][3], 200.0), 200.0), spans
    def add_balls(face_tag, piece, o, anchor, sign):
        """The heart's beads (on the card, half proud) and berries (cut from the card, sunk into the bell) as
        ellipsoids; the texture projected from the front (the card's own atlas mapping)."""
        W = piece.W; u_off = o["x"] - W / 2.0; v_off = o["z0"] if "z0" in o else o["z1"] - piece.H
        for k, (bx, by, rx, ry) in enumerate(PC.balls_mm(piece.W, piece.H)):
            s, z = bx + u_off, by + v_off
            wc = 30.0                                                   # beads and berries centred on the card's plane (30 proud): they fill their holes
            rz = 0.9 * min(rx, ry) if k < 4 else 0.9 * rx
            C0 = np.array(bell.wrap(s, z, 0.0, anchor=anchor, sign=sign))
            n = np.array(bell.wrap(s, z, 1.0, anchor=anchor, sign=sign)) - C0; n /= np.linalg.norm(n)
            e = np.array(bell.wrap(s + 1.0, z, 0.0, anchor=anchor, sign=sign)) - C0; e -= n * (e @ n); e /= np.linalg.norm(e)
            up = np.cross(n, e) if np.cross(n, e)[2] > 0 else -np.cross(n, e)
            C = C0 + n * wc / 1000.0
            sv, sf, dirs = c3.cube_sphere((0.0, 0.0, 0.0), 1.0, k=3)
            verts = [tuple(C + (d[0] * rx * e + d[1] * ry * up + d[2] * rz * n) / 1000.0) for d in
                     [np.array([dd @ np.array([1, 0, 0]), dd @ np.array([0, 0, 1]), dd @ np.array([0, -1, 0])]) for dd in dirs]]
            uvs = [tuple(piece.atlas_uv(bx + float(dirs[i][0]) * rx, by + float(dirs[i][2]) * ry) for i in f) for f in sf]
            obj = c3.MeshOut("%s_heart_ball_%d" % (face_tag, k))
            obj.add(verts, sf, uvs, 0); obj.mats[-len(sf):] = [1] * len(sf)
            objects.append(obj)
    def place_card(obj, piece, o, anchor, sign, uflip, sx):
        card = piece.card; V2 = np.array(card.verts)
        W = piece.W; uc = W / 2.0
        mirror = o.get("mirror", False)
        kk = o.get("k", 1.0)                                                 # a scale alike on both axes, about the inner edge (or the centre) and the foot
        if "x" in o: u_off = o["x"] - uc; ua = uc
        elif "x0" in o: u_off = o["x0"]; ua = 0.0                           # scaled about the inner edge
        else: u_off = o["x1"] - W; ua = W
        v_off = (o["z0"] if "z0" in o else o["z1"] - piece.H * kk)
        rel = o["relief"]
        roll = None
        if o.get("roll"):
            roll = dict(BANK_ROLL)
            if o["roll"] == "L": roll["u_from"] = W - roll["u_from"]; roll["side"] = -1.0
            else: roll["side"] = 1.0
        squash = None
        if roll is not None and o.get("drum_touch"):
            # the corner leaf squashed (inner leaves untouched) so its curl's top meets the drum's underside
            # (photo: the corner leaf's curl touches the volute, user 2026-10-03 "TOUCH" / "CYLINDER")
            z_roll = bell.Z_ABACUS * 1000.0 - 1.0 - 2.0 * 75.0 + CURL_ROLL["overlap"] - CURL_ROLL["r"]   # the roll's axis height
            squash = (min(1.0, (z_roll - 0.3 * CURL_ROLL["r"] - v_off) / KNOB["v_cut"]), roll["u_from"] - 70.0 * roll["side"], roll["side"])
        def place(u, v, w):
            uu = 2 * uc - u if mirror else u
            uu = ua + (uu - ua) * sx * kk
            vv = v * kk
            if squash is not None:
                sy_out, u0_, sd_ = squash
                fq = min(max((u - u0_) * sd_ / 70.0, 0.0), 1.0); fq = fq * fq * (3 - 2 * fq)
                vv = vv * (1.0 + (sy_out - 1.0) * fq)
            return bell.wrap(uu + u_off, vv + v_off, w, anchor=anchor, sign=sign, uflip=uflip)
        thick = o.get("thick")                                               # (u, v) -> mm: a plate that thick, closed behind, instead of a body down to the bell
        back_fn = None
        if piece.name.startswith("bank") and hasattr(card, "top"):
            pts = []
            for (u, T_) in card.top:
                uu = 2 * uc - u if mirror else u
                uu = ua + (uu - ua) * sx * kk
                vv = T_ * kk
                if squash is not None:
                    sy_out, u0_, sd_ = squash
                    fq = min(max((u - u0_) * sd_ / 70.0, 0.0), 1.0); fq = fq * fq * (3 - 2 * fq)
                    vv = vv * (1.0 + (sy_out - 1.0) * fq)
                s_ = uu + u_off
                pts.append(((-s_ if uflip else s_), vv + v_off))
            pts = np.array(sorted(pts))
            leaf_tops.setdefault(obj.name.split("_bank")[0], []).append(pts)
        verts, faces, uvs, mats = extrude(card, place, piece.atlas_uv, rel, thick, back_cap=thick is not None, piece=piece)
        if (sign < 0) != bool(uflip) != bool(mirror):
            faces = [tuple(reversed(f)) for f in faces]; uvs = [tuple(reversed(uv)) for uv in uvs]
        obj.add(verts, faces, uvs, 0); obj.mats[-len(mats):] = mats
        if o.get("drum_touch") and getattr(piece, "spiral", None) is not None:
            # the corner leaf's curl: a roll lying on its side, its axis horizontal along the corner chamfer, centred on the
            # corner, its top touching the volutes (user 2026-10-04: "the scroll is in the wrong angle" + a sketch)
            r_c, L_c = CURL_ROLL["r"], CURL_ROLL["L"]
            sgn_c = 1.0 if o["roll"] == "R" else -1.0
            z_c = bell.Z_ABACUS * 1000.0 - 1.0 - 2.0 * 75.0 + CURL_ROLL["overlap"] - r_c
            C0 = np.array(bell.wrap(0.0, z_c, 0.0, anchor="corner", sign=sgn_c))
            n_out = np.array(bell.wrap(0.0, z_c, 1.0, anchor="corner", sign=sgn_c)) - C0; n_out /= np.linalg.norm(n_out)
            t_ax = np.array(bell.wrap(1.0, z_c, 0.0, anchor="corner", sign=sgn_c)) - np.array(bell.wrap(-1.0, z_c, 0.0, anchor="corner", sign=sgn_c))
            t_ax[2] = 0.0; t_ax /= np.linalg.norm(t_ax)
            C = C0 + n_out * CURL_ROLL["axis_out"] / 1000.0
            cu, cv = piece.spiral
            sx_dir = 1.0 if n_out[0] > 0 else -1.0                     # the knob texture's u runs with the front view's x
            def cap_uv(dn, dz):                                        # the spiral, 1:1, in the cap's own plane
                return piece.atlas_uv(cu + dn * sx_dir, cv + dz)
            horn = P["horn"]; midb, halfb, sarcb = horn.band_mid; Lb = sarcb[-1]
            def side_uv(s, a):                                         # the band wound round: s round the roll, a along its axis (both 1:1)
                s = 40.0 + s % (Lb - 90.0)                             # past the band's first 40 mm (merging with the spiral), before its tip
                k = int(np.searchsorted(sarcb, s)) - 1; k = max(0, min(k, len(midb) - 2))
                f_ = (s - sarcb[k]) / max(sarcb[k + 1] - sarcb[k], 1e-9)
                pm = midb[k] + (midb[k + 1] - midb[k]) * f_; hw = halfb[k] + (halfb[k + 1] - halfb[k]) * f_
                tg = midb[k + 1] - midb[k]; tg = tg / max(np.hypot(*tg), 1e-9); nb = np.array([-tg[1], tg[0]])
                lim = 0.75 * hw * abs(tg[0])                          # hw is the band's VERTICAL half-extent: its true half-width is hw cos(slope)
                x_ = (a + lim) % (4.0 * lim); off = (x_ if x_ < 2.0 * lim else 4.0 * lim - x_) - lim   # 1:1: the band's centre at the roll's middle, folded inside its edges
                q = pm + nb * off
                return horn.atlas_uv(q[0], q[1])
            cobj = c3.MeshOut(obj.name.replace("bank", "curl"))
            cv_, cf_, cuv_, cm_ = curl_roll(C, t_ax, n_out, r_c, L_c, CURL_ROLL["fillet"], cap_uv, side_uv)
            cobj.add(cv_, cf_, cuv_, 0); cobj.mats[-len(cm_):] = cm_
            objects.append(cobj)

    def place_horn(obj, objects, P, face_tag, anchor, sign, d, face_len, mirror, arm=True, tail_s=None, dives=None):
        """The band (grid card without the roll's circle) with its end landing on the drum's face, and the drum (the
        circle as a disc, extruded) hung at the face's end. d = +1: toward +s (the right corner on the front, the
        back corner on a side); -1: toward -s. A side's back corner gets no drum (the wall): the band ends there.
        arm False: the drum alone; tail_s: the arm's tail there (anchor-relative s, mm) instead of ARM_TAIL's, 45 mm
        short of the face's middle; dives: the angles (degrees under level) its search tries for the arm's end."""
        horn = P["horn"]; card = horn.card; cx, cy, r = horn.circle
        W = horn.W; uc = W / 2.0
        has_drum = not (anchor == "side" and d > 0)
        def add_drum(g):
            # the drum: a cylinder with a rounded front edge and a dished spiral face; its rim wears the band itself
            # (a roll is the band rolled up), the first 150 mm of the band from the roll, repeated round the rim
            disc = P["disc"]; C, n_b, e_b, up_b, relief = g["C"], g["n_b"], g["e_b"], g["up_b"], ROLL["relief"]
            mirror_tex = bool(mirror) != (sign < 0)
            dobj = c3.MeshOut("%s_drum_%s" % (face_tag, "R" if d > 0 else "L"))
            dv_, df_, duv_, dm_ = build_drum(disc, (cx, cy, r), C, n_b, e_b * (-1.0 if mirror_tex else 1.0), up_b, relief, ROLL, horn, rot=horn.alpha)
            if mirror_tex:
                df_ = [tuple(reversed(f)) for f in df_]; duv_ = [tuple(reversed(uv)) for uv in duv_]
            dobj.add(dv_, df_, duv_, 0); dobj.mats[-len(dm_):] = dm_
            objects.append(dobj)
        # the drum's centre on the face: ROLL_AT_END past the face's end toward d, its top touching the abacus soffit
        # (photo: the volute spans 282-430 mm, r 74 -- user 2026-10-03 "TOUCH")
        s_c = d * (face_len + ROLL_AT_END); z_c = bell.Z_ABACUS * 1000.0 - r - 1.0
        # the arm re-pathed (user 2026-10-03, the photo + red lines): its root hidden inside the drum just under the drum's
        # top, its top edge running along the abacus soffit, its centre line a cubic that runs level for ARM_LEVEL of the
        # way and then dives to its tail under the heart's lower C curl. The texture follows the new line: a card point's
        # place along the texture's own centre line and its offset across it are kept.
        T = card.spine; sT = layout.arc_len(T); LT = sT[-1]
        sh = card.spine_shift; LT0 = LT - sh                              # the spine's stretch inside the circle; the band's own length
        gdir = -d; mx = gdir                                              # the arm runs toward the face's middle; texture +x -> face s
        # the band's direction where it leaves the roll (texture frame), and the rotation that makes it leave level:
        # drum and arm share it, so the spiral's outer turn and the band's ridges stay in register (user: "align the textures")
        k0 = int(np.searchsorted(sT, sh)); k1 = int(np.searchsorted(sT, sh + 30.0)); k1 = min(k1, len(T) - 1)
        dT = T[k1] - T[k0]; alpha = -math.atan2(dT[1], dT[0])
        ca_, sa_ = math.cos(alpha), math.sin(alpha)
        def rigid(p):                                                     # the drum's own mapping: rotated about the roll's centre
            q = p - np.array([cx, cy]); q = np.array([ca_ * q[0] - sa_ * q[1], sa_ * q[0] + ca_ * q[1]])
            return np.array([s_c + mx * q[0], z_c + q[1]])
        P0 = rigid(T[k0])                                                 # the root chord's middle, where the band leaves the roll
        if not arm:
            horn.alpha = alpha; add_drum(roll_geom(s_c, z_c, anchor, sign)); return
        off_sign = 1.0 if gdir > 0 else -1.0                              # the texture's top edge stays on top on both arms
        tail_x = -gdir * ARM_TAIL[0] if tail_s is None else tail_s
        def make_path(level, a3d, tail_z):
            P3 = np.array([tail_x, tail_z])
            chord = float(np.hypot(*(P3 - P0)))
            B1 = P0 + np.array([gdir * level * chord, 0.0])
            a3 = math.radians(a3d); tang3 = np.array([gdir * math.cos(a3), -math.sin(a3)])
            B2 = P3 - tang3 * 0.30 * chord
            tt = np.linspace(0.0, 1.0, 200)[:, None]
            Bz = (1 - tt) ** 3 * P0 + 3 * (1 - tt) ** 2 * tt * B1 + 3 * (1 - tt) * tt ** 2 * B2 + tt ** 3 * P3
            return Bz, layout.arc_len(Bz)
        def mapper(Bz, sB):
            """(te, off) -> the face point: along the path at a uniform-scale ramp (1:1 at the drum, k_t at the tail,
            the texture never stretched one way only), across by off x the same scale."""
            LB = sB[-1]
            tes_, wf = horn.flat
            ramp = lambda te: (lambda x: x * x * (3 - 2 * x))(min(max(te / (0.4 * LT0), 0.0), 1.0))
            ramp_int = np.concatenate([[0.0], np.cumsum([ramp(t) for t in tes_[1:]])]) * (tes_[1] - tes_[0])
            # the uniform scale: 1 at the root, kc by 40 % of the length (capped: the band must not get chunky)
            cap_ = ARM_SCALE_CAP if anchor == "centre" else ARM_SCALE_CAP_SIDE
            kc = 1.0 + max(min((LB - LT0) / max(ramp_int[-1], 1e-9), cap_ - 1.0), (LB - LT0) / max(ramp_int[-1], 1e-9) if LB < LT0 else 0.0)
            extra = LB - (LT0 + (kc - 1.0) * ramp_int[-1])                # what the uniform scale cannot absorb: along the flattest stretch
            w_int = np.concatenate([[0.0], np.cumsum(0.5 * (wf[1:] + wf[:-1]) * np.diff(tes_))])
            def k_of(te): return 1.0 + (kc - 1.0) * ramp(te)
            def tau_of(te):
                if te <= 0: return te
                if te >= tes_[-1]: return LB + k_of(te) * (te - tes_[-1])
                return te + (kc - 1.0) * float(np.interp(te, tes_, ramp_int)) + extra * float(np.interp(te, tes_, w_int))
            def target(tau):
                tau = min(tau, LB)
                if tau <= 0:
                    tg0 = np.array([gdir, 0.0]); return P0 + tg0 * tau, np.array([-tg0[1], tg0[0]])
                k = int(np.searchsorted(sB, tau) - 1); k = max(0, min(k, len(sB) - 2))
                f_ = (tau - sB[k]) / max(sB[k + 1] - sB[k], 1e-9)
                q = Bz[k] + (Bz[k + 1] - Bz[k]) * f_
                tg = Bz[k + 1] - Bz[k]; tg = tg / max(np.hypot(*tg), 1e-12)
                return q, np.array([-tg[1], tg[0]])
            def m(te, off, uv):
                q, nrm = target(tau_of(te))
                q_path = q + nrm * off * off_sign * k_of(te)
                q_rig = rigid(np.asarray(uv, float))
                kr_ = (round(float(uv[0]), 2), round(float(uv[1]), 2))
                ter = card.row_te.get(kr_, te)                            # the blend by the row's station: rows stay straight
                bl_ = min(max(ter / 60.0, 0.0), 1.0); bl_ = bl_ * bl_ * (3 - 2 * bl_)
                return (1.0 - bl_) * q_rig + bl_ * q_path
            return m
        # the arm's outline samples (texture params), for the clearance test
        Vc = np.array(card.verts)
        bnd = set(i for e_ in qc.boundary_edges(card.quads) for i in e_)
        samp = []
        for i in bnd:
            t_, side_, dist_ = qc.project_on(T, sT, Vc[i]); samp.append((t_ - sh, side_ * dist_, Vc[i]))
        for (a_, b_) in qc.boundary_edges(card.quads):
            pm = 0.5 * (Vc[a_] + Vc[b_]); t_, side_, dist_ = qc.project_on(T, sT, pm); samp.append((t_ - sh, side_ * dist_, pm))
        tops = leaf_tops.get(face_tag, [])
        def leaf_top(s):
            zs = [float(np.interp(s, pl[:, 0], pl[:, 1], left=-1e9, right=-1e9)) for pl in tops]
            return max(zs) if zs else -1e9
        def clearance(m):
            worst = 1e9
            for (te_, off_, uv_) in samp:
                if te_ < 20.0: continue                                   # the root, inside the drum
                q = m(te_, off_, uv_); worst = min(worst, q[1] - leaf_top(q[0]))
            return worst
        # the search: the lowest tail (user: "lower the base of the arm, the maximum possible without touching the leaves")
        best = None
        for level in (0.25, 0.35, 0.45, 0.55):
            for a3d in (dives or (25.0, 35.0, 45.0)):
                for tz in np.arange(ARM_TAIL_MIN, ARM_TAIL[1] + 60.0, 3.0):
                    Bz_, sB_ = make_path(level, a3d, tz)
                    if clearance(mapper(Bz_, sB_)) >= ARM_GAP:
                        if best is None or tz < best[0] - 1e-6: best = (tz, level, a3d)
                        break
        if best is None: best = (ARM_TAIL[1], ARM_LEVEL, 35.0)
        Bz, sB = make_path(best[1], best[2], best[0]); LB = sB[-1]
        arm_map = mapper(Bz, sB)
        arm_pts = [arm_map(te_, off_, uv_) for (te_, off_, uv_) in samp]
        if has_drum: arm_pts += [(s_c + r * math.cos(a_), z_c + r * math.sin(a_)) for a_ in np.linspace(0.0, 2.0 * math.pi, 48)]
        print("  %-14s arm: tail z %.0f mm, level %.2f, dive %.0f deg, clearance %.1f mm, path / texture length %.2f" % (
            face_tag + "_" + ("R" if d > 0 else "L"), best[0], best[1], best[2], clearance(arm_map), LB / LT0))
        def tex_param(u, v):
            t, side, dist = qc.project_on(T, sT, np.array([u, v]))
            return t - sh, side * dist
        def te_row(u, v):                                                 # the vertex's ROW station (a whole row gets the same depth)
            k_ = (round(float(u), 2), round(float(v), 2))
            return card.row_te[k_] if k_ in card.row_te else tex_param(u, v)[0]
        def rel(u, v):                                                    # 50 (with the drum's face) for the first 50 mm, then easing to 12 at the tail
            f_ = min(max((te_row(u, v) - 50.0) / max(LT0 - 50.0, 1.0), 0.0), 1.0); f_ = f_ * f_ * (3 - 2 * f_)
            return 12.0 + 38.0 * (1.0 - f_) ** 1.3
        g = roll_geom(s_c, z_c, anchor, sign) if has_drum else None
        horn.alpha = alpha
        def land_w(sx_, zx_, w, te_r):
            """The depth near the drum: its face plane at the root (0.8 mm under it), easing to the band's own relief by
            120 mm along the arm (by the row's station: a whole row gets the same blend)."""
            tl = 1.0 - min(max(te_r / 120.0, 0.0), 1.0); tl = tl * tl * (3 - 2 * tl)
            if tl <= 0: return w
            p0 = np.array(bell.wrap(sx_, zx_, 0.0, anchor=anchor, sign=sign, flat="cut"))
            nn = np.array(bell.wrap(sx_, zx_, 1.0, anchor=anchor, sign=sign, flat="cut")) - p0
            nn /= max(np.linalg.norm(nn), 1e-12)
            den = float(nn @ g["n_b"])
            if abs(den) <= 0.2: return w
            w_plane = float((g["C"] - p0) @ g["n_b"]) / den * 1000.0 - 0.8
            return w + tl * (w_plane - w)
        def place(u, v, w):
            te, off = tex_param(u, v)
            sx_, zx_ = arm_map(te, off, (u, v))                           # rigid with the drum at the root, the searched path beyond 60 mm
            if g is not None and w > 1e-9: w = land_w(sx_, zx_, w, te_row(u, v))
            return bell.wrap(sx_, zx_, w, anchor=anchor, sign=sign, flat="cut" if has_drum else "none")
        verts, faces, uvs, mats = extrude(card, place, horn.atlas_uv, rel, None, back_cap=None, piece=horn)
        if (sign < 0) != (gdir < 0):                                      # the re-pathed arm is mirrored when it runs toward -s
            faces = [tuple(reversed(f)) for f in faces]; uvs = [tuple(reversed(uv)) for uv in uvs]
        obj.add(verts, faces, uvs, 0); obj.mats[-len(mats):] = mats
        if has_drum:
            # the WEB: from the band's own top edge up to the drum's top tangent line (user 2026-10-04: the arm "not
            # connected", then "align the textures"). The band keeps its drum-aligned texture; the web continues the band's
            # texture outward from its top edge on the drum's filled roll texture (slot 6), so it joins the band below and
            # the drum beside it without a seam.
            Dt = ARM_TOP["dt"]; zt0 = math.sqrt(max(r * r - Dt * Dt, 0.0)); slope_t = Dt / max(zt0, 1e-9)
            tops = card.top_pts
            nat, lif, uvb, uvt, tes = [], [], [], [], []
            for k, (u, v) in enumerate(tops):
                te, off = tex_param(u, v)
                sN = np.array(arm_map(te, off, (u, v)))
                if k == 0:
                    sL = np.array([s_c + gdir * Dt, z_c + zt0])
                else:
                    D_ = (sN[0] - s_c) * gdir
                    E_ = z_c + (math.sqrt(max(r * r - D_ * D_, 0.0)) if D_ <= Dt else zt0 - slope_t * (D_ - Dt))
                    wq = 1.0 - min(max((D_ - ARM_TOP["hold"]) / (ARM_TOP["fade"] - ARM_TOP["hold"]), 0.0), 1.0); wq = wq * wq * (3 - 2 * wq)
                    sL = np.array([sN[0], sN[1] + max(0.0, E_ - sN[1]) * wq])
                lift = float(np.hypot(*(sL - sN)))
                # the band's outward normal at this top point, in the texture frame (card mm)
                t_, side_, dist_ = qc.project_on(T, sT, np.array([u, v]))
                k_ = int(np.searchsorted(sT, t_)); k_ = max(1, min(k_, len(T) - 1))
                tg = T[k_] - T[k_ - 1]; tg = tg / max(np.hypot(*tg), 1e-9); nrm_t = np.array([-tg[1], tg[0]])
                if float((np.array([u, v]) - T[k_]) @ nrm_t) < 0: nrm_t = -nrm_t   # pointing out of the band through its top edge
                nat.append(sN); lif.append(sL); tes.append(te_row(u, v))
                uvb.append(horn.roll_uv(u, v)); uvt.append(horn.roll_uv(*(np.array([u, v]) + nrm_t * lift)))
            wv, wf, wu, wm = [], [], [], []
            def wpt(sz, te_r, u, v):
                return bell.wrap(sz[0], sz[1], land_w(sz[0], sz[1], rel(u, v), te_r), anchor=anchor, sign=sign, flat="cut")
            last = 0
            for k in range(len(tops)):
                if float(np.hypot(*(lif[k] - nat[k]))) > 0.3: last = k
            for k in range(min(last + 1, len(tops) - 1)):
                u0_, v0_ = tops[k]; u1_, v1_ = tops[k + 1]
                ids = []
                for sz, te_r, uu, vv in ((nat[k], tes[k], u0_, v0_), (nat[k + 1], tes[k + 1], u1_, v1_), (lif[k + 1], tes[k + 1], u1_, v1_), (lif[k], tes[k], u0_, v0_)):
                    ids.append(len(wv)); wv.append(wpt(sz, te_r, uu, vv))
                wf.append(tuple(ids)); wu.append((uvb[k], uvb[k + 1], uvt[k + 1], uvt[k])); wm.append(6)
                # the web's top edge wall, down to the bell, in the plain clay
                b0 = bell.wrap(lif[k][0], lif[k][1], 0.0, anchor=anchor, sign=sign, flat="cut"); b1 = bell.wrap(lif[k + 1][0], lif[k + 1][1], 0.0, anchor=anchor, sign=sign, flat="cut")
                i0 = len(wv); wv += [wv[ids[3]], wv[ids[2]], b1, b0]
                L_ = float(np.hypot(*(lif[k + 1] - lif[k])))
                wf.append((i0, i0 + 1, i0 + 2, i0 + 3)); wu.append(((0.0, 0.0), (L_ / 200.0, 0.0), (L_ / 200.0, 0.25), (0.0, 0.25))); wm.append(5)
            if (sign < 0) != (gdir < 0):
                wf = [tuple(reversed(f)) for f in wf]; wu = [tuple(reversed(uv)) for uv in wu]
            if wf:
                obj.add(wv, wf, wu, 0); obj.mats[-len(wm):] = wm
        objects.append(obj)
        if has_drum: add_drum(g)
        arm_pts = np.array(arm_pts + ([tuple(p) for p in lif] if has_drum else []), float)   # the upper envelope of the arm, its web and its drum
        bins = np.arange(arm_pts[:, 0].min(), arm_pts[:, 0].max() + 4.0, 4.0); top = np.full(len(bins), np.nan)
        for i_, z_ in zip(np.clip(((arm_pts[:, 0] - bins[0]) / 4.0).astype(int), 0, len(bins) - 1), arm_pts[:, 1]):
            top[i_] = z_ if np.isnan(top[i_]) else max(top[i_], z_)
        ok_ = ~np.isnan(top)
        arm_tops.setdefault(face_tag, []).append(np.column_stack([bins, np.interp(bins, bins[ok_], top[ok_])]))

    def roll_geom(s_c, z_c, anchor, sign):
        C = np.array(bell.wrap(s_c, z_c, ROLL["relief"], anchor=anchor, sign=sign, flat="cut"))
        C0 = np.array(bell.wrap(s_c, z_c, 0.0, anchor=anchor, sign=sign, flat="cut"))
        n = C - C0; n /= np.linalg.norm(n)
        zhat = np.array([0.0, 0.0, 1.0]); e = np.cross(zhat, n)
        Ks = [np.array(bell.wrap(0.0, z_c, 0.0, anchor="corner", sign=sg)) for sg in (1.0, -1.0)]
        K = min(Ks, key=lambda k: np.linalg.norm(k - C0))
        toward = e if float((K - C0) @ e) > 0 else -e
        yaw = math.radians(ROLL["yaw"]); tilt = math.radians(ROLL["tilt"])
        n_b = math.cos(yaw) * n + math.sin(yaw) * toward; n_b /= np.linalg.norm(n_b)
        e_b = np.cross(zhat, n_b)
        n_b = math.cos(tilt) * n_b + math.sin(tilt) * zhat; n_b /= np.linalg.norm(n_b)
        up_b = np.cross(n_b, e_b)
        return dict(C=C, n_b=n_b, e_b=e_b, up_b=up_b)

    front_face()
    for variant, spec in SIDES.items():                                   # each placement's two side faces
        n0 = len(objects)
        side_face(variant, spec, "side_R", 1.0)
        side_face(variant, spec, "side_L", -1.0)
        for o in objects[n0:]: o.variant = variant
    # the blank: neck and abacus mouldings textured, the bell a plain clay patch, each its own material
    bm = bell.blank_mesh(lod=1)
    blank = c3.MeshOut("blank")
    slot = {0: 3, 1: 4, 2: 2}; abl, nkl = bm["abacus_profile_len"], bm["neck_profile_len"]
    uvs, mats = [], []
    for f, uv, m in zip(bm["faces"], bm["uvs"], bm["mats"]):
        plain = all(a == 0 and b_ == 0 for (a, b_) in uv)
        if plain: uvs.append(tuple((0.1, 0.1) for _ in uv)); mats.append(4); continue
        if m == 2:   uvs.append(tuple((u / 0.30, v / abl) for (u, v) in uv))
        elif m == 0: uvs.append(tuple((u / 0.30, v / nkl) for (u, v) in uv))
        else:        uvs.append(tuple((u / 0.36, v / 0.20) for (u, v) in uv))
        mats.append(slot[m])
    blank.add(bm["verts"], bm["faces"], uvs, 0); blank.mats = mats
    objects.append(blank)
    MATS = ["atlas", "atlas_noclip", "abacus", "neck", "bell", "sides", "roll", "flower"]   # the slots, in order (blender_import.py)
    out = dict(materials=MATS, objects=[dict(o.as_dict(), variant=getattr(o, "variant", None)) for o in objects],   # variant None: in every placement's capital
               sides={k: dict(wall=v["wall"], crest=v["crest"][0] if v.get("crest") else "") for k, v in SIDES.items()},
               textures=dict(atlas_dir=ATLAS_DIR, basecolor="basecolor_rgba.png", normal="normal_opengl.png", roughness="roughness.png",
                             ao="ambient_occlusion.png", abacus=os.path.join(TEX_DIR, "abacus.png"), neck=os.path.join(TEX_DIR, "neck.png"),
                             bell=os.path.join(TEX_DIR, "bell.png"), roll_dir=ROLL_TEX_DIR, flower_dir=FLOWER_DIR))
    json.dump(out, open(os.path.join(BUILD_DIR, "stage2_mesh.json"), "w"))
    nq = sum(len(o.faces) for o in objects); ntri = sum(sum(len(f) - 2 for f in o.faces) for o in objects)
    print("objects %d, faces %d (%d triangles), verts %d" % (len(objects), nq, ntri, sum(len(o.verts) for o in objects)))
    for variant in SIDES:
        sel = [o for o in objects if getattr(o, "variant", None) in (None, variant)]
        print("  the %-9s capital: %d objects, %d triangles" % (variant, len(sel), sum(sum(len(f) - 2 for f in o.faces) for o in sel)))


def extrude(card, place, uvfn, relief, thickness, back_cap=None, piece=None):
    """Grid card -> front cap (slot 0, alpha clipped), optional back cap, and the skirt (slot 5): walls along the
    picture's own outline and holes (piece.skirts), from the card's surface down to the bell -- or, given a thickness,
    to the plate's own back."""
    V2 = np.array(card.verts); n = len(V2)
    rel_in = relief
    def wback(u, v):                                                      # the back: on the bell, or a plate's own back
        return 0.0 if thickness is None else rel_in(u, v) - thickness(u, v)
    ef = getattr(piece, "edge_factor", 1.0) if piece is not None else 1.0
    if ef != 1.0:                                                         # a cushion: the card's edge vertices lowered toward the back, so its walls are short
        edge_v = set(i for e_ in qc.boundary_edges(card.quads) for i in e_)
        def relief(u, v, _r=rel_in, _V=V2, _ev=edge_v, _ef=ef):
            k = int(np.argmin(np.hypot(_V[:, 0] - u, _V[:, 1] - v)))
            if not (k in _ev and abs(_V[k, 0] - u) + abs(_V[k, 1] - v) < 1e-6): return _r(u, v)
            b = wback(u, v); return b + _ef * (_r(u, v) - b)
    front = [place(u, v, relief(u, v)) for (u, v) in V2]
    back = [place(u, v, wback(u, v)) for (u, v) in V2]
    verts = front + back
    faces, uvs, mats = [], [], []
    uv_of = [uvfn(u, v) for (u, v) in V2]
    for f in card.quads:
        faces.append(tuple(f)); uvs.append(tuple(uv_of[i] for i in f)); mats.append(0)
    if back_cap:
        for f in card.quads:
            if callable(back_cap):
                c = V2[list(f)].mean(axis=0)
                if not back_cap(c[0], c[1]): continue
            faces.append(tuple(n + i for i in reversed(f))); uvs.append(tuple(uv_of[i] for i in reversed(f))); mats.append(0)
    # walls: one per boundary edge of the face (outline and holes), sharing the face's vertices; UVs 1.5 mm inside
    skip = getattr(piece, "wall_skip", None) if piece is not None else None
    sub_ = getattr(piece, "sub", None) if piece is not None else None
    def on_picture(pa, pb, nrm):
        """Is the picture there just inside this edge (1 mm in) along most of it? Walls elsewhere would stand in the
        gaps beside the picture as dark fins (user 2026-10-03, "artifacts/holes")."""
        if sub_ is None: return True
        Hs, Ws = sub_.shape; mm = piece.mmpx; hits = 0
        for t in (0.1, 0.3, 0.5, 0.7, 0.9):
            q = pa + (pb - pa) * t + nrm * 1.0
            px, py = int(q[0] / mm), int(Hs - q[1] / mm)
            if 0 <= px < Ws and 0 <= py < Hs and sub_[py, px]: hits += 1
        return hits >= 3
    for (a, b) in qc.boundary_edges(card.quads):
        pa, pb = V2[a], V2[b]; e = pb - pa; L = float(np.hypot(*e))
        if skip is not None and skip(*(0.5 * (pa + pb))): continue
        nrm_in = np.array([-e[1], e[0]]) / L if L > 1e-9 else np.array([0.0, 0.0])
        if not on_picture(pa, pb, nrm_in): continue
        # flat clay at 1:1 (user: "not stretched ... a flatter texture area"): u along the edge, v down the wall, 0.2 m repeat
        s0 = (pa[0] + pa[1]) / 200.0; s1 = s0 + L / 200.0
        da = (relief(*pa) - wback(*pa)) / 200.0; db = (relief(*pb) - wback(*pb)) / 200.0
        faces.append((b, a, n + a, n + b)); uvs.append(((s1, 0.0), (s0, 0.0), (s0, da), (s1, db))); mats.append(5)
    return verts, faces, uvs, mats


if __name__ == "__main__":
    build()
