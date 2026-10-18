# city_neighbours.py -- the front-line neighbours of Terra & Mar, modelled (2026-10-17; user: "those specific buildings
# are in the front line adjacent to the hero ... they look like just boxes. we need to 1 - consider the plan, what that
# building is going to be? 2 - then add doors 3 - more detailed windows; better pairing, sizing organization
# 4 - building features, like cornices, window decorations etc 5 - variation in the building facade, geometrical or
# material (be subtle). it doesn't need to be too detailed like the hero; just enough to be believable").
#
# The Bradbury's city fills the parcels with boxes whose windows are DRAWN by their material (build_scene.py's
# facade_material: the bays, reveals and sills in the shader, from the box's fac_lo / fac_hi). For the buildings that
# stand in the hero's frames (FRONT_LINE, picked by measuring each building's share of every still and flyover frame,
# see the README) this module replaces the box's walls and rooftop boxes with modelled ones, in the copy only.
#
#   THE PLAN. Each building keeps the use the city gave it (its recipe, the suffix of its material: flats, shops,
#   offices, shed); the Bradbury's tower across Broadway is an APARTMENT tower and its wing shops under flats. A use
#   sets the storeys (the city's own CITY_FACADES heights, so the scale matches the rest of the city) and the ground
#   floor. Residential floors are laid out as APARTMENTS (second pass, user: "think about the apartment plan, probably 2
#   apartments per floor ... use small windows for where a bathroom would be"): every face is divided into rooms --
#   living room, bedroom, bathroom, kitchen, mirrored apartment by apartment, with the stair core in the middle of a
#   front face -- and each room gets its own window: a pair for a living room or a bedroom (so the facade reads pair,
#   space, pair, never an even grid), one kitchen window, a small high frosted window for a bathroom, the stair's
#   narrow windows at the half landings. Balconies only where homes are: the odd one on ordinary flats, Juliet rails on
#   the tower's long faces; none on shop and workshop buildings or the large blocks that read as works. The faces turned toward the hero are the FRONTS (entrances, shopfronts,
#   signs); the others get the same floors over a plainer ground floor with a service door.
#   DOORS. A residential or office entrance is a real ENTRANCE HALL (user: "the door, must be a bigger door, with a hall.
#   just like a real residential"): a wide glazed double door between sidelights under a transom, in clear glass, and
#   behind it a lit hall with a stone floor, the lift doors and the letter boxes, under a canopy. Shops have glazed
#   doors in every shopfront, sheds roll-up doors and a steel man door, back faces a service door.
#   WINDOWS. Real openings: a reveal, the glass set back in it (some with a blind down), a frame with mullions and a
#   transom, a projecting sill; offices in ribbons between pilasters, sheds in a clerestory row.
#   THE TOWER is plain rendered walls with its rooms' windows (third pass, user: "contrasting material in the tall
#   building ... crossing every window also didn't work well; for the tall building simpler is better": the concrete
#   frame of the second pass, columns and slab edges between every window, is gone). The offices' rendered pilasters
#   are cut at every floor.
#   FEATURES. A plinth, a string course, a stepped cornice under a coped parapet (flats, shops, the wing) or a metal
#   coping (offices, sheds), lintels and sills, a few small projecting balconies and Juliet rails, canopies, shop
#   fascias with sign panels, some awnings. Every box-shaped piece has a small bevel; the walls' corners are chamfered.
#   COLOUR (second and third passes, user: "some colors used are contrasting too much ... white with brick; strong
#   window colors", then "brick and beige is still contrasting. it can be the brick tinted in a slightly different
#   color"). Trims are the wall's own material: a shade lighter on render, and on brick the same brick in a slightly
#   deeper tone -- soldier-course lintels, brick sills and bands under a dark metal coping, sash windows, as the user's
#   reference has it (tests/artifacts/screens/buildings/terramar_recessed/city/references/). Frames, signs and awnings
#   are muted, the glass a neutral dark.
#   WEATHERING (cheap, in the wall material): dust rising from the base to a ragged 0.8-1.5 m, and runoff streaks hanging
#   from the coping, both from world height (the object's `nb_top` is its coping), no surface mottle.
#   ROOFS (user: "boxes at the top of the buildings, make them have a purpose with more detail"): the city's bulkhead
#   becomes a stair bulkhead with a steel door, a louvre, a lamp and a coping; its plant boxes condensers with a top
#   fan on rails, louvred air handlers or exhaust fans, with refrigerant pipes on supports; plus vent stacks and a hatch.
#   VARIATION (subtle). The ground storey a shade darker than the floors over it, a per-building choice of frame
#   colour, cornice depth and room mix from a seeded random generator, the city's own per-building tint kept.
# Each box keeps its footprint, height and roof plane, so the city's layout, shadows and skyline are unchanged.
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
import math
import random

import bpy

Z0 = 0.15                     # the boxes' wall foot (their UVs start there; the pavement top is 0.201)
SEED = 1017

# The city's storeys (build_scene.py CITY_FACADES: storey_h, bay_w, window_w, window_h, sill_h, ground storey)
USES = {
    "flats":   dict(storey=4.0, bay=2.9, win_w=1.35, win_h=2.0, sill=1.0, ground=4.0),
    "offices": dict(storey=4.4, bay=3.3, win_w=2.0, win_h=2.4, sill=0.9, ground=4.4),
    "shops":   dict(storey=4.2, bay=3.0, win_w=1.4, win_h=2.0, sill=1.0, ground=4.8),
    "shed":    dict(storey=6.5, bay=4.0, win_w=1.6, win_h=1.2, sill=3.8, ground=6.5),
    "tower":   dict(storey=3.15, bay=3.6, win_w=1.3, win_h=1.7, sill=0.8, ground=3.9),   # twelve storeys in its 39 m
}
# the Bradbury's wing keeps its own storeys (NEIGHBOUR_WING_FACADE: a 3.6 m shop storey under a 3.3 m one)
OVERRIDE = {"ctx_neighbour_wing": dict(storey=3.3, bay=3.6, win_w=1.3, win_h=1.5, sill=0.9, ground=3.6)}
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

# ---- the apartment plan
ROOM_W = {"living": 4.4, "bedroom": 3.4, "bath": 2.0, "kitchen": 3.0}
ROOM_SEQ = ["living", "bedroom", "bath", "kitchen", "bedroom", "bath", "bedroom"]   # from an apartment's outer end inward
APT_W = 12.5                  # an apartment's share of a face, about
CORE_W = 3.6                  # the stair core on a front face (the entrance hall under it)
END_PIER = 0.7                # wall kept at a face's ends
PAIR_GAP = 0.32               # the pier inside a window pair
WIN_W = {"living": 1.3, "bedroom": 1.1, "kitchen": 1.3, "bath": 0.6, "core": 0.8}
BATH_H = 0.75                 # a bathroom window's height (its head on the others' line)
BALCONY_SHARE = 0.06          # living rooms over the ground floor of a front face opening onto a small balcony (after the first)
BALCONY_FIRST = 0.3           # the chance of a building's first balcony at each eligible living room (none guaranteed)
JULIET_SHARE = 0.03
BALCONY_MAX_DEPTH = 30.0      # a flats block deeper than this both ways reads as a works or a warehouse: no balconies
# (user 2026-10-17: "some buildings were supposed to be factories it seems. but they have balconies ... reduce it": shop
# and workshop buildings, the large blocks and the offices get none; only ordinary flats and the tower keep any)
TOWER_JULIET_FROM = 4         # the tower's living rooms open behind Juliet rails from this storey up (ground = 1)
# ---- pieces
REVEAL = 0.18
REVEAL_SHOP = 0.25
FRAME_W, FRAME_D = 0.06, 0.05
SILL = (0.08, 0.07, 0.05)     # overhang each side, height, projection
LINTEL = (0.10, 0.18, 0.03)
PLINTH = (0.60, 0.025)
STRING = (0.20, 0.05)
CORNICE = ((0.40, 0.025), (0.15, 0.18), (0.06, 0.24))   # (height, projection) bottom-up: frieze, corona, cap
COPING = (0.10, 0.05)
PARAPET_T = 0.25
PILASTER = (0.45, 0.04)       # width, projection (was 8 cm: user, "reduce the depth of the vertical parts")
JOINT = 0.02                  # a joint where a rendered piece is cut floor by floor
CANOPY_T = 0.18
BEVEL = 0.012                 # every box piece's edges; the walls' corners are chamfered this much
HALL = dict(width=3.4, height=3.3, depth=3.0, door=1.8, door_h=2.5, set_back=0.25)
HALL_LIGHT = 30.0             # the hall's ceiling panels (the scene's exposure is -4.29: a lit hall, not a glare)
TONE_GROUND = 0.93
TONE_TRIM = 1.07              # trims: the wall's own material a shade lighter
BRICK_TRIM_MUL = (0.86, 0.79, 0.76)    # on brick: the same brick, a slightly deeper and browner tone (was a buff stone)
BRICK_BAND = (0.26, 0.03)     # a brick building's band under the coping: height, projection (its cornice)
SASH = 0.6                    # a brick building's windows: a sash bar this far up
TONE_PLINTH = 0.88
# ---- weathering (wall material)
DUST_H = (0.8, 1.5)          # the dust line's height over the wall foot, ragged over noise
DUST_AMT = 1.0                # (a sunlit wall sits in the film's shoulder: 0.68 at the foot read as 5 levels; 0.4 reads)
DUST_TINT = (0.34, 0.29, 0.23)
RUN_L = (0.5, 1.8)            # the runoff's reach under the coping
RUN_AMT = 0.55
RUN_TINT = (0.50, 0.48, 0.46)
# ---- palette (muted)
BLIND_SHARE = 0.2
SIGN_COLOURS = [(0.09, 0.09, 0.085), (0.11, 0.095, 0.08), (0.075, 0.08, 0.085), (0.16, 0.15, 0.13), (0.10, 0.105, 0.09)]
AWNING_COLOURS = [(0.18, 0.17, 0.15), (0.13, 0.12, 0.11), (0.22, 0.19, 0.15), (0.11, 0.12, 0.12)]
FRAME_COLOURS = {"bronze": ((0.035, 0.030, 0.026), 0.5, 0.4), "grey": ((0.07, 0.07, 0.072), 0.45, 0.5),
                 "offwhite": ((0.36, 0.35, 0.33), 0.5, 0.0), "taupe": ((0.12, 0.105, 0.09), 0.5, 0.2)}
