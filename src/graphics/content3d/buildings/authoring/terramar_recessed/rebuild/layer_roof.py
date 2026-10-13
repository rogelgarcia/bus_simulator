# layer_roof.py -- AI 647: the roof layer of the Terra & Mar rebuild, from plan["roof"].
#
# Run through build.py (layers=roof; needs the structure). Builds RB_ROOF under TERRAMAR_REBUILD. The roof slab edge
# itself (deep, rounded, 0.68 m) is the structure's; this layer adds:
#   rb_roof_guard          the frameless glass guard all round on the roof guard line (two mitred halves meeting at
#                          the front and rear centres; shoe and rail TM_RB_frame, glass panels <= 1.6 m)
#   rb_roof_paving         the flat terrace deck (TM_RB_paving, 50 mm; the drainage falls stay in the slab below), its
#                          walking surface a face set of its own (TM_RB_roof_paving: the materials pass lays the tiles, AI 630),
#                          from the guard shoe to the penthouse walls
#   rb_penthouse_walls     pale stone walls (TM_RB_penthouse_stone) with a parapet, broken by the aerial's openings
#   rb_penthouse_roof      its roof slab over the core, and the parapet cap
#   rb_penthouse_frames / _glass / _doors   black frames, glass, the wood door leaves
#   rb_annex_*             the glazed annex on the penthouse's -X side: posts, beams, louvred roof, glazing
#   rb_solar_panels / rb_solar_rails        tilted panel rows on edge rails, clear of the units
#   rb_roof_units          the mechanical units
# Every object above the roof carries rb_hide_from_b8: check_layers.py renders them red from CAM_B8 and counts them
# (they stay under the sightline over the roof edge; plan["roof"]["sightline"] has the margins).
import importlib
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import rb_lib as L  # noqa: E402

importlib.reload(L)

COLLECTION = "RB_ROOF"
LAYER = "roof"


def tags(element, name, hide):
    t = {"rb_layer": LAYER, "rb_element": element, "tm_element": COLLECTION, "tm_role": element, "rb_name": name}
    if hide:
        t["rb_hide_from_b8"] = 1
    return t


