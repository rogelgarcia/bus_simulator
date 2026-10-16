# layer_envelope.py -- AI 644: the envelope layer of the Terra & Mar rebuild, from plan["envelope"].
#
# Run through build.py (layers=envelope; needs the structure). Builds RB_ENVELOPE under its part root, per storey
# (floors 1-5, the storeys above the podium roof):
#   rb_frames_f<n>  black frames (TM_RB_frame): the rounded corner posts on the wall line's fillets, the full-height
#                   jambs against the pilasters and the rounded chamfer columns (shaped to the column's arc), head and
#                   sill rails, mullions, and a transom across every pane 0.4 m below the head
#   rb_glass_f<n>   glass (TM_RB_glass): a lower light (the slider) and an upper light (above the transom) per pane
#   rb_wood_f<n>    the front centre bay's warm wood reveal panels (TM_RB_wood), floors 1-4; where a panel meets a
#                   pilaster's stone side it stops short by a shadow gap (2026-10-14, plan["returns"]), floored by a
#                   dark backer strip (TM_RB_stone_joint) gap_depth behind the panel's face
#   rb_wall_f<n>    (user fix 7, 2026-10-15) the front chamfers' solid wall panels (env["wall_slot"], the chamfer columns'
#                   stone; the materials pass cuts its course joints): slab to slab, as deep as the frames, in place of
#                   the end pane beside each chamfer column and at the chamfer's far end; against a column the panel
#                   follows the column's arc (the layout's 3 mm gap is the joint), elsewhere it meets the mullion or
#                   the corner post face to face
# Frames and glass sit on the tower wall line (frame depth 0.12, glass 0.024, centred). Pieces meet face to face:
# sills on the slab tops, heads under the slab undersides, jambs against pilasters and columns, glass between frame
# members. The sliding panes are listed per bay in plan["envelope"] (doors) for the balconies layer.
import importlib
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import envelope_layout  # noqa: E402
import layer_materials as M  # noqa: E402
import rb_lib as L  # noqa: E402

importlib.reload(L)
importlib.reload(envelope_layout)

COLLECTION = "RB_ENVELOPE"
LAYER = "envelope"


def tags(element, name, floor):
    return {"rb_layer": LAYER, "rb_element": element, "tm_element": COLLECTION, "tm_role": element, "rb_name": name,
            "rb_floor": floor}


def gaps(lo, hi, spans):
    """The stretches of [lo, hi] not covered by the sorted spans (the frame members between panes)."""
    out, s = [], lo
    for a, b in sorted(spans):
        if a - s > 1e-6:
            out.append((s, a))
        s = max(s, b)
    if hi - s > 1e-6:
        out.append((s, hi))
    return out


def corner_post(c, radius, d, ext, n=12):     # n = plan_options.fillet's, so the paving meets it exactly
    """Footprint of the rounded corner post on a wall-line fillet (frame depth 2d), reaching ext onto both runs."""
    p, a_in, a_out = c["sharp"], c["in"], c["out"]
    t = radius * math.tan(math.radians(22.5))
    t1 = (p[0] - a_in[0] * t, p[1] - a_in[1] * t)
    t2 = (p[0] + a_out[0] * t, p[1] + a_out[1] * t)
    n_in, n_out = (a_in[1], -a_in[0]), (a_out[1], -a_out[0])           # outward normals (CCW wall line)
    centre = (t1[0] - n_in[0] * radius, t1[1] - n_in[1] * radius)
    th1 = math.atan2(t1[1] - centre[1], t1[0] - centre[0])
    th2 = math.atan2(t2[1] - centre[1], t2[0] - centre[0])
    if th2 < th1:
        th2 += 2 * math.pi
    arc = lambda r: [(centre[0] + r * math.cos(th1 + (th2 - th1) * k / n), centre[1] + r * math.sin(th1 + (th2 - th1) * k / n))  # noqa: E731
                     for k in range(n + 1)]
    outer = [(t1[0] - a_in[0] * ext + n_in[0] * d, t1[1] - a_in[1] * ext + n_in[1] * d)] + arc(radius + d) + \
            [(t2[0] + a_out[0] * ext + n_out[0] * d, t2[1] + a_out[1] * ext + n_out[1] * d)]
    inner = [(t2[0] + a_out[0] * ext - n_out[0] * d, t2[1] + a_out[1] * ext - n_out[1] * d)] + list(reversed(arc(radius - d))) + \
            [(t1[0] - a_in[0] * ext - n_in[0] * d, t1[1] - a_in[1] * ext - n_in[1] * d)]
    return outer + inner


def column_jamb(at_end, length, member, d, col, samples=6):
    """Jamb footprint (bay coordinates s, v) hugging a rounded column at the bay's end (or start): straight on the
    pane side, following the column's arc (pushed out by the layout's gap) on the column side."""
    u_back = envelope_layout.column_surface_u(col, -d)
    vs = [-d + 2 * d * k / samples for k in range(samples + 1)]
    if at_end:
        face = [(length + (u_back - envelope_layout.column_surface_u(col, v)), v) for v in vs]
        return [(length - member, -d)] + face + [(length - member, d)]
    face = [(-(u_back - envelope_layout.column_surface_u(col, v)), v) for v in reversed(vs)]
    return [(member, d)] + face + [(member, -d)]