DOOR_COLOURS = [(0.05, 0.05, 0.048), (0.07, 0.055, 0.045), (0.045, 0.05, 0.055)]
AWNING_SHARE = 0.35


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


def _plain(name, colour, rough=0.6, metal=0.0, spec=0.5, bump=None, transmission=0.0, haze=True, emit=0.0):
    m = bpy.data.materials.get(name)
    if m is not None:
        return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*colour, 1.0); b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal; b.inputs["Specular IOR Level"].default_value = spec
    if transmission:
        b.inputs["Transmission Weight"].default_value = transmission; b.inputs["IOR"].default_value = 1.45
    if emit:
        b.inputs["Emission Color"].default_value = (1.0, 0.86, 0.68, 1.0); b.inputs["Emission Strength"].default_value = emit
    if bump in ("corrugated", "grille", "louvre"):
        nt = m.node_tree
        tc = nt.nodes.new('ShaderNodeTexCoord'); wv = nt.nodes.new('ShaderNodeTexWave'); bp = nt.nodes.new('ShaderNodeBump')
        wv.wave_type = 'BANDS'
        wv.bands_direction = 'Z' if bump != "grille" else 'X'
        wv.inputs["Scale"].default_value = {"corrugated": 0.5, "grille": 2.5, "louvre": 1.6}[bump]
        nt.links.new(tc.outputs["Object"], wv.inputs["Vector"]); nt.links.new(wv.outputs["Fac"], bp.inputs["Height"])
        bp.inputs["Strength"].default_value = 0.4; bp.inputs["Distance"].default_value = 0.02
        nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
    return _hazed(m) if haze else m


