# city_neighbours.py -- the front-line neighbours of Terra & Mar, modelled (2026-10-17; user: "those specific buildings
# are in the front line adjacent to the hero ... they look like just boxes. we need to 1 - consider the plan, what that
# building is going to be? 2 - then add doors 3 - more detailed windows; better pairing, sizing organization
# 4 - building features, like cornices, window decorations etc 5 - variation in the building facade, geometrical or
# material (be subtle). it doesn't need to be too detailed like the hero; just enough to be believable").
#
# The Bradbury's city fills the parcels with boxes whose windows are DRAWN by their material (build_scene.py's
# facade_material: the bays, reveals and sills in the shader, from the box's fac_lo / fac_hi). For the buildings that
# stand in the hero's frames (FRONT_LINE, picked by measuring each building's share of every still and flyover frame,
# see the README) this module replaces the box's walls with modelled ones, in the copy only:
#
#   THE PLAN. Each building keeps the use the city gave it (its recipe, the suffix of its material: flats, shops,
#   offices, shed) and the Bradbury's two Broadway neighbours get theirs (the tower: offices; the wing: shops under
#   offices). A use sets the storeys (the city's own CITY_FACADES heights, so the scale matches the rest of the city),
#   the ground floor (a residential entrance, shopfronts, an office lobby, a workshop's roll-up doors) and the window
#   organisation above it. The faces turned toward the hero are the building's FRONTS (entrances, shopfronts, signs);
#   the others get the same upper windows over a plainer ground floor with a service door.
#   DOORS. Every building has at least one: panelled entrance doors under a transom and a canopy (flats), glazed shop
#   doors inside each shopfront (shops), glazed double doors in a recessed lobby under a canopy (offices, tower),
#   roll-up doors and a steel man door (shed), and a service door on the back faces.
#   WINDOWS. Real openings: a reveal into the wall, the glass set back in it (dark glass, some with a blind down), a
#   frame with mullions and a transom, a projecting sill. Organised by use: flats in PAIRS (two windows on a narrow
#   pier, wider piers between the pairs), offices in RIBBONS between pilasters (a row of panes on mullions over a
#   spandrel), sheds in a clerestory row, shops' upper floors paired over full-width shopfronts.
#   FEATURES. A plinth in a darker render, a string course over the ground floor, a stepped cornice under a coped
#   parapet (flats, shops, the wing) or a metal coping (offices, sheds, the tower), lintels and sills in a lighter
#   stone, window surrounds on some flats, pilasters on offices and the tower, a few Juliet balconies, canopies,
#   shop fascias with sign panels and the odd awning.
#   VARIATION (subtle). The ground storey in a slightly different tone from the floors over it, the entrance bay in its
#   own tone, a per-building choice of frame colour, cornice depth, pairing and pilaster rhythm from a seeded random
#   generator, and the city's own per-building tint kept.
# The roof (its plane, plant boxes, bulkhead) is the box's own, kept; only its walls (and parapet) are rebuilt, on the
# same footprint and to the same height, so the city's layout, shadows and skyline are unchanged.
import math
import random

import bpy

Z0 = 0.15                     # the boxes' wall foot (their UVs start there; the pavement top is 0.201)
SEED = 1017

# The city's storeys (build_scene.py CITY_FACADES: storey_h, bay_w, window_w, window_h, sill_h, ground storey) and the
# Bradbury's neighbours (NEIGHBOUR_FACADE / NEIGHBOUR_WING_FACADE), so the floors keep the scale the rest of the city has
USES = {
    "flats":   dict(storey=4.0, bay=2.9, win_w=1.35, win_h=2.0, sill=1.0, ground=4.0),
    "offices": dict(storey=4.4, bay=3.3, win_w=2.0, win_h=2.4, sill=0.9, ground=4.4),
    "shops":   dict(storey=4.2, bay=3.0, win_w=1.4, win_h=2.0, sill=1.0, ground=4.8),
    "shed":    dict(storey=6.5, bay=4.0, win_w=1.6, win_h=1.2, sill=3.8, ground=6.5),
    "tower":   dict(storey=3.15, bay=3.6, win_w=1.6, win_h=1.7, sill=0.8, ground=3.9),   # twelve storeys in its 39 m
}
# the Bradbury's wing keeps its own storeys (NEIGHBOUR_WING_FACADE: a 3.6 m shop storey under a 3.3 m one)
OVERRIDE = {"ctx_neighbour_wing": dict(storey=3.3, bay=3.6, win_w=1.6, win_h=1.5, sill=0.9, ground=3.6)}
NEIGHBOUR_USE = {"ctx_neighbour_tower": "tower", "ctx_neighbour_wing": "shops", "ctx_shed_tan": "shed"}

# THE FRONT LINE: every building that fills at least 0.4% of a still's or a flyover frame's picture (front_line.py
# measures it with a ray grid per camera; 2026-10-17), and those the user marked on the rear views (the white row
# beyond the south lots, the north-east offices)
FRONT_LINE = [
    "ctx_neighbour_tower", "ctx_neighbour_wing", "ctx_shed_tan",
    "city_bld_0838", "city_bld_0839", "city_bld_1009", "city_bld_0932", "city_bld_0835", "city_bld_0970", "city_bld_0928",
    "city_bld_0929", "city_bld_0969", "city_bld_0963", "city_bld_0828", "city_bld_1007", "city_bld_0841", "city_bld_0840",
    "city_bld_0931", "city_bld_0703", "city_bld_0704", "city_bld_0831", "city_bld_1004", "city_bld_0930", "city_bld_0827",
    "city_bld_0825", "city_bld_0962", "city_bld_1008", "city_bld_0842", "city_bld_0836", "city_bld_0927", "city_bld_0833",
    "city_bld_0697",
    # marked by the user (2026-10-17)
    "city_bld_0960", "city_bld_0961", "city_bld_0964", "city_bld_0965", "city_bld_1005", "city_bld_1142", "city_bld_1143",
]