def build(plan):
    coll = L.layer_collection(COLLECTION)
    env = plan["envelope"]
    col = plan["structure"]["columns"]
    d, m, g = env["frame_depth"] / 2, env["member"], env["glass"] / 2
    rt = plan["returns"]
    joint = M.joint_slot()
    made = []
    for floor, (z0, z1) in enumerate(env["storeys"], start=1):
        frames, glass, wood, walls = [], [], [], []
        zh, zs = z1 - env["head"], z0 + env["sill"]
        zt1 = zh - env["transom_below_head"]
        zt0 = zt1 - env["transom"]
        for c in env["corners"]:
            frames.append(L.piece(corner_post(c, env["wall_radius"], d, env["post_ext"]), [(z0, z1)], "TM_RB_frame"))
        for bay in env["bays"]:
            var = next(v for v in bay["variants"] if floor in v["floors"])
            a, U, N, length = bay["a"], bay["along"], bay["outward"], bay["length"]
            world = lambda pts: [(a[0] + U[0] * s + N[0] * v, a[1] + U[1] * s + N[1] * v) for s, v in pts]  # noqa: E731
            box = lambda s0, s1, v0, v1: world([(s0, v0), (s1, v0), (s1, v1), (s0, v1)])  # noqa: E731
            wood_spans = [tuple(w) for w in var["wood"]]
            wall_spans = [tuple(w) for w in var.get("walls", [])]
            solid = wood_spans + wall_spans                   # full-height pieces: no rails, no pane
            lo, hi = 0.0, length
            for end, kind in ((0, bay["ends"][0]), (1, bay["ends"][1])):
                if kind == "corner":
                    continue
                edge = 0.0 if end == 0 else length
                if any(w0 - 1e-6 <= edge <= w1 + 1e-6 for w0, w1 in solid):
                    continue                                  # the wood or wall panel meets the pilaster / column itself
                if kind == "pilaster":
                    loop = box(0.0, m, -d, d) if end == 0 else box(length - m, length, -d, d)
                else:
                    loop = world(column_jamb(end == 1, length, m, d, col))
                frames.append(L.piece(loop, [(z0, z1)], "TM_RB_frame"))
                if end == 0:
                    lo = m
                else:
                    hi = length - m
            for w0, w1 in wood_spans:                          # a panel against a pilaster: the shadow gap first
                a0 = rt["gap"] if bay["ends"][0] == "pilaster" and w0 < 1e-6 else 0.0
                a1 = rt["gap"] if bay["ends"][1] == "pilaster" and w1 > length - 1e-6 else 0.0
                wood.append(L.piece(box(w0 + a0, w1 - a1, -d, d), [(z0, z1)], "TM_RB_wood"))
                for s0, s1 in ((w0, w0 + a0), (w1 - a1, w1)):
                    if s1 - s0 > 1e-6:
                        wood.append(L.piece(box(s0, s1, -d, d - rt["gap_depth"]), [(z0, z1)], joint))
            for w0, w1 in wall_spans:                          # user fix 7: a stone wall panel, slab to slab
                if w0 < 1e-6 and bay["ends"][0] == "column":
                    loop = world(column_jamb(False, length, w1, d, col))
                elif w1 > length - 1e-6 and bay["ends"][1] == "column":
                    loop = world(column_jamb(True, length, length - w0, d, col))
                else:
                    loop = box(w0, w1, -d, d)
                walls.append(L.piece(loop, [(z0, z1)], env["wall_slot"]))
            for r0, r1 in gaps(lo, hi, solid):                 # head and sill rails between full-height pieces
                frames.append(L.piece(box(r0, r1, -d, d), [(zh, z1), (z0, zs)], "TM_RB_frame"))
            panes = [tuple(p) for p in var["panes"]]
            for s0, s1 in gaps(lo, hi, panes + solid):         # jambs and mullions between the rails
                frames.append(L.piece(box(s0, s1, -d, d), [(zs, zh)], "TM_RB_frame"))
            for s0, s1 in panes:
                frames.append(L.piece(box(s0, s1, -d, d), [(zt0, zt1)], "TM_RB_frame"))
                glass.append(L.piece(box(s0, s1, -g, g), [(zs, zt0), (zt1, zh)], "TM_RB_glass"))
        made.append(L.pieces(f"rb_frames_f{floor}", coll, frames, tags("frame", f"frames_f{floor}", floor)))
        made.append(L.pieces(f"rb_glass_f{floor}", coll, glass, tags("glass", f"glass_f{floor}", floor)))
        if wood:
            made.append(L.pieces(f"rb_wood_f{floor}", coll, wood, tags("wood", f"wood_f{floor}", floor)))
        if walls:
            made.append(L.pieces(f"rb_wall_f{floor}", coll, walls, tags("wall", f"wall_f{floor}", floor)))
    doors = sum(len(v["doors"]) for b in env["bays"] for v in b["variants"])
    panels = sum(len(v.get("walls", [])) for b in env["bays"] for v in b["variants"])
    return {"collection": COLLECTION, "objects": len(made), "faces": sum(len(o.data.polygons) for o in made),
            "bays": len(env["bays"]), "door_panes_per_layout": doors, "wall_panels_per_floor": panels,
            "names": [o.name for o in made]}
