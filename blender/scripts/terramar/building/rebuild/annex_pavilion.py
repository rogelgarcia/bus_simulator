# annex_pavilion.py -- user fix 20 (2026-10-16): the glazed annex's sliding door and rain roof, for layer_roof.py.
#
# The user, on the black-framed glass pavilion on the roof terrace (images/25.webp): "create a door there" (the long -x
# glass side's bay by the stools) and "the ceiling is open, we need another metal plate inclined to cover from rain ...
# flat -> inclined will form a gap. that can be filled with glass". Plan values: roof.annex.door and roof.annex.rain_roof
# (make_plan.py ROOF; roof() adds the door's pane spans and the roof's rise). Pieces go into the caller's item lists
# (rb_lib solids) and extras (callables (bm, slots) -> None, entrance_doors.prism); layer_roof.py makes the objects:
#   door_wall()     the long (-x) glass side: end jambs, head rail, mullions and panes as rb_lib.glass_frame, with the
#                   door's pane open: the sill stops at it and a low stainless threshold lies in the frame's plane there
#   sliding_door()  (rb_annex_door, rb_annex_door_glass) one framed glass leaf hung on the terrace face, overlapping the
#                   mullions, sliding toward -y past the fixed pane beside it (fix 16's loggia sliders, manual): the header
#                   (the rail) under the beam with a slot, the track and the leaf's hangers in it, stainless end caps;
#                   a floor guide past the closed leaf's end; brush seals under the leaf and behind its end stiles; a bar
#                   pull on standoffs on the terrace face and a flush pull on the room face at the leaf's closing edge
#   rain_roof()     the single-pitch roof over the louvred frame, falling from the penthouse wall to the -x side: a
#                   sloped eaves bearer on the -x beam, gable rafters over the front and rear beams, purlins and a wall
#                   ledger (frame steel, rb_annex_frame); the standing-seam sheet with its seams, verge trims, a flashing up
#                   the wall over the high edge, a box gutter under the low edge and a downpipe on the rear post with its
#                   spout and brackets (TM_RB_roof_metal, rb_annex_roof); the gables' gaps between the beams and the
#                   rafters glazed in thin black frames, split over the walls' mullions: a triangle at the low end, a
#                   trapezoid at the high end (rb_annex_frames, rb_annex_glass)
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

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import entrance_doors as ED  # noqa: E402  (box, rod, circle, prism)
import rb_lib as L  # noqa: E402

FRAME, GLASS, STEEL, SEAL = "TM_RB_frame", "TM_RB_glass", "TM_RB_stainless", "TM_RB_seal"
METAL = "TM_RB_roof_metal"


def door_wall(an, walk, z_head, fm, fdp, gd, frames, glass):
    """The long (-x) glass side between its posts, its door pane open (an["door"]["span"]): rb_lib.glass_frame's members
    with the sill split at the opening and a threshold there (returned as an item for the door's object)."""
    dr, p = an["door"], an["post"]
    if dr["side"] != "x0":
        raise SystemExit("annex door: only the long -x side is supported")
    mid = an["x"][0] + p / 2
    fbox = lambda a, b: L.rect(mid - fdp, mid + fdp, a, b)  # noqa: E731
    gbox = lambda a, b: L.rect(mid - gd, mid + gd, a, b)  # noqa: E731
    lo, hi = an["y"][0] + p, an["y"][1] - p
    s0, s1 = dr["span"]
    frames.append(L.piece(fbox(lo, lo + fm), [(walk, z_head)], FRAME))
    frames.append(L.piece(fbox(hi - fm, hi), [(walk, z_head)], FRAME))
    frames.append(L.piece(fbox(lo + fm, hi - fm), [(z_head - fm, z_head)], FRAME))
    frames.append(L.piece(fbox(lo + fm, s0), [(walk, walk + fm)], FRAME))                # the sill stops at the opening
    frames.append(L.piece(fbox(s1, hi - fm), [(walk, walk + fm)], FRAME))
    prev = lo + fm
    for a, b in dr["panes"]:
        if a - prev > 1e-6:
            frames.append(L.piece(fbox(prev, a), [(walk + fm, z_head - fm)], FRAME))
        if [a, b] != [s0, s1]:
            glass.append(L.piece(gbox(a, b), [(walk + fm, z_head - fm)], GLASS))
        prev = b
    if hi - fm - prev > 1e-6:
        frames.append(L.piece(fbox(prev, hi - fm), [(walk + fm, z_head - fm)], FRAME))
    return ED.box(mid - fdp, mid + fdp, s0, s1, walk, walk + dr["threshold"], STEEL)