PIER_END = 0.9                # a window keeps at least this much wall from a corner
REVEAL = 0.18                 # a window's reveal depth (glass this far behind the wall face)
REVEAL_SHOP = 0.25
REVEAL_DOOR = 0.30
REVEAL_LOBBY = 1.2            # an office lobby's doors stand this deep in a recess
FRAME_W, FRAME_D = 0.06, 0.05 # window frame members: width, depth proud of the glass
SILL = (0.10, 0.07, 0.06)     # a sill: overhang each side, height, projection
LINTEL = (0.12, 0.20, 0.04)   # a lintel: overhang each side, height, projection
PLINTH = (0.65, 0.03)         # plinth: height, projection
STRING = (0.22, 0.06)         # string course: height, projection
CORNICE = ((0.45, 0.03), (0.16, 0.22), (0.07, 0.30))   # (height, projection) bottom-up: frieze, corona, cap
COPING = (0.10, 0.05)         # parapet coping: height, overhang
PARAPET_T = 0.25              # the parapet's thickness
PILASTER = (0.45, 0.08)       # width, projection
CANOPY = (0.18, 1.4, 0.6)     # thickness, depth, overhang each side of the door
TONE_GROUND = 0.92            # the ground storey's tone against the floors over it (variation, subtle)
TONE_ENTRY = 1.05             # an entrance bay's own tone
BLIND_SHARE = 0.25            # windows with a blind down
JULIET_SHARE = 0.18           # flats' upper windows that open as French windows behind a Juliet rail
AWNING_SHARE = 0.4            # shopfronts with an awning
SIGN_COLOURS = [(0.035, 0.07, 0.05), (0.06, 0.03, 0.025), (0.03, 0.04, 0.07), (0.05, 0.05, 0.05), (0.32, 0.28, 0.22)]
AWNING_COLOURS = [(0.09, 0.16, 0.10), (0.30, 0.10, 0.06), (0.06, 0.08, 0.16), (0.40, 0.34, 0.24), (0.12, 0.12, 0.12)]
FRAME_COLOURS = {"bronze": ((0.030, 0.025, 0.020), 0.45, 0.5), "white": ((0.62, 0.62, 0.60), 0.5, 0.0),
                 "green": ((0.025, 0.045, 0.035), 0.45, 0.3), "grey": ((0.09, 0.09, 0.095), 0.4, 0.6)}


# ---------------------------------------------------------------- materials
def _hazed(m):
    """Pass a material's surface through the scene's scn_haze group, as build_scene.py's hazed() does."""
    nt = m.node_tree
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    lk = next(l for l in nt.links if l.to_socket == out.inputs["Surface"])
    g = nt.nodes.new('ShaderNodeGroup'); g.node_tree = bpy.data.node_groups["scn_haze"]
    src = lk.from_socket; nt.links.remove(lk)
    nt.links.new(src, g.inputs["Shader"]); nt.links.new(g.outputs["Shader"], out.inputs["Surface"])
    m.cycles.emission_sampling = 'NONE'
    return m


def _plain(name, colour, rough=0.6, metal=0.0, spec=0.5, bump=None):
    m = bpy.data.materials.get(name)
    if m is not None:
        return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*colour, 1.0); b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal; b.inputs["Specular IOR Level"].default_value = spec
    if bump == "corrugated":   # a roll-up door's slats: a horizontal wave in the normal
        nt = m.node_tree
        tc = nt.nodes.new('ShaderNodeTexCoord'); wv = nt.nodes.new('ShaderNodeTexWave'); bp = nt.nodes.new('ShaderNodeBump')
        wv.wave_type = 'BANDS'; wv.bands_direction = 'Z'; wv.inputs["Scale"].default_value = 0.5   # object metres: 12 cm slats
        nt.links.new(tc.outputs["Object"], wv.inputs["Vector"]); nt.links.new(wv.outputs["Fac"], bp.inputs["Height"])
        bp.inputs["Strength"].default_value = 0.35; bp.inputs["Distance"].default_value = 0.02
        nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
    return _hazed(m)


def wall_material(src):
    """A copy of a city facade material with its drawn windows switched off: the plain set, its tint and its haze."""
    name = src.name + "_plain"
    m = bpy.data.materials.get(name)
    if m is not None:
        return m
    m = src.copy(); m.name = name; nt = m.node_tree
    for nn, sock, val in (("FAC_MIX", "Factor", 0.0), ("FAC_TRIM", "Factor", 0.0)):
        n = nt.nodes.get(nn)
        if n is None:
            continue
        s = n.inputs[sock]
        for l in list(s.links):
            nt.links.remove(l)
        s.default_value = val
    for n in nt.nodes:
        if n.type == 'BUMP':     # the reveals' and trims' ramps lived in this bump; the set's normal map stays
            for l in list(n.inputs["Height"].links):
                nt.links.remove(l)
            n.inputs["Strength"].default_value = 0.0
    return m


