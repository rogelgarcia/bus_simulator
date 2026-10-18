# entrance_doors.py -- user fix 16 (2026-10-15): the real doors in the front centre's glazing, for layer_podium.py.
#
# The user, on the main entrance's two centre bays (images/18.png): "these must be real doors; in the second floor it can
# be automatic slide doors; Add handlers, rails, connectors". Plan values: podium.entrance_detail.doors (make_plan.py
# ENTRANCE_DOORS). Pieces go into the caller's item lists (rb_lib solids) and extras (callables (bm, slots) -> None);
# layer_podium.py makes the objects:
#   Wall            a glazed wall on the entrance's 1 m grid (end jambs, sill and head rails, mullions, transom, panes)
#                   with its door bays open: the sill stops at the opening (a threshold there), the mullion between the
#                   door bays goes, the transom over them is the door head (`head` tall), a mullion stub above it;
#                   every fixed pane sits between glazing beads on both faces (no glass grows straight out of a frame)
#   swing_pair()    the vestibule's pair of glass swing doors (rb_entrance_doors, rb_entrance_door_glass): framed glass
#                   leaves (stiles, rails) with a gap round each, long bar pulls on standoffs on both faces, offset top
#                   and bottom pivots with patch straps, a concealed overhead closer in the deep door head behind
#                   screwed cover plates, an astragal and a seal fin where the leaves meet, a slim stainless threshold
#                   with the floor springs' cover plates set flush in it
#   sliders()       the loggia's automatic bi-parting sliders onto the floor-1 terrace (rb_loggia_sliders,
#                   rb_loggia_slider_glass): framed leaves hung on the terrace face in front of the fixed side panels
#                   (they slide past them), an operator header (the rail) with a slot, the track and the leaves'
#                   hangers in it, end caps, motion sensors outside and inside, floor guides past the leaves' ends,
#                   brush seals under the leaves and behind their outer stiles, rubber seals at the meeting stiles,
#                   flush pulls, a stainless threshold flush with the terrace paving
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

import bmesh

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import rb_lib as L  # noqa: E402

FRAME, GLASS = "TM_RB_frame", "TM_RB_glass"
STEEL, SEAL, LENS = "TM_RB_stainless", "TM_RB_seal", "TM_RB_sensor_lens"


def box(x0, x1, y0, y1, z0, z1, mat):
    """An axis-aligned box item for rb_lib's solids."""
    return L.piece(L.rect(min(x0, x1), max(x0, x1), min(y0, y1), max(y0, y1)), [(min(z0, z1), max(z0, z1))], mat)


def circle(c, r, n):
    return [(c[0] + r * math.cos(2 * math.pi * (k + 0.5) / n), c[1] + r * math.sin(2 * math.pi * (k + 0.5) / n))
            for k in range(n)]


def rod(c, r, z0, z1, mat, n=16):
    """A vertical round rod (bar, pivot pin) at plan point c."""
    return L.piece(circle(c, r, n), [(z0, z1)], mat)


def prism(axis, section, a0, a1, mat):
    """An extra solid: the polygon `section` (in the two other axes, xyz order) swept along `axis` from a0 to a1 (a
    standoff along y, the threshold's chamfered section along x). rb_lib.finish() turns its normals out."""
    k = "xyz".index(axis)
    o = [i for i in range(3) if i != k]

    def add(bm, slots):
        if mat not in slots:
            slots.append(mat)
        mi = slots.index(mat)

        def vert(p, a):
            co = [0.0, 0.0, 0.0]
            co[k], co[o[0]], co[o[1]] = a, p[0], p[1]
            return bm.verts.new(co)
        r0, r1 = [vert(p, a0) for p in section], [vert(p, a1) for p in section]
        n = len(section)
        faces = [bm.faces.new(list(reversed(r0))), bm.faces.new(r1)]
        faces += [bm.faces.new((r0[i], r0[(i + 1) % n], r1[(i + 1) % n], r1[i])) for i in range(n)]
        for f in faces:
            f.material_index = mi
    return add


def make(name, coll, items, extras, tg):
    """One object from solids (items) and extra solids (callables)."""
    bm = bmesh.new()
    slots = []
    for spans, boundary, regions in items:
        L._add_solid(bm, slots, spans, boundary, regions)
    for add in extras:
        add(bm, slots)
    return L.finish(name, coll, bm, slots, tg)