def rect(x0, x1, y0, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


class Wall:
    """A straight penthouse wall: positions s along its axis ('x' or 'y'), the other axis spanning its thickness."""

    def __init__(self, axis, span, thick):
        self.axis, self.span, self.thick = axis, span, thick

    def box(self, s0, s1, t0=None, t1=None):
        t0 = self.thick[0] if t0 is None else t0
        t1 = self.thick[1] if t1 is None else t1
        return rect(s0, s1, t0, t1) if self.axis == "x" else rect(t0, t1, s0, s1)

    @property
    def mid(self):
        return (self.thick[0] + self.thick[1]) / 2


def build(plan):
    coll = L.layer_collection(COLLECTION)
    rf, g = plan["roof"], plan["balconies"]
    top = rf["roof_top"]
    walk = top + rf["paving"]
    groof = {**g, "paving": rf["paving"]}                         # the guard stands 1.0 m above the deck
    made = []

    guard = []
    for half in rf["guard_halves"]:
        L.guard_along(half, top, groof, guard)
    made.append(L.pieces("rb_roof_guard", coll, guard, tags("guard", "roof_guard", False)))

    px, py = rf["penthouse_rect"]["x"], rf["penthouse_rect"]["y"]
    deck = L.solid("rb_roof_paving", coll, [(top, walk)],
                   [(rf["terrace_outer"], "TM_RB_paving"), (rect(px[0], px[1], py[0], py[1]), "TM_RB_paving")],
                   [([rf["terrace_outer"], rect(px[0], px[1], py[0], py[1])], "TM_RB_roof_paving", "TM_RB_hidden")],
                   tags("paving", "roof_paving", False))
    made.append(deck)

    # penthouse walls with the openings, roof slab and cap
    ph = rf["penthouse"]
    w, z_top = ph["wall"], top + ph["parapet_top"]
    walls = {"front": Wall("x", (px[0], px[1]), (py[0], py[0] + w)), "rear": Wall("x", (px[0], px[1]), (py[1] - w, py[1])),
             "left": Wall("y", (py[0] + w, py[1] - w), (px[0], px[0] + w)), "right": Wall("y", (py[0] + w, py[1] - w), (px[1] - w, px[1]))}
    stone, frames, glass, doors = [], [], [], []
    fm, fdp = ph["frame"]["member"], ph["frame"]["depth"] / 2
    gd = plan["envelope"]["glass"] / 2
    for name, wall in walls.items():
        ops = sorted((o for o in ph["openings"] if o["wall"] == name), key=lambda o: o["s"][0])
        s = wall.span[0]
        for o in ops:
            s0, s1 = o["s"]
            z0, z1 = top + o["z"][0], top + o["z"][1]
            if s0 > s:
                stone.append(L.piece(wall.box(s, s0), [(top, z_top)], "TM_RB_penthouse_stone", mat_bottom="TM_RB_hidden"))
            stone.append(L.piece(wall.box(s0, s1), [(z1, z_top)] + ([(top, z0)] if z0 > top else []),
                                 "TM_RB_penthouse_stone", mat_bottom="TM_RB_hidden"))
            fbox = lambda a, b, wall=wall: wall.box(a, b, wall.mid - fdp, wall.mid + fdp)  # noqa: E731
            gbox = lambda a, b, wall=wall: wall.box(a, b, wall.mid - gd, wall.mid + gd)  # noqa: E731
            if o["kind"] == "door":
                frames.append(L.piece(fbox(s0, s0 + fm), [(z0, z1)], "TM_RB_frame"))
                frames.append(L.piece(fbox(s1 - fm, s1), [(z0, z1)], "TM_RB_frame"))
                frames.append(L.piece(fbox(s0 + fm, s1 - fm), [(z1 - fm, z1)], "TM_RB_frame"))
                doors.append(L.piece(wall.box(s0 + fm, s1 - fm, wall.mid - 0.025, wall.mid + 0.025), [(z0, z1 - fm)], "TM_RB_wood"))
            else:
                n = 2 if o["kind"] == "slider" else 1
                L.glass_frame(L.equal_spans(s0, s1, n, fm), s0, s1, z0, z1, fm, fm, fm, None, fbox, gbox, frames, glass)
            s = s1
        if wall.span[1] > s:
            stone.append(L.piece(wall.box(s, wall.span[1]), [(top, z_top)], "TM_RB_penthouse_stone", mat_bottom="TM_RB_hidden"))
    made.append(L.pieces("rb_penthouse_walls", coll, stone, tags("penthouse", "penthouse_walls", True)))
    made.append(L.pieces("rb_penthouse_frames", coll, frames, tags("penthouse_frame", "penthouse_frames", True)))
    made.append(L.pieces("rb_penthouse_glass", coll, glass, tags("penthouse_glass", "penthouse_glass", True)))
    made.append(L.pieces("rb_penthouse_doors", coll, doors, tags("penthouse_door", "penthouse_doors", True)))
    z_slab = (top + ph["roof_slab"][0], top + ph["roof_slab"][1])
    ov, ch = ph["cap"]["overhang"], ph["cap"]["height"]
    cap_out = rect(px[0] - ov, px[1] + ov, py[0] - ov, py[1] + ov)               # the cap overhangs both wall faces
    cap_in = rect(px[0] + w + ov, px[1] - w - ov, py[0] + w + ov, py[1] - w - ov)
    roof_items = [L.piece(rect(px[0] + w, px[1] - w, py[0] + w, py[1] - w), [z_slab], "TM_RB_roof_top", mat_bottom="TM_RB_ceiling"),
                  ([(z_top, z_top + ch)], [(cap_out, "TM_RB_penthouse_stone"), (cap_in, "TM_RB_penthouse_stone")],
                   [([cap_out, cap_in], "TM_RB_penthouse_stone", "TM_RB_penthouse_stone")])]
    made.append(L.pieces("rb_penthouse_roof", coll, roof_items, tags("penthouse", "penthouse_roof", True)))

    # the annex: posts, beams, louvred roof, glazing on its three open sides
    an = rf["annex"]
    ax, ay, p = an["x"], an["y"], an["post"]
    z_beam0 = walk + an["height"]
    z_beam1 = z_beam0 + an["beam"]
    posts = [L.piece(rect(x0, x0 + p, y0, y0 + p), [(walk, z_beam1)], "TM_RB_frame")
             for x0 in (ax[0], ax[1] - p) for y0 in (ay[0], ay[1] - p)]
    beams = [L.piece(rect(ax[0] + p, ax[1] - p, ay[0], ay[0] + p), [(z_beam0, z_beam1)], "TM_RB_frame"),
             L.piece(rect(ax[0] + p, ax[1] - p, ay[1] - p, ay[1]), [(z_beam0, z_beam1)], "TM_RB_frame"),
             L.piece(rect(ax[0], ax[0] + p, ay[0] + p, ay[1] - p), [(z_beam0, z_beam1)], "TM_RB_frame"),
             L.piece(rect(ax[1] - p, ax[1], ay[0] + p, ay[1] - p), [(z_beam0, z_beam1)], "TM_RB_frame")]
    lv = an["louvre"]
    blades, y = [], ay[0] + p + lv["spacing"] / 2
    zb = z_beam1 - 0.06
    while y + lv["width"] / 2 <= ay[1] - p - 0.02:
        blades.append(L.piece(rect(ax[0] + p, ax[1] - p, y - lv["width"] / 2, y + lv["width"] / 2), [(zb - lv["thickness"], zb)], "TM_RB_louvre"))
        y += lv["spacing"]
    made.append(L.pieces("rb_annex_frame", coll, posts + beams, tags("annex", "annex_frame", True)))
    made.append(L.pieces("rb_annex_louvres", coll, blades, tags("annex", "annex_louvres", True)))
    afr, agl = [], []
    for axis, lo, hi, mid in (("x", ax[0] + p, ax[1] - p, ay[0] + p / 2), ("x", ax[0] + p, ax[1] - p, ay[1] - p / 2),
                              ("y", ay[0] + p, ay[1] - p, ax[0] + p / 2)):
        if axis == "x":
            fbox = lambda a, b, mid=mid: rect(a, b, mid - fdp, mid + fdp)  # noqa: E731
            gbox = lambda a, b, mid=mid: rect(a, b, mid - gd, mid + gd)  # noqa: E731
        else:
            fbox = lambda a, b, mid=mid: rect(mid - fdp, mid + fdp, a, b)  # noqa: E731
            gbox = lambda a, b, mid=mid: rect(mid - gd, mid + gd, a, b)  # noqa: E731
        n = max(1, round((hi - lo) / an["pane"]))
        L.glass_frame(L.equal_spans(lo, hi, n, fm), lo, hi, walk, z_beam0, fm, fm, fm, None, fbox, gbox, afr, agl)
    made.append(L.pieces("rb_annex_frames", coll, afr, tags("annex_frame", "annex_frames", True)))
    made.append(L.pieces("rb_annex_glass", coll, agl, tags("annex_glass", "annex_glass", True)))

    # solar rows on edge rails, and the mechanical units, on the penthouse roof slab
    so = rf["solar"]
    tilt = math.radians(so["tilt_deg"])
    z_roof = z_slab[1]
    zb0 = z_roof + so["clearance"]
    hexas, rails = [], []
    for row in rf["solar_rows"]:
        x0, x1 = row["x"]
        y0, y1 = row["y"]
        zb1 = zb0 + (y1 - y0) * math.tan(tilt)
        dy, dz = -so["thickness"] * math.sin(tilt), so["thickness"] * math.cos(tilt)
        n = max(1, round((x1 - x0 + so["module_gap"]) / (so["module"] + so["module_gap"])))
        mw = (x1 - x0 - (n - 1) * so["module_gap"]) / n
        for k in range(n):
            a = x0 + k * (mw + so["module_gap"])
            b = a + mw
            bottom = [(a, y0, zb0), (b, y0, zb0), (b, y1, zb1), (a, y1, zb1)]
            hexas.append(bottom + [(qx, qy + dy, qz + dz) for qx, qy, qz in bottom])
        rw = so["rail"]
        rails.append(L.piece(rect(x0, x1, y0, y0 + rw), [(z_roof, zb0)], "TM_RB_frame"))
        rails.append(L.piece(rect(x0, x1, y1 - rw, y1), [(z_roof, zb1 - rw * math.tan(tilt))], "TM_RB_frame"))
    made.append(L.boxes("rb_solar_panels", coll, hexas, "TM_RB_solar", tags("solar", "solar_panels", True)))
    made.append(L.pieces("rb_solar_rails", coll, rails, tags("solar", "solar_rails", True)))
    units = [L.piece(rect(u["x"][0], u["x"][1], u["y"][0], u["y"][1]), [(z_roof, z_roof + u["h"])], "TM_RB_unit", mat_bottom="TM_RB_hidden")
             for u in rf["units"]]
    made.append(L.pieces("rb_roof_units", coll, units, tags("unit", "roof_units", True)))
    return {"collection": COLLECTION, "objects": len(made), "faces": sum(len(o.data.polygons) for o in made),
            "solar_modules": len(hexas), "louvres": len(blades), "names": [o.name for o in made]}