def weather_group():
    """NB_weather: a colour in, the colour with the base dust and the coping runoff multiplied in, from world height and
    the object's nb_top (its coping)."""
    ng = bpy.data.node_groups.get("NB_weather")
    if ng is not None:
        return ng
    ng = bpy.data.node_groups.new("NB_weather", 'ShaderNodeTree')
    ng.interface.new_socket(name="Color", in_out='INPUT', socket_type='NodeSocketColor')
    ng.interface.new_socket(name="Color", in_out='OUTPUT', socket_type='NodeSocketColor')
    N, L = ng.nodes, ng.links
    gi = N.new('NodeGroupInput'); go = N.new('NodeGroupOutput')
    geo = N.new('ShaderNodeNewGeometry'); sep = N.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs["Position"], sep.inputs[0])
    top = N.new('ShaderNodeAttribute'); top.attribute_type = 'OBJECT'; top.attribute_name = "nb_top"

    def noise(vec, scale, detail=2.0):
        n = N.new('ShaderNodeTexNoise'); n.inputs["Scale"].default_value = scale; n.inputs["Detail"].default_value = detail
        L.new(vec, n.inputs["Vector"]); return n.outputs["Fac"]

    def mr(val, fmin, fmax, tmin, tmax, smooth=False):
        n = N.new('ShaderNodeMapRange'); n.clamp = True
        if smooth:
            n.interpolation_type = 'SMOOTHSTEP'
        for sock, v in (("Value", val), ("From Min", fmin), ("From Max", fmax), ("To Min", tmin), ("To Max", tmax)):
            if hasattr(v, "is_output"):
                L.new(v, n.inputs[sock])
            else:
                n.inputs[sock].default_value = v
        return n.outputs["Result"]

    def math(op, a, b):
        n = N.new('ShaderNodeMath'); n.operation = op
        for i, v in enumerate((a, b)):
            if hasattr(v, "is_output"):
                L.new(v, n.inputs[i])
            else:
                n.inputs[i].default_value = v
        return n.outputs["Value"]

    def mul_mix(colour, fac, tint):
        n = N.new('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = 'MULTIPLY'
        L.new(fac, n.inputs["Factor"])
        a = next(s for s in n.inputs if s.identifier == "A_Color"); b = next(s for s in n.inputs if s.identifier == "B_Color")
        L.new(colour, a); b.default_value = (*tint, 1.0)
        return next(s for s in n.outputs if s.identifier == "Result_Color")

    pos = geo.outputs["Position"]
    # the dust: full at the foot, gone by a height that wanders along the wall
    h = mr(noise(pos, 0.45), 0.35, 0.65, DUST_H[0], DUST_H[1])
    dust = mr(math('SUBTRACT', sep.outputs["Z"], Z0), 0.0, h, 1.0, 0.0)          # linear: it fades all the way up
    c1 = mul_mix(gi.outputs["Color"], math('MULTIPLY', dust, DUST_AMT), DUST_TINT)
    # the runoff: under the coping, its reach wandering, broken into vertical streaks (a noise stretched in z)
    reach = mr(noise(pos, 0.35), 0.35, 0.65, RUN_L[0], RUN_L[1])
    band = mr(math('SUBTRACT', top.outputs["Fac"], sep.outputs["Z"]), 0.0, reach, 1.0, 0.0, smooth=True)
    vm = N.new('ShaderNodeVectorMath'); vm.operation = 'MULTIPLY'; vm.inputs[1].default_value = (5.0, 5.0, 0.25)
    L.new(pos, vm.inputs[0])
    streak = mr(noise(vm.outputs["Vector"], 1.0, 3.0), 0.47, 0.62, 0.0, 1.0)
    run = math('MULTIPLY', math('MULTIPLY', band, streak), RUN_AMT)
    L.new(mul_mix(c1, run, RUN_TINT), go.inputs["Color"])
    return ng


def wall_material(src):
    """A copy of a city facade material with its drawn windows switched off (the plain set, its tint and its haze) and
    the weathering multiplied into its colour."""
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
    b = nt.nodes.get("Principled BSDF") or next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    g = nt.nodes.new('ShaderNodeGroup'); g.node_tree = weather_group()
    bc = b.inputs["Base Color"]
    if bc.is_linked:
        src_sock = bc.links[0].from_socket; nt.links.remove(bc.links[0]); nt.links.new(src_sock, g.inputs["Color"])
    else:
        g.inputs["Color"].default_value = bc.default_value
    nt.links.new(g.outputs["Color"], bc)
    return m


class Mats:
    def __init__(self):
        self.glass = _plain("NB_glass", (0.030, 0.034, 0.038), rough=0.06, spec=0.5)
        self.blind = _plain("NB_glass_blind", (0.20, 0.19, 0.17), rough=0.6, spec=0.3)
        self.frosted = _plain("NB_glass_frosted", (0.30, 0.31, 0.31), rough=0.35, spec=0.4)
        self.clear = _plain("NB_glass_clear", (0.92, 0.94, 0.94), rough=0.02, transmission=1.0)
        self.frames = {k: _plain(f"NB_frame_{k}", c, rough=r, metal=mt) for k, (c, r, mt) in FRAME_COLOURS.items()}
        self.doors = [_plain(f"NB_door_{i}", c, rough=0.45) for i, c in enumerate(DOOR_COLOURS)]
        self.door_wood = _plain("NB_door_wood", (0.09, 0.055, 0.035), rough=0.55)
        self.metal = _plain("NB_metal", (0.20, 0.20, 0.205), rough=0.4, metal=0.7)
        self.galv = _plain("NB_galvanised", (0.42, 0.42, 0.42), rough=0.45, metal=0.8)
        self.unit = _plain("NB_unit_casing", (0.45, 0.45, 0.44), rough=0.5, metal=0.3)
        self.louvre = _plain("NB_louvre", (0.30, 0.30, 0.30), rough=0.5, metal=0.5, bump="louvre")
        self.grille = _plain("NB_fan_grille", (0.03, 0.03, 0.03), rough=0.5, metal=0.4, bump="grille")
        self.rollup = _plain("NB_rollup", (0.36, 0.36, 0.36), rough=0.5, metal=0.6, bump="corrugated")
        self.kick = _plain("NB_kick", (0.04, 0.04, 0.04), rough=0.5, metal=0.3)
        self.stone = _plain("NB_hall_floor", (0.32, 0.30, 0.27), rough=0.3)
        self.light = _plain("NB_hall_light", (0.9, 0.9, 0.9), rough=0.5, haze=False, emit=HALL_LIGHT)
        self.interior = _plain("NB_interior", (0.015, 0.015, 0.015), rough=0.9)
        self.pipe = _plain("NB_pipe", (0.12, 0.12, 0.12), rough=0.6)
        self.signs = [_plain(f"NB_sign_{i}", c, rough=0.5) for i, c in enumerate(SIGN_COLOURS)]
        self.awnings = [_plain(f"NB_awning_{i}", c, rough=0.85) for i, c in enumerate(AWNING_COLOURS)]


def tinted_material(src, mul, suffix):
    """A copy of a (plain) wall material with its colour multiplied before the weathering: the same set in another tone,
    for materials that do not read the city's per-object tint (the Bradbury's neighbours)."""
    name = f"{src.name}_{suffix}"
    m = bpy.data.materials.get(name)
    if m is not None:
        return m
    m = src.copy(); m.name = name; nt = m.node_tree
    g = next(n for n in nt.nodes if n.type == 'GROUP' and n.node_tree and n.node_tree.name == "NB_weather")
    vm = nt.nodes.new('ShaderNodeVectorMath'); vm.operation = 'MULTIPLY'; vm.inputs[1].default_value = mul
    if g.inputs["Color"].is_linked:
        lk = g.inputs["Color"].links[0]; srcs = lk.from_socket; nt.links.remove(lk); nt.links.new(srcs, vm.inputs[0])
    else:
        vm.inputs[0].default_value = tuple(g.inputs["Color"].default_value)[:3]
    nt.links.new(vm.outputs["Vector"], g.inputs["Color"])
    return m


# ---------------------------------------------------------------- geometry
class Builder:
    """One object's mesh: faces and closed pieces (boxes, rings, cylinders share their vertices so a Bevel modifier
    rounds their edges), each face in a material slot, UVs in world metres as the city boxes have them."""

    def __init__(self):
        self.v, self.f, self.mi, self.mats = [], [], [], []

    def slot(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def face(self, pts, m, inward_of=None):
        if inward_of is not None:
            a, b, c = pts[0], pts[1], pts[2]
            n = _cross(_sub(b, a), _sub(c, a))
            cen = tuple(sum(p[k] for p in pts) / len(pts) for k in range(3))
            if _dot(n, _sub(cen, inward_of)) < 0:
                pts = list(reversed(pts))
        k = len(self.v); self.v += [tuple(p) for p in pts]; self.f.append(tuple(range(k, k + len(pts)))); self.mi.append(self.slot(m))

    def box(self, lo, hi, m):
        x0, y0, z0 = lo; x1, y1, z1 = hi
        if x1 - x0 < 1e-4 or y1 - y0 < 1e-4 or z1 - z0 < 1e-4:
            return
        k = len(self.v); s = self.slot(m)
        self.v += [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        for q in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            self.f.append(tuple(k + i for i in q)); self.mi.append(s)

    def cylinder(self, cx, cy, z0, z1, r, m, n=12, bottom=False):
        k = len(self.v); s = self.slot(m)
        for z in (z0, z1):
            self.v += [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n), z) for i in range(n)]
        for i in range(n):
            j = (i + 1) % n
            self.f.append((k + i, k + j, k + n + j, k + n + i)); self.mi.append(s)
        self.f.append(tuple(k + n + i for i in range(n))); self.mi.append(s)
        if bottom:
            self.f.append(tuple(k + i for i in reversed(range(n)))); self.mi.append(s)

    def ring(self, x0, x1, y0, y1, z0, z1, out, m, inset=0.02):
        """A closed band round a footprint: from just inside the wall line to `out` beyond it, z0..z1 (shared vertices:
        outer sides, top and underside)."""
        k = len(self.v); s = self.slot(m)
        O = [(x0 - out, y0 - out), (x1 + out, y0 - out), (x1 + out, y1 + out), (x0 - out, y1 + out)]
        I = [(x0 + inset, y0 + inset), (x1 - inset, y0 + inset), (x1 - inset, y1 - inset), (x0 + inset, y1 - inset)]
        for z in (z0, z1):
            self.v += [(p[0], p[1], z) for p in O]
        for z in (z0, z1):
            self.v += [(p[0], p[1], z) for p in I]
        o0, o1, i0, i1 = k, k + 4, k + 8, k + 12
        for a in range(4):
            b = (a + 1) % 4
            self.f.append((o0 + a, o0 + b, o1 + b, o1 + a)); self.mi.append(s)      # outer side
            self.f.append((o1 + a, o1 + b, i1 + b, i1 + a)); self.mi.append(s)      # top
            self.f.append((o0 + b, o0 + a, i0 + a, i0 + b)); self.mi.append(s)      # underside

    def build(self, name, col, tint=(1.0, 1.0, 1.0), top=0.0, bevel=False):
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
        ob["nb_top"] = float(top)              # the weathering's coping height
        if bevel:
            md = ob.modifiers.new("bevel", 'BEVEL'); md.width = BEVEL; md.segments = 1
            md.limit_method = 'ANGLE'; md.angle_limit = math.radians(40.0); md.use_clamp_overlap = True
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


def wall_with_holes(F, B, z0, z1, holes, m, u0, u1):
    """The wall plane from z0 to z1 over u0..u1, minus the holes (u0, u1, z0, z1): horizontal strips cut at every hole
    edge, each strip's covered spans left out."""
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


def corner_chamfers(B, x0, x1, y0, y1, z0, z1, m):
    """The four corners cut by BEVEL: each face's wall stops BEVEL short of the corner and a narrow diagonal strip joins them."""
    b = BEVEL; c = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    for (pa, pb) in (((x1 - b, y0), (x1, y0 + b)), ((x1, y1 - b), (x1 - b, y1)), ((x0 + b, y1), (x0, y1 - b)), ((x0, y0 + b), (x0 + b, y0))):
        B.face([(pa[0], pa[1], z0), (pb[0], pb[1], z0), (pb[0], pb[1], z1), (pa[0], pa[1], z1)], m, inward_of=c)


def reveal(F, B, u0, u1, z0, z1, depth, m, bottom=True, d0=0.0):
    """The sides of an opening from d0 behind the wall face back to the depth, facing into the opening."""
    c = F.P((u0 + u1) / 2, (z0 + z1) / 2, -(d0 + depth) / 2)
    sides = [(F.P(u0, z0, -d0), F.P(u0, z0, -depth), F.P(u0, z1, -depth), F.P(u0, z1, -d0)),
             (F.P(u1, z0, -d0), F.P(u1, z1, -d0), F.P(u1, z1, -depth), F.P(u1, z0, -depth)),
             (F.P(u0, z1, -d0), F.P(u0, z1, -depth), F.P(u1, z1, -depth), F.P(u1, z1, -d0))]
    if bottom:
        sides.append((F.P(u0, z0, -d0), F.P(u1, z0, -d0), F.P(u1, z0, -depth), F.P(u0, z0, -depth)))
    for q in sides:
        cen = tuple(sum(p[k] for p in q) / 4 for k in range(3))
        B.face(list(q), m, inward_of=tuple(2 * cen[k] - c[k] for k in range(3)))


class Ctx:
    """What the pieces of one building share: its materials and builders."""
    pass


def window(X, F, u0, u1, z0, z1, depth=REVEAL, mullion=None, transom=None, sill=True, lintel=False, glass=None):
    """A modelled window: reveal, glass at the reveal's depth (some with a blind), a frame with mullions and transom, a
    sill and an optional lintel. Returns the hole."""
    M, B = X.M, X.Bd
    reveal(F, B, u0, u1, z0, z1, depth, X.wall)
    g = glass or (M.blind if X.rng.random() < BLIND_SHARE else M.glass)
    F.quad(B, u0, u1, z0, z1, -depth, g)
    fo0, fo1 = -depth, -depth + FRAME_D
    fm = X.frame
    F.box(B, u0, u0 + FRAME_W, z0, z1, fo0, fo1, fm); F.box(B, u1 - FRAME_W, u1, z0, z1, fo0, fo1, fm)
    F.box(B, u0 + FRAME_W, u1 - FRAME_W, z0, z0 + FRAME_W, fo0, fo1, fm)
    F.box(B, u0 + FRAME_W, u1 - FRAME_W, z1 - FRAME_W, z1, fo0, fo1, fm)
    w = u1 - u0
    if transom is None and X.sash and glass is None and w >= 0.8:
        transom = SASH
    n_mul = mullion if mullion is not None else (1 if w > 1.15 else 0)
    for k in range(1, n_mul + 1):
        um = u0 + w * k / (n_mul + 1)
        F.box(B, um - FRAME_W * 0.6, um + FRAME_W * 0.6, z0 + FRAME_W, z1 - FRAME_W, fo0, fo1, fm)
    if transom:
        zt = z0 + (z1 - z0) * transom
        F.box(B, u0 + FRAME_W, u1 - FRAME_W, zt - FRAME_W * 0.6, zt + FRAME_W * 0.6, fo0, fo1, fm)
    if sill:
        ov, h, pr = SILL
        F.box(X.Bt, u0 - ov, u1 + ov, z0 - h, z0, -0.02, pr, X.trim)
    if lintel:
        ov, h, pr = LINTEL
        F.box(X.Bt, u0 - ov, u1 + ov, z1, z1 + h, -0.02, pr, X.trim)
    X.stats["windows"] = X.stats.get("windows", 0) + 1
    return (u0, u1, z0, z1)


def door(X, F, u0, u1, z0, z1, kind, depth=0.3, transom_h=0.0, own_reveal=True):
    """A door in its opening: 'panel' (painted or wood leaves), 'glass' (framed glazed leaves), 'steel' (a man door).
    own_reveal=False: the door stands inside another opening (a shopfront) that has the reveal already."""
    M, B, fm = X.M, X.Bd, X.frame
    if own_reveal:
        reveal(F, B, u0, u1, z0, z1, depth, X.wall, bottom=False)
    zl = z1 - transom_h
    leaves = 2 if u1 - u0 > 1.4 else 1
    fo0, fo1 = -depth, -depth + 0.06
    if transom_h > 0:
        F.quad(B, u0, u1, zl, z1, -depth, M.glass)
        F.box(B, u0, u1, zl - 0.05, zl + 0.03, fo0, fo1, fm)
    if kind == "glass":
        F.quad(B, u0, u1, z0, zl, -depth, M.glass)
    else:
        F.quad(B, u0, u1, z0, zl, -depth, M.door_wood if kind == "panel" and X.rng.random() < 0.5 else
               (X.rng.choice(M.doors) if kind == "panel" else M.metal))
    F.box(B, u0, u0 + 0.07, z0, z1, fo0, fo1, fm); F.box(B, u1 - 0.07, u1, z0, z1, fo0, fo1, fm)
    F.box(B, u0, u1, z1 - 0.07, z1, fo0, fo1, fm)
    w = (u1 - u0) / leaves
    for k in range(leaves):
        a, b = u0 + k * w, u0 + (k + 1) * w
        if kind == "glass":
            F.box(B, a + 0.03, a + 0.11, z0, zl, fo0, fo1, fm); F.box(B, b - 0.11, b - 0.03, z0, zl, fo0, fo1, fm)
            F.box(B, a + 0.03, b - 0.03, z0, z0 + 0.18, fo0, fo1, fm)
            F.box(B, a + 0.11, b - 0.11, z0 + 1.0, z0 + 1.06, fo1, fo1 + 0.05, M.metal)
        else:
            F.box(B, b - 0.14, b - 0.08, z0 + 0.98, z0 + 1.04, -depth, -depth + 0.07, M.metal)
    F.box(B, u0 - 0.05, u1 + 0.05, z0 - 0.02, z0 + 0.03, -depth, 0.05, X.trim)   # a threshold
    X.stats["doors"] = X.stats.get("doors", 0) + 1


def entrance_hall(X, F, uc, width, z0, height, depth):
    """A residential (or office) entrance: a wide glazed double door between sidelights under a transom, in clear glass,
    set back in its opening; behind it a lit hall -- stone floor, plastered walls and ceiling, lift doors and letter
    boxes on the back wall, two ceiling panels -- and a canopy over the opening. Returns the hole."""
    M, B, fm = X.M, X.Bd, X.frame
    a, b = uc - width / 2, uc + width / 2
    z1 = z0 + height
    sb = HALL["set_back"]
    reveal(F, B, a, b, z0, z1, sb, X.trim, bottom=False)                              # the opening's reveal, in the trim
    # the hall: side walls, ceiling, floor, back wall
    for u in (a, b):
        B.face([F.P(u, z0, -sb), F.P(u, z0, -depth), F.P(u, z1, -depth), F.P(u, z1, -sb)], X.trim,
               inward_of=F.P(a - 1.0 if u == a else b + 1.0, (z0 + z1) / 2, -depth / 2))
    B.face([F.P(a, z1, -sb), F.P(b, z1, -sb), F.P(b, z1, -depth), F.P(a, z1, -depth)], X.trim, inward_of=F.P(uc, z1 + 1.0, -depth / 2))
    B.face([F.P(a, z0 + 0.01, -sb), F.P(b, z0 + 0.01, -sb), F.P(b, z0 + 0.01, -depth), F.P(a, z0 + 0.01, -depth)], M.stone,
           inward_of=F.P(uc, z0 - 1.0, -depth / 2))
    F.quad(B, a, b, z0, z1, -depth, X.trim)
    lw = 1.1                                                                           # the lift's doors
    F.box(B, uc - lw / 2 - 0.12, uc + lw / 2 + 0.12, z0, z0 + 2.35, -depth, -depth + 0.04, M.metal)
    F.box(B, uc - lw / 2, uc + lw / 2, z0, z0 + 2.2, -depth + 0.04, -depth + 0.05, M.galv)
    F.box(B, uc - 0.01, uc + 0.01, z0, z0 + 2.2, -depth + 0.05, -depth + 0.06, M.metal)
    mb = (a + 0.25, a + 1.05) if X.rng.random() < 0.5 else (b - 1.05, b - 0.25)      # the letter boxes
    F.box(B, mb[0], mb[1], z0 + 1.0, z0 + 1.6, -depth, -depth + 0.18, M.metal)
    for i in range(4):
        for j in range(3):
            u = mb[0] + 0.05 + i * 0.19; z = z0 + 1.05 + j * 0.18
            F.box(B, u, u + 0.15, z, z + 0.14, -depth + 0.18, -depth + 0.19, M.galv)
    for k in (0.33, 0.66):                                                             # the ceiling's light panels
        F.box(B, uc - 0.3, uc + 0.3, z1 - 0.03, z1 - 0.005, -sb - (depth - sb) * k - 0.3, -sb - (depth - sb) * k + 0.3, M.light)
    # the front: sidelights, double door, transom -- clear glass in the frame colour
    dw, dh = HALL["door"], z0 + HALL["door_h"]
    da, db = uc - dw / 2, uc + dw / 2
    F.quad(B, a, b, z0, z1, -sb, M.clear)
    fo = (-sb - 0.03, -sb + 0.05)
    for u in (a, da, db, b):
        F.box(B, u - 0.05, u + 0.05, z0, z1, *fo, fm)
    F.box(B, a, b, dh - 0.05, dh + 0.05, *fo, fm); F.box(B, a, b, z1 - 0.08, z1, *fo, fm)
    F.box(B, a, da, z0, z0 + 0.15, *fo, fm); F.box(B, db, b, z0, z0 + 0.15, *fo, fm)
    for la, lb in ((da, uc), (uc, db)):                                               # the two leaves' stiles and pulls
        F.box(B, la + 0.04, la + 0.1, z0, dh, *fo, fm); F.box(B, lb - 0.1, lb - 0.04, z0, dh, *fo, fm)
        hx = lb - 0.18 if la == da else la + 0.18
        F.box(B, hx - 0.015, hx + 0.015, z0 + 0.8, z0 + 1.6, fo[1], fo[1] + 0.06, M.galv)
    F.box(B, a - 0.1, b + 0.1, z0 - 0.02, z0 + 0.02, -sb, 0.6, X.trim)               # the threshold
    F.box(X.Bd, uc - width / 2 - 0.6, uc + width / 2 + 0.6, z1 + 0.25, z1 + 0.25 + CANOPY_T, -0.02, 1.7, M.metal)   # canopy
    X.stats["halls"] = X.stats.get("halls", 0) + 1
    X.stats["doors"] = X.stats.get("doors", 0) + 1
    return (a, b, z0, z1)


def awning(X, F, m, u0, u1, z_top, depth=1.1, drop=0.55, valance=0.22):
    B = X.Bd
    zf = z_top - drop
    pts = [F.P(u0, z_top, 0.02), F.P(u1, z_top, 0.02), F.P(u1, zf, depth), F.P(u0, zf, depth)]
    B.face(pts, m, inward_of=F.P((u0 + u1) / 2, z_top - 2.0, 0.0))
    B.face(list(reversed(pts)), m)
    F.quad(B, u0, u1, zf - valance, zf, depth, m)
    for u in (u0, u1):
        B.face([F.P(u, z_top, 0.02), F.P(u, zf, depth), F.P(u, zf - valance, depth), F.P(u, zf - valance * 0.5, 0.02)], m)


def rail(X, F, u0, u1, z0, out0, out1, sides=False):
    """A metal railing: top and bottom rails and bars, along the front (and back to the wall on both sides)."""
    B, M = X.Bd, X.M
    F.box(B, u0, u1, z0 + 0.05, z0 + 0.09, out1 - 0.04, out1, M.metal)
    F.box(B, u0, u1, z0 + 1.0, z0 + 1.05, out1 - 0.05, out1 + 0.01, M.metal)
    n = max(3, int((u1 - u0) / 0.12))
    for k in range(n + 1):
        u = u0 + (u1 - u0) * k / n
        F.box(B, u - 0.011, u + 0.011, z0 + 0.09, z0 + 1.0, out1 - 0.03, out1 - 0.01, M.metal)
    if sides:
        for u in (u0, u1 - 0.04):
            F.box(B, u, u + 0.04, z0 + 1.0, z0 + 1.05, out0, out1, M.metal)
            m = max(2, int((out1 - out0) / 0.12))
            for k in range(m):
                o = out0 + (out1 - out0) * (k + 0.5) / m
                F.box(B, u + 0.01, u + 0.03, z0 + 0.05, z0 + 1.0, o - 0.011, o + 0.011, M.metal)


def balcony(X, F, u0, u1, z_floor):
    """A small projecting balcony: a slab in the trim's stone and a metal railing round it."""
    d = 1.05
    F.box(X.Bt, u0, u1, z_floor - 0.16, z_floor, -0.02, d, X.trim)
    rail(X, F, u0 + 0.03, u1 - 0.03, z_floor, 0.0, d - 0.03, sides=True)
    X.stats["balconies"] = X.stats.get("balconies", 0) + 1


# ---------------------------------------------------------------- the apartment plan
def compose(L, rng, core):
    """A face's panels (u0, u1, kind): apartments of rooms from each apartment's outer end inward, mirrored apartment by
    apartment, with the stair core in the middle when `core` (a front face)."""
    def rooms(W):
        seq, w = [], 0.0
        for kind in ROOM_SEQ:
            if w + ROOM_W[kind] > W * 1.12:
                break
            seq.append(kind); w += ROOM_W[kind]
        if not seq:
            seq, w = ["living"], ROOM_W["living"]
        k = W / w
        return [(kind, ROOM_W[kind] * k) for kind in seq]

    usable = L - 2 * END_PIER
    panels = []
    if core and usable > CORE_W + 6.0:
        half = (usable - CORE_W) / 2
        u = END_PIER
        for kind, w in rooms(half):
            panels.append((u, u + w, kind)); u += w
        panels.append((u, u + CORE_W, "core")); u += CORE_W
        for kind, w in reversed(rooms(half)):
            panels.append((u, u + w, kind)); u += w
        return panels
    n = max(1, int(round(usable / APT_W)))
    W = usable / n
    u = END_PIER
    for i in range(n):
        seq = rooms(W)
        if i % 2 == 1:
            seq = list(reversed(seq))
        for kind, w in seq:
            panels.append((u, u + w, kind)); u += w
    return panels


def residential_floor(X, F, panels, zs0, storey, p, ground, front, top, floor_no=1, long_face=True):
    """One residential floor's windows by room: pairs for living rooms and bedrooms, one kitchen window, a small high
    frosted bathroom window, the stair core's narrow window at the half landing; a few balconies and Juliet rails."""
    holes = []
    head = zs0 + p["sill"] + p["win_h"]
    lift = 0.15 if ground else 0.0
    for (u0, u1, kind) in panels:
        uc = (u0 + u1) / 2
        room = u1 - u0
        if kind == "core":
            if ground:
                continue                                     # the entrance hall stands under the core
            zc0 = zs0 + storey * 0.5 - 0.35
            zc1 = min(zc0 + 1.5, top - 0.3)
            if zc1 - zc0 > 0.6:
                holes.append(window(X, F, uc - WIN_W["core"] / 2, uc + WIN_W["core"] / 2, zc0, zc1, sill=True, lintel=X.classical))
            continue
        w = WIN_W[kind]
        if kind == "bath":
            holes.append(window(X, F, uc - w / 2, uc + w / 2, head - BATH_H, head, glass=X.M.frosted, sill=True, lintel=X.classical))
            continue
        if kind == "kitchen":
            holes.append(window(X, F, uc - w / 2, uc + w / 2, zs0 + p["sill"] + 0.25 + lift, head, lintel=X.classical))
            continue
        pair = room >= 2 * w + PAIR_GAP + 0.5
        cols = [(uc - PAIR_GAP / 2 - w, uc - PAIR_GAP / 2), (uc + PAIR_GAP / 2, uc + PAIR_GAP / 2 + w)] if pair else [(uc - w / 2, uc + w / 2)]
        z0 = zs0 + p["sill"] + lift - (0.25 if kind == "living" else 0.0)
        # a small balcony: the first one likely (each apartment building gets one somewhere), the rest rare
        if X.tower:
            # the tower (user 2026-10-17: "balconies will be on every floor after the 3rd floor, and they must be
            # symmetrical on both sides of the building. make the balcony a juliet balcony"): every living room from the
            # 4th floor up opens behind a Juliet rail; then "install only on the side windows of the larger faces": the
            # living rooms at both ends of the two long faces (the mirrored apartments' ends, so the rails stand
            # symmetrically), none on the short faces
            bal, jul = False, long_face and kind == "living" and floor_no >= TOWER_JULIET_FROM
        elif not X.balconies:
            bal = jul = False
        else:
            bal = (not ground) and front and kind == "living" and X.rng.random() < (BALCONY_SHARE if X.balcony_done else BALCONY_FIRST)
            jul = (not ground) and (not bal) and front and X.rng.random() < JULIET_SHARE
        if bal or jul:
            z0 = zs0 + 0.12
        for (a, b) in cols:
            holes.append(window(X, F, a, b, z0, head, transom=0.78 if (bal or jul) else None, sill=not (bal or jul),
                                lintel=X.classical))
            if jul:
                rail(X, F, a - 0.04, b + 0.04, z0, 0.0, 0.1); X.stats["juliets"] = X.stats.get("juliets", 0) + 1
        if bal:
            balcony(X, F, cols[0][0] - 0.3, cols[-1][1] + 0.3, zs0 + 0.12)
            X.balcony_done = True
    return holes


# ---------------------------------------------------------------- the box's own mesh: walls and roof boxes out
def _footprint(ob):
    vs = [ob.matrix_world @ v.co for v in ob.data.vertices]
    return min(v.x for v in vs), max(v.x for v in vs), min(v.y for v in vs), max(v.y for v in vs)


def _strip(ob, wall_slot, x0, x1, y0, y1):
    """The box's own mesh, made local, without its walls and parapet (the wall-material faces at the footprint's edge,
    and its underside) and without its rooftop boxes, whose boxes are returned for the roof kit: the roof plane stays.
    Returns (roof z, wall top z, [(x0, x1, y0, y1, z0, z1, kind)])."""
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
        elif f.normal.z > 0.9 and not near:
            roof_z = min(zs) if roof_z is None else min(roof_z, min(zs))
    roof_z = roof_z if roof_z is not None else top_z - 0.9
    # the rooftop boxes: every remaining face over the roof plane, grouped into boxes by touching extents
    up = [f for f in bm.faces if f not in drop and max((mw @ v.co).z for v in f.verts) > roof_z + 0.05]
    boxes = []
    for f in up:
        ps = [mw @ v.co for v in f.verts]
        bb = [min(p.x for p in ps), max(p.x for p in ps), min(p.y for p in ps), max(p.y for p in ps), min(p.z for p in ps), max(p.z for p in ps)]
        kind = "bulkhead" if f.material_index == wall_slot else "plant"
        boxes.append((bb, kind))
    merged = []
    for bb, kind in boxes:
        for m in merged:
            mb = m[0]
            if bb[0] <= mb[1] + 0.01 and bb[1] >= mb[0] - 0.01 and bb[2] <= mb[3] + 0.01 and bb[3] >= mb[2] - 0.01 and bb[4] <= mb[5] + 0.01 and bb[5] >= mb[4] - 0.01:
                m[0] = [min(bb[0], mb[0]), max(bb[1], mb[1]), min(bb[2], mb[2]), max(bb[3], mb[3]), min(bb[4], mb[4]), max(bb[5], mb[5])]
                if kind == "bulkhead":
                    m[1] = "bulkhead"
                break
        else:
            merged.append([list(bb), kind])
    bmesh.ops.delete(bm, geom=drop + up, context='FACES')
    bm.to_mesh(me); bm.free()
    return roof_z, top_z, [(b[0], b[1], b[2], b[3], max(b[4], roof_z), b[5], k) for b, k in merged]


# ---------------------------------------------------------------- the roof kit
def roof_kit(X, boxes, roof_z, x0, x1, y0, y1):
    """The city's rooftop boxes given a purpose: a stair bulkhead (door, louvre, lamp, coping), condensers (casing on
    rails, louvred sides, a top fan behind its grille), air handlers (louvred), exhaust fans (a cowl); refrigerant pipes on
    supports, vent stacks and a hatch where there is no bulkhead."""
    M, B, rng = X.M, X.Br, X.rng
    bulk = None
    units = []
    for (bx0, bx1, by0, by1, bz0, bz1, kind) in boxes:
        if kind == "bulkhead":
            bulk = (bx0, bx1, by0, by1, bz0, bz1)
            B.box((bx0, by0, roof_z - 0.02), (bx1, by1, bz1), X.wall)
            B.ring(bx0, bx1, by0, by1, bz1, bz1 + 0.08, 0.04, M.metal, inset=0.1)
            # the door on the bulkhead's longer side facing the roof's middle
            cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2
            if bx1 - bx0 >= by1 - by0:
                side = "S" if cy > (y0 + y1) / 2 else "N"
            else:
                side = "W" if cx > (x0 + x1) / 2 else "E"
            Fb = Face(side, bx0, bx1, by0, by1)
            uc = Fb.L / 2
            Fb.box(B, uc - 0.5, uc + 0.5, roof_z, roof_z + 2.15, -0.01, 0.03, M.metal)          # a steel door in its frame
            Fb.box(B, uc - 0.42, uc + 0.42, roof_z + 0.05, roof_z + 2.08, 0.03, 0.04, M.doors[0])
            Fb.box(B, uc + 0.25, uc + 0.32, roof_z + 1.0, roof_z + 1.06, 0.04, 0.09, M.galv)
            Fb.box(B, uc - 0.12, uc + 0.12, roof_z + 2.3, roof_z + 2.42, -0.01, 0.12, M.metal)    # a lamp over it
            Fb.box(B, uc - 0.6, uc + 0.6, roof_z + 2.18, roof_z + 2.24, -0.01, 0.45, M.metal)     # a drip canopy
            Fl = Face({"S": "E", "N": "W", "E": "N", "W": "S"}[side], bx0, bx1, by0, by1)        # a louvre on a side face
            Fl.box(B, Fl.L / 2 - 0.4, Fl.L / 2 + 0.4, bz1 - 1.0, bz1 - 0.4, -0.01, 0.03, M.louvre)
            B.cylinder(cx + (bx1 - bx0) * 0.25, cy, bz1 + 0.08, bz1 + 0.6, 0.12, M.galv)          # the stair's vent
            continue
        units.append((bx0, bx1, by0, by1, bz0, bz1))
    for (bx0, bx1, by0, by1, bz0, bz1) in units:
        w, d = bx1 - bx0, by1 - by0
        h = bz1 - bz0
        cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2
        kind = rng.choice(["condenser", "condenser", "handler", "exhaust"])
        if kind == "exhaust" or min(w, d) < 0.6:
            r = min(w, d) * 0.35
            B.box((cx - r * 1.1, cy - r * 1.1, roof_z), (cx + r * 1.1, cy + r * 1.1, roof_z + 0.2), M.unit)   # the curb
            B.cylinder(cx, cy, roof_z + 0.2, roof_z + 0.2 + h * 0.6, r * 0.8, M.galv, n=16)
            B.cylinder(cx, cy, roof_z + 0.2 + h * 0.6, roof_z + 0.25 + h * 0.6, r * 1.15, M.galv, n=16, bottom=True)
            B.cylinder(cx, cy, roof_z + 0.25 + h * 0.6, roof_z + 0.35 + h * 0.6, r * 0.5, M.metal, n=16)
            continue
        # rails, then the casing on them
        for yy in (by0 + 0.1, by1 - 0.18):
            B.box((bx0 - 0.1, yy, roof_z), (bx1 + 0.1, yy + 0.08, roof_z + 0.12), M.metal)
        zc0, zc1 = roof_z + 0.12, roof_z + 0.12 + h
        B.box((bx0, by0, zc0), (bx1, by1, zc1), M.unit)
        long_x = w >= d
        for s in (0, 1):                                                               # louvred side panels
            if long_x:
                y = by0 - 0.01 if s == 0 else by1 + 0.0
                B.box((bx0 + 0.08, y, zc0 + 0.08), (bx1 - 0.08, y + 0.01, zc1 - 0.08), M.louvre)
            else:
                x = bx0 - 0.01 if s == 0 else bx1 + 0.0
                B.box((x, by0 + 0.08, zc0 + 0.08), (x + 0.01, by1 - 0.08, zc1 - 0.08), M.louvre)
        if kind == "condenser":
            r = min(w, d) * 0.36
            nf = 2 if max(w, d) > 2.2 * min(w, d) else 1
            for i in range(nf):
                fx = cx + ((i + 0.5) / nf - 0.5) * w if long_x else cx
                fy = cy if long_x else cy + ((i + 0.5) / nf - 0.5) * d
                B.cylinder(fx, fy, zc1, zc1 + 0.1, r, M.unit, n=20)
                B.cylinder(fx, fy, zc1 + 0.1, zc1 + 0.11, r * 0.92, M.grille, n=20)
                B.cylinder(fx, fy, zc1 + 0.11, zc1 + 0.14, r * 0.15, M.metal, n=10)
        else:
            B.box((bx0 + 0.1, by0 + 0.1, zc1), (bx1 - 0.1, by1 - 0.1, zc1 + 0.06), M.metal)
        # refrigerant pipes from the unit toward the bulkhead (or a roof penetration), on small supports
        tx, ty = ((bulk[0] + bulk[1]) / 2, (bulk[2] + bulk[3]) / 2) if bulk else (cx + 2.0, cy)
        ex = bx1 + 0.05 if tx > cx else bx0 - 0.05
        dist = min(abs(tx - cx) - (bx1 - bx0) / 2 - 0.2, 4.0) if bulk else 1.5
        if dist > 0.4:
            sgn = 1 if tx > cx else -1
            xa, xb = sorted((ex, ex + sgn * dist))
            for dy in (-0.08, 0.08):
                B.box((xa, cy + dy - 0.025, roof_z + 0.22), (xb, cy + dy + 0.025, roof_z + 0.27), M.pipe)
            n = max(1, int(dist / 1.2))
            for k in range(n + 1):
                x = xa + (xb - xa) * k / n
                B.box((x - 0.06, cy - 0.15, roof_z), (x + 0.06, cy + 0.15, roof_z + 0.22), M.unit)
            if not bulk:
                B.cylinder(xb if sgn > 0 else xa, cy, roof_z, roof_z + 0.32, 0.14, M.metal)   # the penetration boot
        X.stats["roof units"] = X.stats.get("roof units", 0) + 1
    # vent stacks, and a hatch where nothing reaches the roof
    taken = [(b[0] - 0.8, b[1] + 0.8, b[2] - 0.8, b[3] + 0.8) for b in boxes]
    tries, stacks = 0, 0
    want = rng.randint(2, 4)
    while stacks < want and tries < 40:
        tries += 1
        x = rng.uniform(x0 + 1.5, x1 - 1.5); y = rng.uniform(y0 + 1.5, y1 - 1.5)
        if any(t[0] < x < t[1] and t[2] < y < t[3] for t in taken):
            continue
        r = rng.uniform(0.04, 0.08); hgt = rng.uniform(0.5, 0.9)
        B.cylinder(x, y, roof_z, roof_z + hgt, r, M.galv, n=10)
        B.cylinder(x, y, roof_z + hgt, roof_z + hgt + 0.05, r * 1.6, M.galv, n=10, bottom=True)
        taken.append((x - 0.5, x + 0.5, y - 0.5, y + 0.5)); stacks += 1
    if bulk is None:
        for _ in range(20):
            x = rng.uniform(x0 + 2.0, x1 - 2.0); y = rng.uniform(y0 + 2.0, y1 - 2.0)
            if not any(t[0] < x < t[1] and t[2] < y < t[3] for t in taken):
                B.box((x - 0.45, y - 0.45, roof_z), (x + 0.45, y + 0.45, roof_z + 0.3), M.unit)
                B.box((x - 0.5, y - 0.5, roof_z + 0.3), (x + 0.5, y + 0.5, roof_z + 0.36), M.metal)
                break


# ---------------------------------------------------------------- the buildings
def _use_of(ob):
    if ob.name in NEIGHBOUR_USE:
        return NEIGHBOUR_USE[ob.name]
    wall = ob.data.materials[0].name
    for u in ("flats", "offices", "shops", "shed"):
        if wall.endswith(u):
            return u
    return "flats"


def model(ob, M, col, hero_xy, log=print):
    """Rebuild one box's walls and roof boxes as a modelled building of its use. Returns the new objects."""
    X = Ctx()
    X.M, X.rng = M, random.Random(f"{SEED}:{ob.name}")
    X.stats = {}
    rng = X.rng
    use = _use_of(ob)
    p = OVERRIDE.get(ob.name, USES[use])
    x0, x1, y0, y1 = _footprint(ob)
    wall_src = ob.data.materials[0]
    roof_z, top_z, roof_boxes = _strip(ob, 0, x0, x1, y0, y1)
    tint = tuple(ob.get("city_tint", (1.0, 1.0, 1.0)))
    brick = "brick" in wall_src.name or "wing" in wall_src.name
    X.classical = use in ("flats", "shops")
    X.tower = use == "tower"
    X.sash = brick
    X.balconies = use == "flats" and min(x1 - x0, y1 - y0) <= BALCONY_MAX_DEPTH
    residential = use in ("flats", "tower", "shops")
    X.frame = M.frames[rng.choice(["offwhite", "taupe", "bronze"] if X.classical else ["bronze", "grey"])]
    X.wall = wall_material(wall_src)
    X.trim = tinted_material(X.wall, BRICK_TRIM_MUL, "trim") if brick else X.wall
    trim_tint = tint if brick else tuple(min(1.6, c * TONE_TRIM) for c in tint)
    X.Bw, X.Bg, X.Bt, X.Bd, X.Bp, X.Br = (Builder() for _ in range(6))
    X.balcony_done = False
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
    b_ = BEVEL
    for side in ("S", "E", "N", "W"):
        F = Face(side, x0, x1, y0, y1)
        front = (F.N[0] * hx + F.N[1] * hy) / hl > 0.3
        L = F.L
        holes_g, holes_u = [], []
        bw = p["bay"]
        n_bay = max(1, int((L - 2 * 0.9) // bw))
        ub = [(L - n_bay * bw) / 2 + (k + 0.5) * bw for k in range(n_bay)]
        panels = compose(L, rng, core=front) if residential else None
        zg0, zg1 = Z0, Z0 + gh
        # -------- the ground storey
        if use == "shops" and front:
            units, k = [], 0
            while k < n_bay:
                take = 3 if n_bay - k == 3 else min(2, n_bay - k)
                units.append((ub[k] - bw / 2 + 0.3, ub[k + take - 1] + bw / 2 - 0.3)); k += take
            for (a, b) in units:
                zt = zg1 - 0.95
                holes_g.append((a, b, zg0, zt))
                reveal(F, X.Bd, a, b, zg0, zt, REVEAL_SHOP, X.wall, bottom=False)
                d = REVEAL_SHOP
                door_left = rng.random() < 0.5
                dw = 1.1
                da, db = (a + 0.15, a + 0.15 + dw) if door_left else (b - 0.15 - dw, b - 0.15)
                ga, gb = (db + 0.1, b) if door_left else (a, da - 0.1)
                F.quad(X.Bd, ga, gb, zg0 + 0.45, zt, -d, M.glass)
                F.quad(X.Bd, ga, gb, zg0, zg0 + 0.45, -d, M.kick)
                fo = (-d, -d + 0.06)
                for u in (a, b, ga, gb):
                    F.box(X.Bd, u - 0.04, u + 0.04, zg0, zt, *fo, X.frame)
                F.box(X.Bd, a, b, zg0 + 2.75, zg0 + 2.83, *fo, X.frame)
                F.box(X.Bd, ga, gb, zg0 + 0.42, zg0 + 0.48, *fo, X.frame)
                nm = max(0, int((gb - ga) / 1.6))
                for j in range(1, nm + 1):
                    um = ga + (gb - ga) * j / (nm + 1)
                    F.box(X.Bd, um - 0.03, um + 0.03, zg0 + 0.45, zt, *fo, X.frame)
                F.quad(X.Bd, da, db, zg0 + 2.83, zt, -d, M.glass)
                door(X, F, da, db, zg0, zg0 + 2.75, "glass", depth=d, own_reveal=False)
                if brick:   # on brick, a soldier-course lintel over the shopfront (the user's reference), no sign panel
                    F.box(X.Bt, a - 0.15, b + 0.15, zt, zt + 0.3, -0.02, 0.03, X.trim)
                else:
                    F.box(X.Bd, a + 0.25, b - 0.25, zt + 0.22, zt + 0.72, -0.01, 0.04, rng.choice(M.signs))
                if rng.random() < AWNING_SHARE:
                    awning(X, F, rng.choice(M.awnings), a + 0.05, b - 0.05, zt + 0.12)
                X.stats["shopfronts"] = X.stats.get("shopfronts", 0) + 1
        elif use == "shed":
            if front or rng.random() < 0.5:
                n_roll = max(1, min(3, n_bay // 2))
                picks = sorted(rng.sample(range(n_bay), n_roll)) if n_bay > 1 else [0]
                for k in picks:
                    a, b = ub[k] - 1.8, ub[k] + 1.8
                    zt = zg0 + 4.4
                    holes_g.append((a, b, zg0, zt))
                    reveal(F, X.Bd, a, b, zg0, zt, 0.2, X.wall, bottom=False)
                    F.quad(X.Bd, a, b, zg0, zt, -0.2, M.rollup)
                    F.box(X.Bd, a - 0.15, a, zg0, zt + 0.15, -0.02, 0.10, M.metal); F.box(X.Bd, b, b + 0.15, zg0, zt + 0.15, -0.02, 0.10, M.metal)
                    F.box(X.Bd, a - 0.15, b + 0.15, zt, zt + 0.15, -0.02, 0.10, M.metal)
                    F.box(X.Bd, a, b, zt - 0.5, zt, -0.2, -0.05, M.metal)
                    X.stats["rollups"] = X.stats.get("rollups", 0) + 1
                free = [k for k in range(n_bay) if k not in picks]
                if free:
                    k = free[len(free) // 2]
                    a, b = ub[k] - 0.5, ub[k] + 0.5
                    holes_g.append((a, b, zg0, zg0 + 2.2))
                    door(X, F, a, b, zg0, zg0 + 2.2, "steel", depth=0.12)
                    F.box(X.Bd, ub[k] - 0.9, ub[k] + 0.9, zg0 + 2.45, zg0 + 2.45 + CANOPY_T, -0.02, 1.0, M.metal)
            for k in range(n_bay):
                a, b = ub[k] - p["win_w"] / 2, ub[k] + p["win_w"] / 2
                za, zb = zg0 + p["sill"], zg0 + p["sill"] + p["win_h"]
                if za < roof_z - 0.3 and not any(h[0] < b and h[1] > a and h[3] > za for h in holes_g):
                    holes_g.append(window(X, F, a, b, za, min(zb, roof_z - 0.3), mullion=1, sill=False))
        elif residential:
            # the ground floor: the apartments' rooms, the entrance hall under the core of a front face, a service door
            # on a back face
            for (u0, u1, kind) in panels:
                if kind == "core":
                    hw = min(HALL["width"], u1 - u0 - 0.4)
                    hh = min(HALL["height"], gh - 0.6)
                    holes_g.append(entrance_hall(X, F, (u0 + u1) / 2, hw, zg0, hh, HALL["depth"] if X.tower else 2.2))
            if not front and panels and rng.random() < 0.7:
                u0, u1, kind = panels[0]
                a, b = (u0 + u1) / 2 - 0.5, (u0 + u1) / 2 + 0.5
                holes_g.append((a, b, zg0, zg0 + 2.3))
                door(X, F, a, b, zg0, zg0 + 2.3, "steel", depth=0.15)
                rest = [pn for pn in panels[1:]]
            else:
                rest = panels
            holes_g += residential_floor(X, F, [pn for pn in rest if pn[2] != "core"], zg0, gh, p, True, front, roof_z)
        else:
            # offices: the entrance hall in the middle of a front face, windows elsewhere
            ent = n_bay // 2 if front else None
            for k in range(n_bay):
                if k == ent:
                    holes_g.append(entrance_hall(X, F, ub[k], min(HALL["width"], 2 * bw - 0.6), zg0, min(HALL["height"], gh - 0.6), 2.4))
                    continue
                if (not front) and k == 0 and rng.random() < 0.7:
                    a, b = ub[k] - 0.5, ub[k] + 0.5
                    holes_g.append((a, b, zg0, zg0 + 2.3))
                    door(X, F, a, b, zg0, zg0 + 2.3, "steel", depth=0.15)
                    continue
                w = p["win_w"] * 1.25
                za = zg0 + 1.1
                zb = min(zg1 - 0.6, za + p["win_h"])
                holes_g.append(window(X, F, ub[k] - w / 2, ub[k] + w / 2, za, zb, transom=0.72))
        # -------- the upper storeys
        for s in range(n_up):
            zs0 = levels[s + 1]
            if residential:
                holes_u += residential_floor(X, F, panels, zs0, p["storey"], p, False, front, roof_z, floor_no=s + 2,
                                             long_face=L >= max(x1 - x0, y1 - y0) - 0.01)
                continue
            za, zb = zs0 + p["sill"], zs0 + p["sill"] + p["win_h"]
            if zb > levels[s + 2] - 0.25:
                continue
            if use == "offices":
                grp = 3 if n_bay % 3 == 0 and n_bay > 3 else 2
                k = 0
                while k < n_bay:
                    take = min(grp, n_bay - k)
                    a = ub[k] - bw / 2 + PILASTER[0] / 2 + 0.25
                    b = ub[k + take - 1] + bw / 2 - PILASTER[0] / 2 - 0.25
                    holes_u.append(window(X, F, a, b, za, zb, mullion=max(1, int((b - a) / 1.15) - 1), transom=0.78))
                    k += take
        # -------- the walls (corners left for the chamfers): the ground storey in its own tone, the floors over it
        zsplit = Z0 + gh
        wall_with_holes(F, X.Bg, Z0, zsplit, holes_g, X.wall, b_, L - b_)
        wall_with_holes(F, X.Bw, zsplit, top_z, holes_u + [h for h in holes_g if h[3] > zsplit], X.wall, b_, L - b_)
        # -------- the plinth between the openings that reach the ground
        ph, pp = PLINTH
        if use != "shed":
            cuts = sorted((h[0], h[1]) for h in holes_g if h[2] < Z0 + ph)
            ext = pp if side in ("S", "N") else 0.0
            u = -ext
            for a, b in cuts + [(L + ext, L + ext)]:
                if a > u + 0.05:
                    F.box(X.Bp, u, a, Z0, Z0 + ph, -0.02, pp, X.trim if brick else X.wall)
                u = max(u, b)
        # -------- structure: the offices' pilasters cut at every floor, the shed's piers
        if use in ("offices", "shed"):
            pw, pp2 = PILASTER
            zp0 = Z0 + (ph if use != "shed" else 0.0)
            zp1 = roof_z - 0.45 if use != "shed" else top_z - COPING[0]
            divs = [ub[0] - bw / 2] + [ub[k] + bw / 2 for k in range(n_bay)]
            if use == "offices":
                grp = 3 if n_bay % 3 == 0 and n_bay > 3 else 2
                divs = [ub[0] - bw / 2] + [ub[min(n_bay - 1, k + grp - 1)] + bw / 2 for k in range(0, n_bay, grp)]
            for d in divs:
                if any(h[0] < d + pw / 2 and h[1] > d - pw / 2 and h[2] < zp1 and h[3] > zp0 for h in holes_g + holes_u):
                    continue
                if use == "offices":   # rendered: cut at every floor
                    segs = [zp0] + [lv for lv in levels[1:-1] if zp0 < lv < zp1] + [zp1]
                    for za, zb in zip(segs, segs[1:]):
                        F.box(X.Bt, d - pw / 2, d + pw / 2, za + (JOINT / 2 if za > zp0 else 0.0), zb - JOINT / 2, -0.02, pp2, X.trim)
                else:                  # the shed's piers: concrete, whole
                    F.box(X.Bt, d - pw / 2, d + pw / 2, zp0, zp1, -0.02, pp2 + 0.02, X.wall)
    # -------- the corners, the rings round the footprint: string course, cornice, parapet, coping
    corner_chamfers(X.Bg, x0, x1, y0, y1, Z0, Z0 + gh, X.wall)
    corner_chamfers(X.Bw, x0, x1, y0, y1, Z0 + gh, top_z, X.wall)
    if use in ("flats", "shops") and n_up > 0:
        sh, sp = STRING
        X.Bt.ring(x0, x1, y0, y1, Z0 + gh - 0.05, Z0 + gh - 0.05 + sh, sp, X.trim)
    deep = 0.8 + 0.4 * rng.random()
    if brick:                     # a brick building: a soldier-course band under a metal coping, no cornice
        bh, bp = BRICK_BAND
        X.Bt.ring(x0, x1, y0, y1, roof_z - 0.45, roof_z - 0.45 + bh, bp, X.trim)
    elif X.classical:
        z = roof_z - CORNICE[0][0] - 0.05
        for h, pr in CORNICE:
            X.Bt.ring(x0, x1, y0, y1, z, z + h, pr * deep, X.trim); z += h
    elif use == "tower":          # a plain attic band in the render
        X.Bt.ring(x0, x1, y0, y1, roof_z - 0.35, roof_z + 0.05, 0.04, X.trim)
    if top_z > roof_z + 0.05:
        t = PARAPET_T
        for side in ("S", "E", "N", "W"):
            F = Face(side, x0 + t, x1 - t, y0 + t, y1 - t)
            pts = [F.P(0.0, roof_z), F.P(0.0, top_z), F.P(F.L, top_z), F.P(F.L, roof_z)]
            X.Bt.face(pts, X.wall, inward_of=F.P(F.L / 2, (roof_z + top_z) / 2, 1.0))
    ch, co = COPING
    X.Bt.ring(x0, x1, y0, y1, top_z, top_z + ch, co, X.trim if (X.classical and not brick) else M.metal, inset=PARAPET_T + co)
    # -------- the roof's boxes, given a purpose
    roof_kit(X, roof_boxes, roof_z, x0, x1, y0, y1)
    # -------- the objects
    out = []
    t_ground = tuple(c * TONE_GROUND for c in tint)
    t_plinth = tuple(c * TONE_PLINTH for c in tint)
    top_r = max([b[5] for b in roof_boxes] + [top_z]) + 0.1
    for B, nm, tn, top, bev in ((X.Bw, "walls", tint, top_z, False), (X.Bg, "ground", t_ground, top_z, False),
                                (X.Bt, "trim", trim_tint, top_z, True), (X.Bp, "plinth", t_plinth, top_z, True),
                                (X.Bd, "details", tint, top_z, True),
                                (X.Br, "roof", tint, top_r, True)):
        o = B.build(f"nb_{ob.name}_{nm}", col, tint=tn, top=top, bevel=bev)
        if o is not None:
            out.append(o)
    log(f"NEIGHBOUR {ob.name}: {use}, {x1 - x0:.1f} x {y1 - y0:.1f} m, roof {roof_z:.2f}, parapet {top_z:.2f}, "
        f"{1 + n_up} storeys; " + ", ".join(f"{v} {k}" for k, v in sorted(X.stats.items()) if v))
    return out


def build(S, names, hero_xy, log=print):
    """Model every named box in a NEIGHBOURS collection; the boxes keep their roof planes."""
    col = bpy.data.collections.get("NEIGHBOURS") or bpy.data.collections.new("NEIGHBOURS")
    if col.name not in S.collection.children:
        S.collection.children.link(col)
    M = Mats()
    n = 0
    for name in names:
        ob = bpy.data.objects.get(name)
        if ob is None:
            log(f"NEIGHBOUR {name}: not in the scene, skipped"); continue
        model(ob, M, col, hero_xy, log=log); n += 1
    log(f"NEIGHBOURS: {n} buildings modelled, {len(col.objects)} objects")
    return col