class Wall:
    """A glazed wall along x between the frame faces y = (y0, y1) on the plan's grid: pane spans `panes` (as
    glass_frame's), z0..z1, `member` jambs and mullions, `sill` / `head` rails, a `transom` bar (z pair) over the fixed
    bays. door_bays: the pane indices that open; head: (z bottom, z top) of the door head over them."""

    def __init__(self, panes, lo, hi, y, gd, z0, z1, member, sill, head_rail, transom, door_bays, head):
        self.panes, self.lo, self.hi, (self.y0, self.y1) = panes, lo, hi, y
        self.ym, self.gd = (y[0] + y[1]) / 2, gd
        self.z0, self.z1, self.m, self.sill, self.head_rail, self.transom = z0, z1, member, sill, head_rail, transom
        self.doors = list(door_bays)
        self.x0, self.x1 = panes[self.doors[0]][0], panes[self.doors[-1]][1]       # the opening between the mullions
        self.head = head

    def frame(self, bead, frames, glass):
        """The fixed frame, the panes and their glazing beads (bead: width in the pane's plane, thickness off the glass)
        into frames / glass. Returns the number of fixed panes."""
        y0, y1, m, z0, z1 = self.y0, self.y1, self.m, self.z0, self.z1
        hb, ht = self.head
        F = lambda a, b, c, d: frames.append(box(a, b, y0, y1, c, d, FRAME))  # noqa: E731
        F(self.lo, self.lo + m, z0, z1)
        F(self.hi - m, self.hi, z0, z1)
        F(self.lo + m, self.hi - m, z1 - self.head_rail, z1)
        F(self.lo + m, self.x0, z0, z0 + self.sill)                     # the sill stops at the opening
        F(self.x1, self.hi - m, z0, z0 + self.sill)
        prev = self.lo + m
        for s0, s1 in self.panes + [(self.hi - m, None)]:
            if s0 - prev > 1e-6:
                over_door = self.x0 < (prev + s0) / 2 < self.x1           # the mullion between the door bays: a stub
                F(prev, s0, ht if over_door else z0 + self.sill, z1 - self.head_rail)
            prev = s1
        F(self.x0, self.x1, hb, ht)                                     # the door head
        n = 0
        for k, (s0, s1) in enumerate(self.panes):
            spans = [(ht, z1 - self.head_rail)]
            if k not in self.doors:
                F(s0, s1, *self.transom)
                spans = [(z0 + self.sill, self.transom[0]), (self.transom[1], z1 - self.head_rail)]
            for za, zb in spans:
                glass.append(box(s0, s1, self.ym - self.gd, self.ym + self.gd, za, zb, GLASS))
                self.beads(s0, s1, za, zb, bead, frames)
                n += 1
        return n

    def beads(self, s0, s1, za, zb, bead, out):
        """Glazing beads round a pane on both faces: the glass held between stops, never growing out of the frame."""
        w, t = bead["width"], bead["thickness"]
        for g0, g1 in ((self.ym - self.gd - t, self.ym - self.gd), (self.ym + self.gd, self.ym + self.gd + t)):
            out.append(box(s0, s1, g0, g1, za, za + w, FRAME))
            out.append(box(s0, s1, g0, g1, zb - w, zb, FRAME))
            out.append(box(s0, s0 + w, g0, g1, za + w, zb - w, FRAME))
            out.append(box(s1 - w, s1, g0, g1, za + w, zb - w, FRAME))