def sliding_door(an, walk, z_head, fm, fdp):
    """The door's leaf and hardware on the terrace face of the long glass side (x < the frame's face). Returns (items,
    extras, glass, report)."""
    dr, p = an["door"], an["post"]
    lf, hd, sl = dr["leaf"], dr["header"], dr["seals"]
    items, extras, glass = [], [], []
    xf = an["x"][0] + p / 2 - fdp                                      # the frame's terrace face
    xb = xf - lf["standoff"]                                           # the leaf's room face ...
    xo = xb - lf["depth"]                                              # ... and terrace face
    xl = (xo + xb) / 2
    s0, s1 = dr["span"]
    ya, yb = s0 - lf["overlap"], s1 + lf["overlap"]                    # the closed leaf over both mullions
    hb, ht = z_head - hd["height"], z_head                             # the header, its top under the beam
    za, zb = walk + lf["bottom_gap"], hb - lf["gap"]
    # the leaf: stiles, rails, the glass centred in its channel
    st, tr, br = lf["stile"], lf["top_rail"], lf["bottom_rail"]
    items += [ED.box(xo, xb, ya, ya + st, za, zb, FRAME), ED.box(xo, xb, yb - st, yb, za, zb, FRAME),
              ED.box(xo, xb, ya + st, yb - st, zb - tr, zb, FRAME), ED.box(xo, xb, ya + st, yb - st, za, za + br, FRAME)]
    g = lf["glass"] / 2
    glass.append(ED.box(xl - g, xl + g, ya + st, yb - st, za + br, zb - tr, GLASS))
    # the header over the door and the pane it slides past: body, lips either side of the slot, the track, end caps
    so = dr["slide_over"]
    y0h, y1h = (so[0] - fm, s1 + fm) if dr["slide"] < 0 else (s0 - fm, so[1] + fm)
    cap, lip, slot = hd["end_cap"], hd["lip"], hd["slot"] / 2
    xh = xf - hd["depth"]
    items.append(ED.box(xh, xf, y0h + cap, y1h - cap, hb + lip, ht, FRAME))
    items.append(ED.box(xh, xl - slot, y0h + cap, y1h - cap, hb, hb + lip, FRAME))
    items.append(ED.box(xl + slot, xf, y0h + cap, y1h - cap, hb, hb + lip, FRAME))
    tk = hd["track"]
    items.append(ED.box(xl - tk[0] / 2, xl + tk[0] / 2, y0h + cap, y1h - cap, hb + lip - tk[1], hb + lip, STEEL))
    items += [ED.box(xh, xf, y0h, y0h + cap, hb, ht, STEEL), ED.box(xh, xf, y1h - cap, y1h, hb, ht, STEEL)]
    hg = dr["hanger"]
    for yc in (ya + hg["in"], yb - hg["in"]):
        items.append(ED.box(xl - hg["thickness"] / 2, xl + hg["thickness"] / 2, yc - hg["length"] / 2, yc + hg["length"] / 2,
                            zb, hb + lip - tk[1], FRAME))
    # seals: a brush under the leaf (to just over the paving), brushes behind the end stiles (to just off the frame)
    bw, ins = sl["brush_width"], sl["inset"]
    items.append(ED.box(xl - bw / 2, xl + bw / 2, ya + ins, yb - ins, walk + sl["clear"], za, SEAL))
    for y_lo, y_hi in ((ya + ins, s0 - ins), (s1 + ins, yb - ins)):
        items.append(ED.box(xb, xf - sl["clear"], y_lo, y_hi, za + 4 * ins, zb - 4 * ins, SEAL))
    # pulls at the closing edge (the stile away from the slide): a bar on standoffs outside, a flush pull inside
    yc = (yb - st / 2) if dr["slide"] < 0 else (ya + st / 2)
    bp = dr["bar_pull"]
    zc = walk + bp["centre_above_floor"]
    z_bar = (zc - bp["length"] / 2, zc + bp["length"] / 2)
    items.append(ED.rod((xo - bp["standoff_length"] - bp["radius"], yc), bp["radius"], z_bar[0], z_bar[1], STEEL, 20))
    for zs in (z_bar[0] + bp["standoff_in"], z_bar[1] - bp["standoff_in"]):
        extras.append(ED.prism("x", ED.circle((yc, zs), bp["standoff_radius"], 12), xo - bp["standoff_length"], xo, STEEL))
    fp = dr["flush_pull"]
    zf = walk + fp["centre_above_floor"]
    items.append(ED.box(xb, xb + fp["proud"], yc - fp["width"] / 2, yc + fp["width"] / 2, zf - fp["height"] / 2,
                        zf + fp["height"] / 2, STEEL))
    # the floor guide on the paving past the closed leaf's sliding end (the leaf's bottom groove rides over its fin)
    gd = dr["guide"]
    sgn = -1 if dr["slide"] < 0 else 1
    g0 = (ya if sgn < 0 else yb) + sgn * gd["from_leaf"]
    g1 = g0 + sgn * gd["base"][0]
    items.append(ED.box(xl - gd["base"][1] / 2, xl + gd["base"][1] / 2, g0, g1, walk, walk + gd["base"][2], FRAME))
    items.append(ED.box(xl - gd["fin"][0] / 2, xl + gd["fin"][0] / 2, g0 + sgn * gd["fin_in"], g1 - sgn * gd["fin_in"],
                        walk + gd["base"][2], walk + gd["base"][2] + gd["fin"][1], FRAME))
    report = {"type": "sliding (manual, leaf hung on the terrace face)", "opening_y": [round(s0, 4), round(s1, 4)],
              "leaf_y": [round(ya, 4), round(yb, 4)], "leaf_x": [round(xo, 4), round(xb, 4)],
              "leaf_z": [round(za, 4), round(zb, 4)], "slides_past": so,
              "header": {"y": [round(y0h, 4), round(y1h, 4)], "x": [round(xh, 4), round(xf, 4)], "z": [round(hb, 4), round(ht, 4)]}}
    return items, extras, glass, report