class Mats:
    def __init__(self, scene_mats):
        self.wall_src = scene_mats
        white = next((m for m in bpy.data.materials if m.name.startswith("CTX_city_white_") and m.library is None
                      and not m.name.endswith("_plain")), None)
        grey = next((m for m in bpy.data.materials if m.name.startswith("CTX_city_grey_") and m.library is None
                     and not m.name.endswith("_plain")), None)
        self.trim = wall_material(white)            # sills, lintels, cornices, string courses: a pale plaster / stone
        self.base = wall_material(grey or white)    # the plinth: a grey render
        self.glass = _plain("NB_glass", (0.020, 0.032, 0.050), rough=0.08, spec=0.6)
        self.blind = _plain("NB_glass_blind", (0.16, 0.15, 0.135), rough=0.55, spec=0.3)
        self.frames = {k: _plain(f"NB_frame_{k}", c, rough=r, metal=mt) for k, (c, r, mt) in FRAME_COLOURS.items()}
        self.door_wood = _plain("NB_door_wood", (0.10, 0.055, 0.03), rough=0.55)
        self.door_paint = [_plain(f"NB_door_paint_{i}", c, rough=0.45) for i, c in enumerate(
            [(0.02, 0.05, 0.035), (0.06, 0.02, 0.018), (0.02, 0.025, 0.05), (0.03, 0.03, 0.03)])]
        self.metal = _plain("NB_metal", (0.22, 0.22, 0.23), rough=0.4, metal=0.8)
        self.rollup = _plain("NB_rollup", (0.40, 0.41, 0.42), rough=0.5, metal=0.6, bump="corrugated")
        self.kick = _plain("NB_kick", (0.03, 0.03, 0.03), rough=0.5, metal=0.3)
        self.signs = [_plain(f"NB_sign_{i}", c, rough=0.5) for i, c in enumerate(SIGN_COLOURS)]
        self.awnings = [_plain(f"NB_awning_{i}", c, rough=0.85) for i, c in enumerate(AWNING_COLOURS)]
        self.interior = _plain("NB_interior", (0.012, 0.012, 0.012), rough=0.9)