def leaf(xa, xb, y0, y1, za, zb, lf, hinge_side, items, glass):
    """A framed glass leaf: x from xa to xb (hinge_side "a" / "b" / None: that stile lf["hinge_stile"] wide, the other
    lf["meeting_stile"]; sliders: both lf["stile"]), y0..y1 deep, za..zb tall; rails top / bottom, the glass centred in
    the frame (its edges against the members' inner faces: the members are deeper than the glass, a channel)."""
    if hinge_side is None:
        wa = wb = lf["stile"]
    else:
        wa = lf["hinge_stile"] if hinge_side == "a" else lf["meeting_stile"]
        wb = lf["hinge_stile"] if hinge_side == "b" else lf["meeting_stile"]
    tr, br = lf["top_rail"], lf["bottom_rail"]
    items.append(box(xa, xa + wa, y0, y1, za, zb, FRAME))
    items.append(box(xb - wb, xb, y0, y1, za, zb, FRAME))
    items.append(box(xa + wa, xb - wb, y0, y1, zb - tr, zb, FRAME))
    items.append(box(xa + wa, xb - wb, y0, y1, za, za + br, FRAME))
    ym, g = (y0 + y1) / 2, lf["glass"] / 2
    glass.append(box(xa + wa, xb - wb, ym - g, ym + g, za + br, zb - tr, GLASS))
    return wa, wb


def swing_pair(w, d):
    """The entrance's pair of glass swing doors in Wall w's opening (plan doors.swing = d). Returns (items, extras,
    glass, report)."""
    lf, items, extras, glass = d["leaf"], [], [], []
    ym, dep, gap = w.ym, lf["depth"], lf["gap"]
    yo, yi = ym - dep / 2, ym + dep / 2                                  # the leaves' outer (street) and inner faces
    th = d["threshold"]
    z_th = w.z0 + th["height"]
    za, zb = z_th + gap, w.head[0] - gap                               # the leaves: the gap over the threshold and under the head
    # the threshold: a chamfered stainless bar across the opening, the floor springs' cover plates flush in it
    ty0, ty1, ch = ym - th["depth"] / 2, ym + th["depth"] / 2, th["chamfer"]
    sp = d["floor_spring"]
    pv = d["pivot"]
    xp = w.x1 - gap - pv["from_edge"]                                  # the right leaf's pivot axis (mirrored left)
    plates = sorted([(-(xp + sp["back"]), -(xp - sp["front"])), (xp - sp["front"], xp + sp["back"])])
    sy0, sy1 = ym - sp["width"] / 2, ym + sp["width"] / 2
    full = [(ty0, w.z0), (ty1, w.z0), (ty1 - ch, z_th), (ty0 + ch, z_th)]
    front = [(ty0, w.z0), (sy0, w.z0), (sy0, z_th), (ty0 + ch, z_th)]
    back = [(sy1, w.z0), (ty1, w.z0), (ty1 - ch, z_th), (sy1, z_th)]
    cuts = [w.x0] + [x for p in plates for x in p] + [w.x1]
    for k in range(len(cuts) - 1):
        a, b = cuts[k], cuts[k + 1]
        if b - a < 1e-6:
            continue
        if k % 2 == 0:
            extras.append(prism("x", full, a, b, STEEL))
        else:                                                          # a floor spring plate between two strips
            extras.append(prism("x", front, a, b, STEEL))
            extras.append(prism("x", back, a, b, STEEL))
            items.append(box(a, b, sy0, sy1, w.z0, z_th, sp["slot"]))
    # the leaves, hinged at the opening's jambs, meeting at x = 0
    hm = lf["meeting_gap"] / 2
    leaves = [(w.x0 + gap, -hm, "a"), (hm, w.x1 - gap, "b")]
    for xa, xb, hinge in leaves:
        leaf(xa, xb, yo, yi, za, zb, lf, hinge, items, glass)
    # pivots: pins across the gaps (to the head, to the spring plate) and patch straps on both faces at the corners
    st = pv["strap"]
    for sgn in (-1, 1):
        x_axis, x_edge = sgn * xp, sgn * (w.x1 - gap)
        items.append(rod((x_axis, ym), pv["pin_radius"], zb, w.head[0], STEEL))
        items.append(rod((x_axis, ym), pv["pin_radius"], z_th, za, STEEL))
        for z_lo, z_hi in ((zb - st[1], zb), (za, za + st[1])):
            for f0, f1 in ((yo - pv["strap_t"], yo), (yi, yi + pv["strap_t"])):
                items.append(box(x_edge, x_edge - sgn * st[0], f0, f1, z_lo, z_hi, STEEL))
    # bar pulls on the meeting stiles, both faces, each on two standoffs
    pl = d["pull"]
    zc = w.z0 + pl["centre_above_floor"]
    z_bar = (zc - pl["length"] / 2, zc + pl["length"] / 2)
    for sgn in (-1, 1):
        xc = sgn * (hm + lf["meeting_stile"] / 2)
        for face, out in ((yo, -1), (yi, 1)):
            yb = face + out * (pl["standoff_length"] + pl["radius"])
            items.append(rod((xc, yb), pl["radius"], z_bar[0], z_bar[1], STEEL, 20))
            for zs in (z_bar[0] + pl["standoff_in"], z_bar[1] - pl["standoff_in"]):
                extras.append(prism("y", circle((xc, zs), pl["standoff_radius"], 12), face,
                                    face + out * pl["standoff_length"], STEEL))
    # the astragal on the right leaf's street face over the meeting gap, a seal fin in the gap
    a = d["astragal"]
    items.append(box(-a["width"] / 2, a["width"] / 2, yo - a["thickness"], yo, za + a["inset"], zb - a["inset"], FRAME))
    items.append(box(-a["fin"] / 2, a["fin"] / 2, ym - a["fin_depth"] / 2, ym + a["fin_depth"] / 2, za, zb, SEAL))
    # the concealed closer's cover plates on both faces of the door head, screwed at their ends
    cp = d["cover_plate"]
    hb, ht = w.head
    cx0, cx1, cz0, cz1 = w.x0 + cp["inset"], w.x1 - cp["inset"], hb + cp["edge"], ht - cp["edge"]
    for face, out in ((w.y0, -1), (w.y1, 1)):
        items.append(box(cx0, cx1, face, face + out * cp["thickness"], cz0, cz1, FRAME))
        for xs in (cx0 + cp["screw_in"], cx1 - cp["screw_in"]):
            for zs in (cz0 + cp["edge"], cz1 - cp["edge"]):
                extras.append(prism("y", circle((xs, zs), cp["screw_radius"], 10), face + out * cp["thickness"],
                                    face + out * (cp["thickness"] + cp["screw_head"]), STEEL))
    report = {"opening_x": [round(w.x0, 4), round(w.x1, 4)], "leaves": [[round(xa, 4), round(xb, 4)] for xa, xb, _ in leaves],
              "leaf_z": [round(za, 4), round(zb, 4)], "pivot_x": round(xp, 4), "head": [round(hb, 4), round(ht, 4)]}
    return items, extras, glass, report