def rain_roof(an, walk, z_frame_top, fm, fdp, gd, wall_mullions):
    """The rain roof (an["rain_roof"]) over the frame whose beams' top is z_frame_top. wall_mullions: the front / rear
    glazing's mullion x spans (the gables' glass divides over them). Returns (structure extras, gable frame extras,
    gable glass extras, metal extras, downpipe items, report)."""
    rr, p = an["rain_roof"], an["post"]
    (xl, xr), (ya, yb) = an["x"], an["y"]
    tan = math.tan(math.radians(rr["pitch_deg"]))
    zt, h0 = z_frame_top, rr["eaves_rise"]
    u = lambda x: zt + h0 + (x - xl) * tan  # noqa: E731     (the sheet's underside: low at the -x side)
    ts = rr["sheet"]
    t = lambda x: u(x) + ts  # noqa: E731
    sx, gfx, ggx, mx = [], [], [], []
    P = ED.prism
    # structure: the sloped eaves bearer on the -x beam, gable rafters over the front and rear beams, purlins, the ledger
    rd = rr["rafter"]
    sx.append(P("y", [(xl, zt), (xl + p, zt), (xl + p, u(xl + p)), (xl, u(xl))], ya, yb, FRAME))
    rafter = [(xl + p, u(xl + p) - rd), (xr, u(xr) - rd), (xr, u(xr)), (xl + p, u(xl + p))]
    sx += [P("y", rafter, ya, ya + p, FRAME), P("y", rafter, yb - p, yb, FRAME)]
    lw, ld = rr["ledger"]
    sx.append(P("y", [(xr - lw, u(xr - lw) - ld), (xr, u(xr) - ld), (xr, u(xr)), (xr - lw, u(xr - lw))], ya + p, yb - p, FRAME))
    pw, pd = rr["purlin"]
    n = rr["purlins"]
    purlin_x = [xl + p + (xr - lw - xl - p) * k / (n + 1) for k in range(1, n + 1)]
    for xc in purlin_x:
        a, b = xc - pw / 2, xc + pw / 2
        sx.append(P("y", [(a, u(a) - pd), (b, u(b) - pd), (b, u(b)), (a, u(a))], ya + p, yb - p, FRAME))
    # the gables: frames (sill on the beam, sloped head under the rafter, a post at the wall, mullions over the walls')
    fg = rr["gable_frame"]
    fgv = fg / math.cos(math.radians(rr["pitch_deg"]))
    L1 = lambda x: u(x) - rd  # noqa: E731              (the rafter's underside)
    L2 = lambda x: L1(x) - fgv  # noqa: E731            (the glass's top edge)
    z_sill = zt + fg
    x_tip = xl + (z_sill - L2(xl)) / tan                                # the glass triangle's tip
    if x_tip < xl + p or L2(xl + p) < zt:
        raise SystemExit(f"annex rain roof: the gable glass's tip {x_tip:.3f} falls inside the eaves bearer")
    xe = xr - fg
    mulls = sorted((a, b) for a, b in wall_mullions if x_tip < a and b < xe)
    gable_glass_shapes = []
    for ym in (ya + p / 2, yb - p / 2):
        f0, f1 = ym - fdp, ym + fdp
        sill_top = [(xe, z_sill)] + [q for a, b in reversed(mulls) for q in ((b, z_sill), (a, z_sill))] + [(x_tip, z_sill)]
        gfx.append(P("y", [(xl + p, zt), (xe, zt)] + sill_top + [(xl + p, L2(xl + p))], f0, f1, FRAME))
        head_bottom = [(xl + p, L2(xl + p)), (x_tip, z_sill)] + [q for a, b in mulls for q in ((a, L2(a)), (b, L2(b)))]
        gfx.append(P("y", head_bottom + [(xe, L2(xe)), (xe, L1(xe)), (xl + p, L1(xl + p))], f0, f1, FRAME))
        gfx.append(P("y", [(xe, zt), (xr, zt), (xr, L1(xr)), (xe, L1(xe)), (xe, L2(xe)), (xe, z_sill)], f0, f1, FRAME))
        for a, b in mulls:
            gfx.append(P("y", [(a, z_sill), (b, z_sill), (b, L2(b)), (a, L2(a))], f0, f1, FRAME))
        edges = [x_tip] + [q for a, b in mulls for q in (a, b)] + [xe]
        for k in range(0, len(edges), 2):
            a, b = edges[k], edges[k + 1]
            shape = [(a, z_sill), (b, z_sill), (b, L2(b))] + ([] if k == 0 else [(a, L2(a))])   # the first: a triangle
            ggx.append(P("y", shape, ym - gd, ym + gd, GLASS))
            gable_glass_shapes.append(len(shape))
    # the sheet, its standing seams, the verge trims, the flashing up the wall
    xe_s = xl - rr["eaves_over"]
    vo = rr["verge_over"]
    y0s, y1s = ya - vo, yb + vo
    mx.append(P("y", [(xe_s, u(xe_s)), (xr, u(xr)), (xr, t(xr)), (xe_s, t(xe_s))], y0s, y1s, METAL))
    fl = rr["flashing"]
    x_fl = xr - fl["over"]
    sm = rr["seam"]
    panels = max(1, round((y1s - y0s) / sm["pitch"]))
    seams = [y0s + (y1s - y0s) * k / panels for k in range(1, panels)]
    for yc in seams:
        mx.append(P("y", [(xe_s, t(xe_s)), (x_fl, t(x_fl)), (x_fl, t(x_fl) + sm["height"]), (xe_s, t(xe_s) + sm["height"])],
                    yc - sm["width"] / 2, yc + sm["width"] / 2, METAL))
    vg = rr["verge"]
    verge = [(xe_s, u(xe_s) - vg["down"]), (xr, u(xr) - vg["down"]), (xr, t(xr) + vg["up"]), (xe_s, t(xe_s) + vg["up"])]
    mx += [P("y", verge, y0s - vg["width"], y0s, METAL), P("y", verge, y1s, y1s + vg["width"], METAL)]
    ft = fl["thickness"]
    mx.append(P("y", [(xr - ft, t(xr)), (xr, t(xr)), (xr, t(xr) + fl["up"]), (xr - ft, t(xr) + fl["up"])], y0s, y1s, METAL))
    mx.append(P("y", [(x_fl, t(x_fl)), (xr - ft, t(xr - ft)), (xr - ft, t(xr - ft) + ft), (x_fl, t(x_fl) + ft)], y0s, y1s, METAL))
    # the box gutter under the low edge against the bearer's and beam's outer face, its ends capped
    gt = rr["gutter"]
    xg1, xg0 = xl, xl - gt["width"]
    zg1 = u(xe_s) - gt["below_sheet"]
    zg0 = zg1 - gt["height"]
    w = gt["wall"]
    u_section = [(xg0, zg0), (xg1, zg0), (xg1, zg1), (xg1 - w, zg1), (xg1 - w, zg0 + w), (xg0 + w, zg0 + w), (xg0 + w, zg1),
                 (xg0, zg1)]
    mx.append(P("y", u_section, y0s, y1s, METAL))
    # the downpipe on the rear post: from the gutter's bottom down to a spout over the paving, two brackets to the post
    dp = rr["downpipe"]
    r = dp["radius"]
    xc, yc = (xg0 + xg1) / 2, yb - p / 2
    z_foot = walk + dp["foot"]
    pipe = [ED.rod((xc, yc), r, z_foot, zg0, METAL, 20),
            ED.box(xc - r - dp["spout"], xc + r, yc - 0.8 * r, yc + 0.8 * r, z_foot - 2 * r, z_foot, METAL)]
    bh, bt = dp["bracket"]
    for zb_ in dp["brackets"]:
        pipe.append(ED.box(xc, xl, yc - bt / 2, yc + bt / 2, walk + zb_, walk + zb_ + bh, METAL))
    report = {"pitch_deg": rr["pitch_deg"], "falls_to": "-x (away from the penthouse wall)",
              "underside_z": [round(u(xl), 4), round(u(xr), 4)], "top_z_at_wall": round(t(xr) + fl["up"], 4),
              "sheet": {"x": [round(xe_s, 4), xr], "y": [round(y0s, 4), round(y1s, 4)]}, "seams": len(seams),
              "purlin_x": [round(x, 4) for x in purlin_x], "gutter_z": [round(zg0, 4), round(zg1, 4)],
              "gable_glass": {"tip_x": round(x_tip, 4), "panes_per_gable": len(gable_glass_shapes) // 2,
                              "corners": gable_glass_shapes[: len(gable_glass_shapes) // 2],
                              "height_at_wall": round(L2(xe) - z_sill, 4)},
              "downpipe": [round(xc, 4), round(yc, 4)]}
    return sx, gfx, ggx, mx, pipe, report