# ---------------------------------------------------------------- geometry
class Builder:
    """One object's mesh: quads and boxes in a facade's own frame (u along it, z up, out away from the wall), each face
    in a material slot, UVs in world metres as the city boxes have them."""

    def __init__(self):
        self.v, self.f, self.mi, self.mats = [], [], [], []

    def slot(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def face(self, pts, m, inward_of=None):
        """A polygon of world points; inward_of = a point the face must look away from (orientation fix)."""
        if inward_of is not None:
            a, b, c = (pts[0], pts[1], pts[2])
            n = _cross(_sub(b, a), _sub(c, a))
            cen = tuple(sum(p[k] for p in pts) / len(pts) for k in range(3))
            if _dot(n, _sub(cen, inward_of)) < 0:
                pts = list(reversed(pts))
        k = len(self.v); self.v += [tuple(p) for p in pts]; self.f.append(tuple(range(k, k + len(pts)))); self.mi.append(self.slot(m))

    def box(self, lo, hi, m):
        x0, y0, z0 = lo; x1, y1, z1 = hi
        if x1 - x0 < 1e-4 or y1 - y0 < 1e-4 or z1 - z0 < 1e-4:
            return
        c = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
        P = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        for q in ((0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            self.face([P[i] for i in q], m, inward_of=c)

    def build(self, name, col, tint=(1.0, 1.0, 1.0)):
        if not self.f:
            return None
        me = bpy.data.meshes.new(name); me.from_pydata(self.v, [], self.f); me.update()
        me.uv_layers.new(name="UVMap"); uvl = me.uv_layers.active.data
        for pl in me.polygons:
            n = pl.normal
            for li in pl.loop_indices:
                p = me.vertices[me.loops[li].vertex_index].co
                if abs(n.z) > 0.7:
                    uv = (p.x, p.y)
                elif abs(n.x) >= abs(n.y):
                    uv = (p.y if n.x > 0 else -p.y, p.z)
                else:
                    uv = (-p.x if n.y > 0 else p.x, p.z)
                uvl[li].uv = uv
        for m in self.mats:
            me.materials.append(m)
        me.polygons.foreach_set("material_index", self.mi)
        ob = bpy.data.objects.new(name, me); col.objects.link(ob)
        ob["city_tint"] = tuple(tint)          # every city material reads it (a missing one reads black)
        return ob


def _sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def _dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def _cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


class Face:
    """One side of a rectangular footprint: origin at its left end seen from outside, U along it, N out of it."""

    def __init__(self, side, x0, x1, y0, y1):
        self.side = side
        if side == "S":
            self.o, self.U, self.N, self.L = (x0, y0), (1, 0), (0, -1), x1 - x0
        elif side == "E":
            self.o, self.U, self.N, self.L = (x1, y0), (0, 1), (1, 0), y1 - y0
        elif side == "N":
            self.o, self.U, self.N, self.L = (x1, y1), (-1, 0), (0, 1), x1 - x0
        else:
            self.o, self.U, self.N, self.L = (x0, y1), (0, -1), (-1, 0), y1 - y0

    def P(self, u, z, out=0.0):
        return (self.o[0] + u * self.U[0] + out * self.N[0], self.o[1] + u * self.U[1] + out * self.N[1], z)

    def quad(self, B, u0, u1, z0, z1, out, m):
        B.face([self.P(u0, z0, out), self.P(u1, z0, out), self.P(u1, z1, out), self.P(u0, z1, out)], m,
               inward_of=self.P((u0 + u1) / 2, (z0 + z1) / 2, out - 1.0))

    def box(self, B, u0, u1, z0, z1, out0, out1, m):
        a, b = self.P(u0, z0, out0), self.P(u1, z1, out1)
        B.box((min(a[0], b[0]), min(a[1], b[1]), min(a[2], b[2])), (max(a[0], b[0]), max(a[1], b[1]), max(a[2], b[2])), m)


def wall_with_holes(F, B, z0, z1, holes, m, u0=0.0, u1=None):
    """The wall plane from z0 to z1 over u0..u1, minus the holes (u0, u1, z0, z1): horizontal strips cut at every hole
    edge, each strip's covered spans left out."""
    u1 = F.L if u1 is None else u1
    zs = sorted({z0, z1} | {h[2] for h in holes if z0 < h[2] < z1} | {h[3] for h in holes if z0 < h[3] < z1})
    for za, zb in zip(zs, zs[1:]):
        zm = (za + zb) / 2
        spans = sorted((max(u0, h[0]), min(u1, h[1])) for h in holes if h[2] < zm < h[3] and h[1] > u0 and h[0] < u1)
        u = u0
        for a, b in spans:
            if a > u + 1e-4:
                F.quad(B, u, a, za, zb, 0.0, m)
            u = max(u, b)
        if u1 > u + 1e-4:
            F.quad(B, u, u1, za, zb, 0.0, m)


def reveal(F, B, u0, u1, z0, z1, depth, m, bottom=True):
    """The four sides of an opening from the wall face back to the depth, facing into the opening."""
    c = F.P((u0 + u1) / 2, (z0 + z1) / 2, -depth / 2)
    sides = [(F.P(u0, z0, 0), F.P(u0, z0, -depth), F.P(u0, z1, -depth), F.P(u0, z1, 0)),
             (F.P(u1, z0, 0), F.P(u1, z1, 0), F.P(u1, z1, -depth), F.P(u1, z0, -depth)),
             (F.P(u0, z1, 0), F.P(u0, z1, -depth), F.P(u1, z1, -depth), F.P(u1, z1, 0))]
    if bottom:
        sides.append((F.P(u0, z0, 0), F.P(u1, z0, 0), F.P(u1, z0, -depth), F.P(u0, z0, -depth)))
    for q in sides:
        # each side faces the opening's centre line
        cen = tuple(sum(p[k] for p in q) / 4 for k in range(3))
        away = tuple(2 * cen[k] - c[k] for k in range(3))
        B.face(list(q), m, inward_of=away)


def window(F, B, M, u0, u1, z0, z1, frame_m, rng, depth=REVEAL, mullion=None, transom=None, sill=True, lintel=None,
           surround=False, glass=None):
    """A modelled window: reveal, glass at the reveal's depth (some with a blind), a frame ring with its mullions and
    transom, a sill and an optional lintel or surround."""
    reveal(F, B, u0, u1, z0, z1, depth, M.wall_cur)
    g = glass or (M.blind if rng.random() < BLIND_SHARE else M.glass)
    F.quad(B, u0, u1, z0, z1, -depth, g)
    fo0, fo1 = -depth, -depth + FRAME_D
    F.box(B, u0, u0 + FRAME_W, z0, z1, fo0, fo1, frame_m); F.box(B, u1 - FRAME_W, u1, z0, z1, fo0, fo1, frame_m)
    F.box(B, u0 + FRAME_W, u1 - FRAME_W, z0, z0 + FRAME_W, fo0, fo1, frame_m)
    F.box(B, u0 + FRAME_W, u1 - FRAME_W, z1 - FRAME_W, z1, fo0, fo1, frame_m)
    w = u1 - u0
    n_mul = mullion if mullion is not None else (1 if w > 1.1 else 0)
    for k in range(1, n_mul + 1):
        um = u0 + w * k / (n_mul + 1)
        F.box(B, um - FRAME_W * 0.6, um + FRAME_W * 0.6, z0 + FRAME_W, z1 - FRAME_W, fo0, fo1, frame_m)
    if transom:
        zt = z0 + (z1 - z0) * transom
        F.box(B, u0 + FRAME_W, u1 - FRAME_W, zt - FRAME_W * 0.6, zt + FRAME_W * 0.6, fo0, fo1, frame_m)
    if sill:
        ov, h, pr = SILL
        F.box(B, u0 - ov, u1 + ov, z0 - h, z0, -0.02, pr, M.trim_cur)
    if lintel:
        ov, h, pr = LINTEL
        F.box(B, u0 - ov, u1 + ov, z1, z1 + h, -0.02, pr, M.trim_cur)
    if surround:   # an architrave: a flat band round the opening
        bw, pr = 0.12, 0.03
        F.box(B, u0 - bw, u0, z0, z1 + bw, -0.02, pr, M.trim_cur); F.box(B, u1, u1 + bw, z0, z1 + bw, -0.02, pr, M.trim_cur)
        F.box(B, u0, u1, z1, z1 + bw, -0.02, pr, M.trim_cur)


def door(F, B, M, u0, u1, z0, z1, kind, rng, depth=REVEAL_DOOR, frame_m=None, transom_h=0.0):
    """A door in its opening: 'panel' (painted or wood leaves), 'glass' (framed glazed leaves), 'steel' (a man door).
    transom_h: a glazed transom of this height over the leaves."""
    frame_m = frame_m or M.frames["bronze"]
    reveal(F, B, u0, u1, z0, z1, depth, M.wall_cur, bottom=False)
    zl = z1 - transom_h
    leaves = 2 if u1 - u0 > 1.4 else 1
    fo0, fo1 = -depth, -depth + 0.06
    if transom_h > 0:
        F.quad(B, u0, u1, zl, z1, -depth, M.glass)
        F.box(B, u0, u1, zl - 0.05, zl + 0.03, fo0, fo1, frame_m)
    if kind == "glass":
        F.quad(B, u0, u1, z0, zl, -depth, M.glass)
    else:
        leaf_m = M.door_wood if kind == "panel" and rng.random() < 0.5 else (rng.choice(M.door_paint) if kind == "panel" else M.metal)
        F.quad(B, u0, u1, z0, zl, -depth, leaf_m)
    F.box(B, u0, u0 + 0.07, z0, z1, fo0, fo1, frame_m); F.box(B, u1 - 0.07, u1, z0, z1, fo0, fo1, frame_m)
    F.box(B, u0, u1, z1 - 0.07, z1, fo0, fo1, frame_m)
    w = (u1 - u0) / leaves
    for k in range(leaves):
        a, b = u0 + k * w, u0 + (k + 1) * w
        if kind == "glass":   # each leaf's frame and a push bar
            F.box(B, a + 0.03, a + 0.11, z0, zl, fo0, fo1, frame_m); F.box(B, b - 0.11, b - 0.03, z0, zl, fo0, fo1, frame_m)
            F.box(B, a + 0.03, b - 0.03, z0, z0 + 0.18, fo0, fo1, frame_m)
            F.box(B, a + 0.11, b - 0.11, z0 + 1.0, z0 + 1.06, fo1, fo1 + 0.05, M.metal)
        elif kind == "panel":  # raised panels: two proud rectangles per leaf, and a handle
            for zz0, zz1 in ((z0 + 0.15, z0 + (zl - z0) * 0.45), (z0 + (zl - z0) * 0.52, zl - 0.15)):
                F.box(B, a + 0.12, b - 0.12, zz0, zz1, -depth, -depth + 0.025, M.door_wood)
            hx = b - 0.12 if k == 0 else a + 0.12
            F.box(B, hx - 0.02, hx + 0.02, z0 + 0.95, z0 + 1.15, -depth, -depth + 0.07, M.metal)
        else:
            F.box(B, b - 0.14, b - 0.08, z0 + 0.98, z0 + 1.04, -depth, -depth + 0.07, M.metal)
    F.box(B, u0 - 0.05, u1 + 0.05, z0 - 0.02, z0 + 0.03, -depth, 0.05, M.base)   # a threshold step


def canopy(F, B, M, uc, w, z, depth=CANOPY[1]):
    t = CANOPY[0]
    F.box(B, uc - w / 2, uc + w / 2, z, z + t, -0.02, depth, M.metal)


def awning(F, B, m, u0, u1, z_top, depth=1.1, drop=0.55, valance=0.22):
    """A sloped fabric awning: its sheet from the wall down and out, a valance hanging at the front, closed ends."""
    zf = z_top - drop
    pts = [F.P(u0, z_top, 0.02), F.P(u1, z_top, 0.02), F.P(u1, zf, depth), F.P(u0, zf, depth)]
    B.face(pts, m, inward_of=F.P((u0 + u1) / 2, z_top - 2.0, 0.0))                 # the sheet, facing up and out
    B.face(list(reversed(pts)), m)                                                   # its underside
    F.quad(B, u0, u1, zf - valance, zf, depth, m)
    for u in (u0, u1):
        B.face([F.P(u, z_top, 0.02), F.P(u, zf, depth), F.P(u, zf - valance, depth), F.P(u, zf - valance * 0.5, 0.02)], m)


def juliet(F, B, M, u0, u1, z0):
    """A Juliet balcony rail in front of a French window: a top and a bottom rail and bars between."""
    out0, out1 = 0.06, 0.10
    F.box(B, u0 - 0.05, u1 + 0.05, z0 + 0.05, z0 + 0.10, out0, out1, M.metal)
    F.box(B, u0 - 0.05, u1 + 0.05, z0 + 1.0, z0 + 1.05, out0 - 0.01, out1 + 0.01, M.metal)
    n = max(3, int((u1 - u0) / 0.13))
    for k in range(n + 1):
        u = u0 - 0.03 + (u1 - u0 + 0.06) * k / n
        F.box(B, u - 0.012, u + 0.012, z0 + 0.10, z0 + 1.0, out0 + 0.01, out0 + 0.035, M.metal)
    for u in (u0 - 0.05, u1 + 0.03):   # brackets back to the wall
        F.box(B, u, u + 0.02, z0 + 0.05, z0 + 0.10, -0.02, out0, M.metal)


def ring(B, x0, x1, y0, y1, z0, z1, out, m, inset=0.02):
    """A closed band round the footprint: from just inside the wall line to `out` beyond it, z0..z1."""
    xi0, xi1, yi0, yi1 = x0 + inset, x1 - inset, y0 + inset, y1 - inset
    xo0, xo1, yo0, yo1 = x0 - out, x1 + out, y0 - out, y1 + out
    c = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    O = [(xo0, yo0), (xo1, yo0), (xo1, yo1), (xo0, yo1)]
    I = [(xi0, yi0), (xi1, yi0), (xi1, yi1), (xi0, yi1)]
    for k in range(4):
        a, b = O[k], O[(k + 1) % 4]
        B.face([(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1)], m, inward_of=c)   # outer side
        ia, ib = I[k], I[(k + 1) % 4]
        B.face([(ia[0], ia[1], z1), (ib[0], ib[1], z1), (b[0], b[1], z1), (a[0], a[1], z1)], m,
               inward_of=(c[0], c[1], z1 - 1.0))                                                          # top
        B.face([(ia[0], ia[1], z0), (a[0], a[1], z0), (b[0], b[1], z0), (ib[0], ib[1], z0)], m,
               inward_of=(c[0], c[1], z0 + 1.0))                                                          # underside


# ---------------------------------------------------------------- the buildings
def _footprint(ob):
    vs = [ob.matrix_world @ v.co for v in ob.data.vertices]
    return min(v.x for v in vs), max(v.x for v in vs), min(v.y for v in vs), max(v.y for v in vs)


def _strip_walls(ob, wall_slot, x0, x1, y0, y1):
    """The box's own mesh, made local, without its walls and parapet (the wall-material faces at the footprint's
    edge, and its underside): the roof plane, plant boxes and bulkhead stay. Returns (roof z, wall top z)."""
    import bmesh
    me = ob.data.copy(); me.name = ob.data.name + "_roof"; ob.data = me
    bm = bmesh.new(); bm.from_mesh(me)
    mw = ob.matrix_world
    roof_z, top_z, drop = None, Z0, []
    for f in bm.faces:
        cen = mw @ f.calc_center_median()
        near = min(abs(cen.x - x0), abs(cen.x - x1), abs(cen.y - y0), abs(cen.y - y1)) < 0.6
        zs = [(mw @ v.co).z for v in f.verts]
        if f.material_index == wall_slot and (near or f.normal.z < -0.9):
            drop.append(f); top_z = max(top_z, max(zs))
        elif f.normal.z > 0.9 and f.material_index != wall_slot and not near:
            roof_z = min(z for z in zs) if roof_z is None else min(roof_z, min(zs))
    bmesh.ops.delete(bm, geom=drop, context='FACES')
    bm.to_mesh(me); bm.free()
    return (roof_z if roof_z is not None else top_z - 0.9), top_z


def _use_of(ob):
    if ob.name in NEIGHBOUR_USE:
        return NEIGHBOUR_USE[ob.name]
    wall = ob.data.materials[0].name
    for u in ("flats", "offices", "shops", "shed"):
        if wall.endswith(u):
            return u
    return "flats"


def model(ob, M, col, hero_xy, log=print):
    """Rebuild one box's walls as a modelled building of its use. Returns the new objects."""
    rng = random.Random(f"{SEED}:{ob.name}")
    use = _use_of(ob)
    p = OVERRIDE.get(ob.name, USES[use])
    x0, x1, y0, y1 = _footprint(ob)
    wall_src = ob.data.materials[0]
    roof_z, top_z = _strip_walls(ob, 0, x0, x1, y0, y1)
    tint = tuple(ob.get("city_tint", (1.0, 1.0, 1.0)))
    classical = use in ("flats", "shops")
    frame_m = M.frames[rng.choice(["white", "bronze", "green"] if classical else ["bronze", "grey"])]
    M.wall_cur, M.trim_cur = wall_material(wall_src), M.trim
    # the storeys: the ground storey, then whole storeys up to the roof; the rest above the last one is the attic band
    gh = min(p["ground"], roof_z - Z0)
    levels = [Z0]
    z = Z0 + gh
    while z + p["storey"] <= roof_z + 0.4 and use != "shed":
        levels.append(z); z += p["storey"]
    levels.append(min(z, roof_z))
    n_up = len(levels) - 2
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    hx, hy = hero_xy[0] - cx, hero_xy[1] - cy
    hl = math.hypot(hx, hy) or 1.0
    Bw, Bg, Bt, Bd = Builder(), Builder(), Builder(), Builder()   # walls (upper), walls (ground storey), trims, details
    stats = {"windows": 0, "doors": 0, "shopfronts": 0, "rollups": 0, "juliets": 0, "awnings": 0}
    pil = use in ("offices", "tower") or (use == "shed")
    pairing = rng.random() < 0.75
    for side in ("S", "E", "N", "W"):
        F = Face(side, x0, x1, y0, y1)
        front = (F.N[0] * hx + F.N[1] * hy) / hl > 0.3
        L = F.L
        holes_g, holes_u = [], []
        # -------- the bays: centres along the face, kept PIER_END from the corners
        bw = p["bay"]
        n_bay = max(1, int((L - 2 * PIER_END) // bw))
        span = n_bay * bw
        ub = [(L - span) / 2 + (k + 0.5) * bw for k in range(n_bay)]
        # -------- ground storey
        zg0, zg1 = Z0, Z0 + gh
        if use == "shops" and front:
            # shop units of two bays each (the last takes three if odd), a pier between them
            units, k = [], 0
            while k < n_bay:
                take = 3 if n_bay - k == 3 else min(2, n_bay - k)
                units.append((ub[k] - bw / 2 + 0.3, ub[k + take - 1] + bw / 2 - 0.3)); k += take
            for (a, b) in units:
                zt = zg1 - 0.95                                                   # the glazing's head; the fascia over it
                holes_g.append((a, b, zg0, zt))
                reveal(F, Bd, a, b, zg0, zt, REVEAL_SHOP, M.wall_cur, bottom=False)
                d = REVEAL_SHOP
                door_left = rng.random() < 0.5
                dw = 1.1
                da, db = (a + 0.15, a + 0.15 + dw) if door_left else (b - 0.15 - dw, b - 0.15)
                ga, gb = (db + 0.1, b) if door_left else (a, da - 0.1)
                F.quad(Bd, ga, gb, zg0 + 0.45, zt, -d, M.glass)                    # the display glazing over a kick panel
                F.quad(Bd, ga, gb, zg0, zg0 + 0.45, -d, M.kick)
                fo = (-d, -d + 0.06)
                for u in (a, b, ga, gb):
                    F.box(Bd, u - 0.04, u + 0.04, zg0, zt, *fo, frame_m)
                F.box(Bd, a, b, zg0 + 2.75, zg0 + 2.83, *fo, frame_m)               # the transom bar
                F.box(Bd, ga, gb, zg0 + 0.42, zg0 + 0.48, *fo, frame_m)
                nm = max(0, int((gb - ga) / 1.6))
                for j in range(1, nm + 1):
                    um = ga + (gb - ga) * j / (nm + 1)
                    F.box(Bd, um - 0.03, um + 0.03, zg0 + 0.45, zt, *fo, frame_m)
                F.quad(Bd, da, db, zg0 + 2.83, zt, -d, M.glass)                     # over the door, transom glass
                door(F, Bd, M, da, db, zg0, zg0 + 2.75, "glass", rng, depth=d, frame_m=frame_m)
                sign = rng.choice(M.signs)                                           # the fascia's sign panel
                F.box(Bd, a + 0.25, b - 0.25, zt + 0.22, zt + 0.72, -0.01, 0.05, sign)
                if rng.random() < AWNING_SHARE:
                    awning(F, Bd, rng.choice(M.awnings), a + 0.05, b - 0.05, zt + 0.12); stats["awnings"] += 1
                stats["shopfronts"] += 1; stats["doors"] += 1
        elif use == "shed":
            if front or rng.random() < 0.5:
                n_roll = max(1, min(3, n_bay // 2))
                picks = sorted(rng.sample(range(n_bay), n_roll)) if n_bay > 1 else [0]
                for k in picks:
                    a, b = ub[k] - 1.8, ub[k] + 1.8
                    zt = zg0 + 4.4
                    holes_g.append((a, b, zg0, zt))
                    reveal(F, Bd, a, b, zg0, zt, 0.2, M.wall_cur, bottom=False)
                    F.quad(Bd, a, b, zg0, zt, -0.2, M.rollup)
                    F.box(Bd, a - 0.15, a, zg0, zt + 0.15, -0.02, 0.10, M.metal); F.box(Bd, b, b + 0.15, zg0, zt + 0.15, -0.02, 0.10, M.metal)
                    F.box(Bd, a - 0.15, b + 0.15, zt, zt + 0.15, -0.02, 0.10, M.metal)
                    F.box(Bd, a, b, zt - 0.5, zt, -0.2, -0.05, M.metal)                # the roll housing
                    stats["rollups"] += 1
                free = [k for k in range(n_bay) if k not in picks]
                if free:
                    k = free[len(free) // 2]
                    a, b = ub[k] - 0.5, ub[k] + 0.5
                    holes_g.append((a, b, zg0, zg0 + 2.2))
                    door(F, Bd, M, a, b, zg0, zg0 + 2.2, "steel", rng, depth=0.12, frame_m=M.frames["grey"])
                    canopy(F, Bd, M, ub[k], 1.8, zg0 + 2.45, depth=1.0); stats["doors"] += 1
            # the clerestory: a row of lights high up in every bay
            for k in range(n_bay):
                a, b = ub[k] - p["win_w"] / 2, ub[k] + p["win_w"] / 2
                za, zb = zg0 + p["sill"], zg0 + p["sill"] + p["win_h"]
                if za < roof_z - 0.3 and not any(h[0] < b and h[1] > a and h[3] > za for h in holes_g):
                    zb = min(zb, roof_z - 0.3)
                    holes_g.append((a, b, za, zb))
                    window(F, Bd, M, a, b, za, zb, M.frames["grey"], rng, mullion=1, sill=False); stats["windows"] += 1
        else:
            # flats / offices / tower / shops' back faces: an entrance (fronts) or a service door, windows elsewhere
            ent = n_bay // 2 if front else None
            for k in range(n_bay):
                if k == ent:
                    if use in ("offices", "tower"):
                        a, b = ub[k] - 1.3, ub[k] + 1.3                               # a recessed glazed lobby
                        zt = zg0 + 3.2
                        holes_g.append((a, b, zg0, zt))
                        reveal(F, Bd, a, b, zg0, zt, REVEAL_LOBBY, M.trim_cur, bottom=False)
                        F.quad(Bd, a, b, zg0, zt, -REVEAL_LOBBY - 0.01, M.interior)  # (the lobby's back, behind the doors)
                        door(F, Bd, M, a + 0.3, b - 0.3, zg0, zt, "glass", rng, depth=REVEAL_LOBBY - 0.2, frame_m=frame_m, transom_h=0.7)
                        canopy(F, Bd, M, ub[k], b - a + 2 * CANOPY[2], zt + 0.15, depth=1.8)
                    else:
                        a, b = ub[k] - 0.75, ub[k] + 0.75                             # a residential entrance
                        zt = zg0 + 3.1
                        holes_g.append((a, b, zg0, zt))
                        door(F, Bd, M, a, b, zg0, zt, "panel", rng, frame_m=frame_m, transom_h=0.55)
                        F.box(Bd, a - 0.22, a, zg0, zt + 0.22, -0.02, 0.05, M.trim_cur)  # the door surround
                        F.box(Bd, b, b + 0.22, zg0, zt + 0.22, -0.02, 0.05, M.trim_cur)
                        F.box(Bd, a, b, zt, zt + 0.22, -0.02, 0.05, M.trim_cur)
                        canopy(F, Bd, M, ub[k], b - a + 2 * CANOPY[2], zt + 0.32)
                        F.box(Bd, a - 0.4, b + 0.4, Z0, Z0 + 0.16, -0.02, 0.6, M.base)   # a step
                    stats["doors"] += 1
                    continue
                if (not front) and k == 0 and rng.random() < 0.7:
                    a, b = ub[k] - 0.5, ub[k] + 0.5                                    # a service door
                    holes_g.append((a, b, zg0, zg0 + 2.3))
                    door(F, Bd, M, a, b, zg0, zg0 + 2.3, "steel", rng, depth=0.15, frame_m=M.frames["grey"]); stats["doors"] += 1
                    continue
                w = p["win_w"] * (1.25 if use == "offices" else 1.0)
                za = zg0 + max(1.1, p["sill"] + 0.2)
                zb = min(zg1 - 0.6, za + p["win_h"])
                a, b = ub[k] - w / 2, ub[k] + w / 2
                holes_g.append((a, b, za, zb))
                window(F, Bd, M, a, b, za, zb, frame_m, rng, transom=0.72 if use != "flats" else None,
                       lintel=classical); stats["windows"] += 1
        # -------- the upper storeys
        for s in range(n_up):
            zs0 = levels[s + 1]
            za, zb = zs0 + p["sill"], zs0 + p["sill"] + p["win_h"]
            if zb > levels[s + 2] - 0.25:
                continue
            if use in ("offices",):
                # ribbons: the bays grouped in twos or threes between pilasters, panes on mullions
                grp = 3 if n_bay % 3 == 0 and n_bay > 3 else 2
                k = 0
                while k < n_bay:
                    take = min(grp, n_bay - k)
                    a = ub[k] - bw / 2 + PILASTER[0] / 2 + 0.25
                    b = ub[k + take - 1] + bw / 2 - PILASTER[0] / 2 - 0.25
                    holes_u.append((a, b, za, zb))
                    window(F, Bw, M, a, b, za, zb, frame_m, rng, mullion=max(1, int((b - a) / 1.15)) - 1 or 1,
                           transom=0.78, sill=True); stats["windows"] += 1
                    k += take
            elif use == "tower":
                for k in range(n_bay):
                    a, b = ub[k] - p["win_w"] / 2, ub[k] + p["win_w"] / 2
                    holes_u.append((a, b, za, zb))
                    window(F, Bw, M, a, b, za, zb, frame_m, rng, mullion=1, transom=0.7, sill=False); stats["windows"] += 1
            elif use == "shed":
                pass
            else:
                # flats and the floors over the shops: windows in PAIRS on a narrow pier (pairing), else singles
                ww = p["win_w"]
                groups = []
                if pairing and n_bay >= 2:
                    k = 0
                    while k < n_bay:
                        if n_bay - k >= 2:
                            groups.append(("pair", (ub[k] + ub[k + 1]) / 2)); k += 2
                        else:
                            groups.append(("single", ub[k])); k += 1
                else:
                    groups = [("single", u) for u in ub]
                for kind, uc in groups:
                    cols = [(uc - 0.18 - ww, uc - 0.18), (uc + 0.18, uc + 0.18 + ww)] if kind == "pair" else [(uc - ww / 2, uc + ww / 2)]
                    french = front and rng.random() < JULIET_SHARE
                    for a, b in cols:
                        zz0 = zs0 + 0.15 if french else za
                        holes_u.append((a, b, zz0, zb))
                        window(F, Bw, M, a, b, zz0, zb, frame_m, rng, transom=0.75 if french else None,
                               lintel=classical and not (use == "flats" and s % 2 == 1 and rng.random() < 0.3),
                               surround=(use == "flats" and rng.random() < 0.2), sill=not french)
                        if french:
                            juliet(F, Bd, M, a, b, zz0); stats["juliets"] += 1
                        stats["windows"] += 1
        # -------- the walls: the ground storey in its own tone, the floors over it
        zsplit = Z0 + gh
        wall_with_holes(F, Bg, Z0, zsplit, holes_g, M.wall_cur)
        wall_with_holes(F, Bw, zsplit, top_z, [h for h in holes_u] + [h for h in holes_g if h[3] > zsplit], M.wall_cur)
        # -------- the plinth, between the openings that reach the ground
        ph, pp = PLINTH
        if use != "shed":
            cuts = sorted((h[0], h[1]) for h in holes_g if h[2] < Z0 + ph)
            ext = pp if side in ("S", "N") else 0.0                             # S and N runs wrap the corners (no overlap)
            u = -ext
            for a, b in cuts + [(F.L + ext, F.L + ext)]:
                if a > u + 0.05:
                    F.box(Bt, u, a, Z0, Z0 + ph, -0.02, pp, M.base)
                u = max(u, b)
        # -------- pilasters (offices, tower, shed): at the bay divisions and the corners
        if pil:
            pw, pp2 = PILASTER
            zp0 = Z0 + (ph if use != "shed" else 0.0)
            zp1 = (levels[-1] - CORNICE[0][0]) if use != "shed" else top_z - COPING[0]
            divs = [ub[0] - bw / 2] + [ub[k] + bw / 2 for k in range(n_bay)]
            if use == "offices":
                grp = 3 if n_bay % 3 == 0 and n_bay > 3 else 2
                divs = [ub[0] - bw / 2] + [ub[min(n_bay - 1, k + grp - 1)] + bw / 2 for k in range(0, n_bay, grp)]
            for d in divs:
                if not any(h[0] < d + pw / 2 and h[1] > d - pw / 2 and h[2] < zp1 and h[3] > zp0 for h in holes_g + holes_u):
                    F.box(Bt, d - pw / 2, d + pw / 2, zp0, zp1, -0.02, pp2, M.trim_cur if use != "shed" else M.wall_cur)
    # -------- the rings round the footprint: string course, cornice, parapet, coping
    if use in ("flats", "shops", "tower") and n_up > 0:
        sh, sp = STRING
        ring(Bt, x0, x1, y0, y1, Z0 + gh - 0.05, Z0 + gh - 0.05 + sh, sp, M.trim_cur)
    deep = 0.8 + 0.4 * rng.random()             # each building's own cornice depth (variation)
    if classical:
        z = roof_z - CORNICE[0][0] - 0.05
        for h, pr in CORNICE:
            ring(Bt, x0, x1, y0, y1, z, z + h, pr * deep, M.trim_cur); z += h
    elif use == "tower":
        ring(Bt, x0, x1, y0, y1, roof_z - 0.6, roof_z - 0.2, 0.12, M.trim_cur)   # the attic band
    # the parapet: its inner face (the walls carry the outer one up to top_z) and the coping on it
    if top_z > roof_z + 0.05:
        t = PARAPET_T
        for side in ("S", "E", "N", "W"):
            F = Face(side, x0 + t, x1 - t, y0 + t, y1 - t)
            for (a, b) in ((0.0, F.L),):
                pts = [F.P(a, roof_z), F.P(a, top_z), F.P(b, top_z), F.P(b, roof_z)]
                Bt.face(pts, M.wall_cur, inward_of=F.P(F.L / 2, (roof_z + top_z) / 2, 1.0))
    ch, co = COPING
    ring(Bt, x0, x1, y0, y1, top_z, top_z + ch, co, M.metal if not classical else M.trim_cur, inset=PARAPET_T + co)
    # -------- the objects
    out = []
    t_ground = tuple(c * TONE_GROUND for c in tint)
    for B, nm, tn in ((Bw, "walls", tint), (Bg, "ground", t_ground), (Bt, "trim", tint), (Bd, "details", tint)):
        o = B.build(f"nb_{ob.name}_{nm}", col, tint=tn)
        if o is not None:
            out.append(o)
    log(f"NEIGHBOUR {ob.name}: {use}, {x1 - x0:.1f} x {y1 - y0:.1f} m, roof {roof_z:.2f}, parapet {top_z:.2f}, "
        f"{1 + n_up} storeys; " + ", ".join(f"{v} {k}" for k, v in stats.items() if v))
    return out


def build(S, names, hero_xy, log=print):
    """Model every named box in a NEIGHBOURS collection; the boxes keep their roofs."""
    col = bpy.data.collections.get("NEIGHBOURS") or bpy.data.collections.new("NEIGHBOURS")
    if col.name not in S.collection.children:
        S.collection.children.link(col)
    M = Mats(None)
    n = 0
    for name in names:
        ob = bpy.data.objects.get(name)
        if ob is None:
            log(f"NEIGHBOUR {name}: not in the scene, skipped"); continue
        model(ob, M, col, hero_xy, log=log); n += 1
    log(f"NEIGHBOURS: {n} buildings modelled, {len(col.objects)} objects")
    return col