def sliders(w, d, terrace_top):
    """The loggia's automatic bi-parting sliders in Wall w's opening (plan doors.slider = d), the leaves hung on the
    terrace face (y < w.y0) in front of the fixed side panels; terrace_top = the paving's top. Returns (items, extras,
    glass, report)."""
    lf, items, extras, glass = d["leaf"], [], [], []
    yf = w.y0                                                          # the frame's terrace face
    yb_l = yf - lf["standoff"]
    yf_l = yb_l - lf["depth"]
    yl = (yf_l + yb_l) / 2
    hd = d["header"]
    hb, ht = w.head                                                    # the header's bottom = the opening's head
    za, zb = terrace_top + lf["bottom_gap"], hb - lf["gap"]
    hm = lf["meeting_gap"] / 2
    x_out = w.x1 + lf["overlap"]                                       # the leaves overlap the fixed panels' mullions
    leaves = [(-x_out, -hm), (hm, x_out)]
    for xa, xb in leaves:
        leaf(xa, xb, yf_l, yb_l, za, zb, lf, None, glass=glass, items=items)
    # the threshold in the frame's plane, flush with the paving
    items.append(box(w.x0, w.x1, w.y0, w.y1, w.z0, terrace_top, STEEL))
    # seals: brushes under the leaves (to just over the paving) and behind the outer stiles (to just off the mullion),
    # rubber at the meeting stiles
    sl = d["seals"]
    for xa, xb in leaves:
        items.append(box(xa + sl["inset"], xb - sl["inset"], yl - sl["brush_width"] / 2, yl + sl["brush_width"] / 2,
                         terrace_top + sl["clear"], za, SEAL))
        x_end = xa if xa < 0 else xb
        sgn = 1 if x_end > 0 else -1
        items.append(box(sgn * (w.x1 + sl["inset"]), x_end - sgn * sl["inset"], yb_l, yf - sl["clear"],
                         za + sl["inset"] * 4, zb - sl["inset"] * 4, SEAL))
        x_meet = xb if xa < 0 else xa
        items.append(box(x_meet, x_meet - sgn * sl["rubber"], yl - sl["rubber_depth"] / 2, yl + sl["rubber_depth"] / 2,
                         za + sl["inset"], zb - sl["inset"], SEAL))
    # flush pulls on the meeting stiles, both faces
    fp = d["pull"]
    zc = terrace_top + fp["centre_above_floor"]
    for xa, xb in leaves:
        x_meet = xb if xa < 0 else xa
        xc = x_meet + (lf["stile"] / 2 if xa > 0 else -lf["stile"] / 2)
        for face, out in ((yf_l, -1), (yb_l, 1)):
            items.append(box(xc - fp["width"] / 2, xc + fp["width"] / 2, face, face + out * fp["proud"],
                             zc - fp["height"] / 2, zc + fp["height"] / 2, STEEL))
    # the operator header: body, lips either side of the slot, the track in the slot, the hangers, end caps
    hx = w.hi - hd["end_clear"]
    yh = yf - hd["depth"]
    cap, lip, slot = hd["end_cap"], hd["lip"], hd["slot"] / 2
    items.append(box(-hx + cap, hx - cap, yh, yf, hb + lip, ht, FRAME))
    items.append(box(-hx + cap, hx - cap, yh, yl - slot, hb, hb + lip, FRAME))
    items.append(box(-hx + cap, hx - cap, yl + slot, yf, hb, hb + lip, FRAME))
    tr = hd["track"]
    items.append(box(-hx + cap, hx - cap, yl - tr[0] / 2, yl + tr[0] / 2, hb + lip - tr[1], hb + lip, STEEL))
    for sgn in (-1, 1):
        items.append(box(sgn * hx, sgn * (hx - cap), yh, yf, hb, ht, STEEL))
    hg = d["hanger"]
    for xa, xb in leaves:
        for xc in (xa + hg["in"], xb - hg["in"]):
            items.append(box(xc - hg["length"] / 2, xc + hg["length"] / 2, yl - hg["thickness"] / 2, yl + hg["thickness"] / 2,
                             zb, hb + lip - tr[1], FRAME))
    # motion sensors: on the header's terrace face and on the door head's room face, a dark lens on each
    sn = d["sensor"]
    sx, sd, sh = sn["width"] / 2, sn["depth"], sn["height"]
    zs0 = hb + sn["above_bottom"]
    for face, out in ((yh, -1), (w.y1, 1)):
        items.append(box(-sx, sx, face, face + out * sd, zs0, zs0 + sh, FRAME))
        lx, lz = sn["lens"]
        zl = zs0 + (sh - lz) / 2
        items.append(box(-lx / 2, lx / 2, face + out * sd, face + out * (sd + sn["lens_proud"]), zl, zl + lz, LENS))
    # floor guides on the paving past the leaves' outer ends (the leaves' bottom groove rides over the fin)
    gd = d["guide"]
    for sgn in (-1, 1):
        x0 = sgn * (x_out + gd["from_leaf"])
        x1 = x0 + sgn * gd["base"][0]
        items.append(box(x0, x1, yl - gd["base"][1] / 2, yl + gd["base"][1] / 2, terrace_top, terrace_top + gd["base"][2], FRAME))
        fi = gd["fin_in"]
        items.append(box(x0 + sgn * fi, x1 - sgn * fi, yl - gd["fin"][0] / 2, yl + gd["fin"][0] / 2,
                         terrace_top + gd["base"][2], terrace_top + gd["base"][2] + gd["fin"][1], FRAME))
    report = {"opening_x": [round(w.x0, 4), round(w.x1, 4)], "leaves": [[round(a, 4), round(b, 4)] for a, b in leaves],
              "leaf_y": [round(yf_l, 4), round(yb_l, 4)], "leaf_z": [round(za, 4), round(zb, 4)],
              "header": {"x": [round(-hx, 4), round(hx, 4)], "y": [round(yh, 4), round(yf, 4)], "z": [round(hb, 4), round(ht, 4)]}}
    return items, extras, glass, report
