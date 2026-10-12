# A tone of its own for every terracotta piece (AI 607, the third step of the weathering-realism group AI 605-610).
# Architectural terracotta was fired in pieces, and every piece came out of the kiln a little different -- a shade
# lighter or darker, a touch warmer or cooler -- so an old facade's trim reads as fired pieces set side by side, never
# as one casting. The owner's suggested weathered version of the top floor (2026-10-10) shows exactly that, "subtle
# terracotta variation". The trim already carries a faint cell variation (assemble_building.py's trim material, 1.5 %
# over 0.7 m cells), but its cells ignore the pieces; a first attempt at 4 % read as patches (2026-09-17) for that
# reason. Here every tone change happens at a real joint, and a piece is one tone throughout.
#
# THE PIECES, each the model's own (apply() tags every terracotta face with how to find its piece):
#   LINEAR   the long courses -- the crown's members, the band's mouldings, the impost course -- are one mesh round the
#            whole building: blocks of BLOCK_L along each facade (S), cut in the shader, a joint at each facade's start.
#            A sill is three blocks between its own two ends.
#   TILES    the frieze's flower tiles (0.55 m squares) and the medallion band's tiles (4 x 3 per 0.733 x 0.55 m
#            repeat, 0.183 m squares) are drawn in their textures: the tiles of their own UV grid.
#   WEDGES   an archivolt is cut into VOUSSOIRS wedges round its arch's centre.
#   ISLANDS  a dentil takes the tone of the BLOCK_L block it sits in (the dentil course is set in blocks of several
#            dentils), a bracket is a piece of its own.
# A piece's tone is drawn from its own seed (a white-noise hash of its index, its facade and the object's own seed):
# uniform inside the piece, unrelated to its neighbours', the same every render.
#
# THE TONE: lighter or darker by up to AMP and a touch warmer or cooler (red up and blue down, or the reverse) by up to
# WARM, the way a firing varies. Where a block of the plain trim meets the next (LINEAR and WEDGES, whose textures draw
# no joints), an optional fine joint line, JOINT_W wide and a little darker; the tiles draw their own.
#
# CONTROLS: the strength wear_piece_tone (0: off, the look before AI 607 exactly), the joint lines wear_piece_tone_joints
# (0: none), a seed offset wear_piece_tone_seed, and the group switch wear_realism.
import hashlib, math
from .. import classes

NAME = "piece_tone"
AI = 607
LABEL = "a tone of its own for every terracotta piece"
ORDER = 105                       # a fabric feature (the material as fired): after the joints' erosion, before every deposit
DEFAULT_STRENGTH = 1.0
DEBUG_COLOR = (0.95, 0.75, 0.20)
CONTROLS = {"joints": 1.0, "seed": 0.0}

BLOCK_L = 0.76                    # a block of the plain trim along a course (terracotta blocks run about 2 to 3 feet)
SILL_BLOCKS = 3                   # a sill is set as this many blocks
FRIEZE_TILE = (0.55, 10.0)        # the frieze's tiles in its UV metres (one row: the V cell spans it)
BAND_TILE = (0.55 / 3.0, 0.55 / 3.0)      # the medallion band's tiles: 4 x 3 per B45_FIELD_H x 4/3 by B45_FIELD_H
VOUSSOIRS = 7                     # an archivolt's wedges over its half circle

LINEAR_RX = r"^(ge_cornice45_(top|bottom)|ge_crown_(c\d|coffer|moulding|plinth)|impost_course)"
TILE_SETS = {"PBR_bradbury_flower_tiles": FRIEZE_TILE, "PBR_bradbury_top_band_terracotta_ornament": BAND_TILE}
# Every face also carries its own facade's frame (origin and direction in plan, and its index): the courses and the
# archivolts are measured along the facade their face lies on, never along whichever facade the wear frame picks for a
# point, which on the parapet's inner faces flips from point to point (a checker, seen on the first build).
FRAME_ATTRS = ("wear_pt_ox", "wear_pt_oy", "wear_pt_tx", "wear_pt_ty", "wear_pt_f")
LINEAR, TILES, WEDGES, ISLANDS = 1, 2, 3, 4

AMP = 0.08                        # a piece's lightness, either way, at strength 1: the owner's choice on the sweep of
                                  # 2026-10-11 (0.04 x 0 / 1 / 2 / 3: "use 2")
WARM = 0.03                       # its warmth, either way: red x (1 + w), blue x (1 - w) (x2 with AMP)
JOINT_W = 0.003                   # a joint line's half-width, metres
JOINT_DARK = 0.18                 # and how much darker its centre is, at joints 1


def _seed(name):
    return int.from_bytes(hashlib.sha256(("piece_tone:" + name).encode()).digest()[:4], "big") % 997


def build(ctx):
    ctx.log(f"   piece_tone: blocks of {BLOCK_L} m on the courses, {SILL_BLOCKS} to a sill, the frieze's and the band's "
            f"own tiles, {VOUSSOIRS} voussoirs to an archivolt; tagged in apply()")


def _islands(me):
    # connected pieces of a mesh, by shared vertices: a list of polygon index lists
    parent = list(range(len(me.vertices)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    for p in me.polygons:
        vs = list(p.vertices)
        for v in vs[1:]:
            a, b = find(vs[0]), find(v)
            if a != b: parent[a] = b
    groups = {}
    for p in me.polygons:
        groups.setdefault(find(p.vertices[0]), []).append(p.index)
    return list(groups.values())


def _set(actx, o, mode, a, b, c, seed, frame):
    me = actx.own_mesh(o)
    cols = [("wear_" + NAME, mode), ("wear_pt_a", a), ("wear_pt_b", b), ("wear_pt_c", c), ("wear_pt_seed", seed)]
    cols += [(nm, [fr[k] for fr in frame]) for k, nm in enumerate(FRAME_ATTRS)]
    for nm, vals in cols:
        if nm in me.attributes: me.attributes.remove(me.attributes[nm])
        at = me.attributes.new(nm, 'FLOAT', 'FACE')
        at.data.foreach_set("value", [float(v) for v in vals])


def apply(actx):
    import bpy, re
    from ..geometry import FACADES, facade_of
    rx_lin = re.compile(LINEAR_RX)
    counts = {}
    for o in [q for q in bpy.data.objects if q.type == 'MESH' and q.library is None]:
        names = [s.material.name if s.material else "" for s in o.material_slots]
        cls = [classes.classify(s.material)[0] if s.material else classes.NONE for s in o.material_slots]
        if classes.TERRACOTTA not in cls: continue
        me = o.data; n = len(me.polygons)
        if n == 0: continue
        mode, a, b, c = [0.0] * n, [0.0] * n, [0.0] * n, [0.0] * n
        sd = [float(_seed(o.name))] * n
        M = o.matrix_world
        wv = [M @ v.co for v in me.vertices]
        def frame_of(x, y):
            f = facade_of(x, y); F = FACADES[f]
            return (F.a[0], F.a[1], F.t[0], F.t[1], float(f))
        def s_in(fr, p):                       # metres along the frame's facade from its origin
            return (p.x - fr[0]) * fr[2] + (p.y - fr[1]) * fr[3]
        frame = []
        for p in me.polygons:
            cw = M @ p.center
            frame.append(frame_of(cw.x, cw.y))
        kind = None
        if o.name.startswith("ge_archivolt"):
            xs = [p.x for p in wv]; ys = [p.y for p in wv]; zs = [p.z for p in wv]
            fr = frame_of(0.5 * (min(xs) + max(xs)), 0.5 * (min(ys) + max(ys)))
            ss = [s_in(fr, p) for p in wv]
            cs = 0.5 * (min(ss) + max(ss)); cz = max(zs) - 0.5 * (max(ss) - min(ss))
            frame = [fr] * n                   # the whole ring in its own facade's frame
            for i in range(n): mode[i], a[i], b[i], c[i] = WEDGES, VOUSSOIRS, cs, cz
            kind = "archivolt wedges"
        elif o.name.startswith("sill_"):
            xs = [p.x for p in wv]; ys = [p.y for p in wv]
            fr = frame_of(0.5 * (min(xs) + max(xs)), 0.5 * (min(ys) + max(ys)))
            ss = [s_in(fr, p) for p in wv]
            frame = [fr] * n
            for i in range(n): mode[i], a[i], b[i] = LINEAR, (max(ss) - min(ss)) / SILL_BLOCKS, min(ss)
            kind = "sill blocks"
        elif o.name.startswith(("ge_crown_teeth", "ge_teeth45")):
            for isl in _islands(me):
                vs = {v for pi in isl for v in me.polygons[pi].vertices}
                cx = sum(wv[v].x for v in vs) / len(vs); cy = sum(wv[v].y for v in vs) / len(vs); cz_ = sum(wv[v].z for v in vs) / len(vs)
                f = facade_of(cx, cy); s = FACADES[f].sdz(cx, cy, cz_)[0]
                key = math.floor(s / BLOCK_L) + 1000 * (f + 1)
                for pi in isl: mode[pi], a[pi] = ISLANDS, key
            kind = "dentils by block"
        elif o.name.startswith("ge_bracket45"):
            for k, isl in enumerate(_islands(me)):
                for pi in isl: mode[pi], a[pi] = ISLANDS, k + 1
            kind = "brackets"
        else:
            lin = bool(rx_lin.match(o.name)) or o.name.startswith("ge_band45")
            for p in me.polygons:
                nm = names[p.material_index] if p.material_index < len(names) else ""
                if nm in TILE_SETS or re.sub(r"\.\d+$", "", nm) in TILE_SETS:
                    tu, tv = TILE_SETS[re.sub(r"\.\d+$", "", nm)]
                    mode[p.index], a[p.index], b[p.index] = TILES, tu, tv
                elif lin and cls[p.material_index] == classes.TERRACOTTA:
                    mode[p.index], a[p.index], b[p.index] = LINEAR, BLOCK_L, 0.0
            kind = "courses and tiles" if lin or any(m == TILES for m in mode) else None
        if kind is None or not any(mode): continue
        _set(actx, o, mode, a, b, c, sd, frame)
        counts[kind] = counts.get(kind, 0) + 1
    actx.log("   piece_tone: " + ", ".join(f"{v} objects of {k}" for k, v in sorted(counts.items())))


def shader(g):
    mode = g.i("Attr")
    A = g.attr("wear_pt_a", 'GEOMETRY'); B = g.attr("wear_pt_b", 'GEOMETRY'); C = g.attr("wear_pt_c", 'GEOMETRY')
    seed = g.add(g.attr("wear_pt_seed", 'GEOMETRY'), g.mul(g.control("seed"), 7.31))
    px, py, Z = g.xyz(g.i("Position"))
    ox, oy, tx, ty, fac = (g.attr(nm, 'GEOMETRY') for nm in FRAME_ATTRS)
    S = g.add(g.mul(g.sub(px, ox), tx), g.mul(g.sub(py, oy), ty))     # along the face's own facade
    m1, m2, m3, m4 = (g.eq(mode, float(k)) for k in (LINEAR, TILES, WEDGES, ISLANDS))
    # LINEAR: blocks of A along S from B
    c1 = g.div(g.sub(S, B), A); i1 = g.math('FLOOR', c1); f1 = g.sub(c1, i1)
    d1 = g.mul(g.mn(f1, g.one_minus(f1)), A)
    # TILES: the cells of the mesh's own UVs, A by B
    u, v, _ = g.xyz(g.node('ShaderNodeUVMap', uv_map="UVMap").outputs['UV'])
    iu = g.math('FLOOR', g.div(u, A)); iv = g.math('FLOOR', g.div(v, B))
    # WEDGES: VOUSSOIRS (A) sectors of the half circle round (B, C) in (S, Z)
    ds, dz = g.sub(S, B), g.sub(Z, C)
    ang = g.math('ARCTAN2', dz, ds)
    sector = g.div(math.pi, A)
    c3 = g.div(ang, sector); i3 = g.math('FLOOR', c3); f3 = g.sub(c3, i3)
    r = g.math('SQRT', g.add(g.mul(ds, ds), g.mul(dz, dz)))
    d3 = g.mul(g.mul(g.mn(f3, g.one_minus(f3)), sector), r)
    # the piece's key and its tone
    X = g.add(g.add(g.mul(m1, i1), g.mul(m2, iu)), g.add(g.mul(m3, i3), g.mul(m4, A)))
    Y = g.add(g.mul(m1, fac), g.mul(m2, iv))
    wn = g.node('ShaderNodeTexWhiteNoise', noise_dimensions='3D')
    g.set(wn.inputs['Vector'], g.vec(X, Y, seed))
    r1, r2, _ = g.sep(wn.outputs['Color'])
    # the strength scales the tone's amplitude itself (a mix factor would clamp at 1); at 0 the factor is exactly 1
    k = g.i("Strength")
    light = g.add(1.0, g.mul(g.sub(g.mul(r1, 2.0), 1.0), g.mul(k, AMP)))
    warm = g.mul(g.sub(g.mul(r2, 2.0), 1.0), g.mul(k, WARM))
    factor = g.rgb(g.mul(light, g.add(1.0, warm)), light, g.mul(light, g.sub(1.0, warm)))
    col = g.i("Color")
    toned = g.mix(col, factor, 1.0, 'RGBA', 'MULTIPLY')
    on = g.mul(g.gt(mode, 0.5), g.mul(g.is_class(classes.TERRACOTTA), g.attr("wear_realism")))
    out = g.mix(col, toned, on, 'RGBA')
    # the plain trim's joints, where no texture draws them
    d = g.add(g.mul(m1, d1), g.mul(m3, d3))
    line = g.mul(g.add(m1, m3), g.one_minus(g.smooth(0.0, JOINT_W, d)))
    # the strength switches the joints too (0: the feature wholly off), up to their full darkness at 1
    jamt = g.mul(g.mul(g.mul(line, on), g.clamp(k)), g.mul(g.control("joints"), JOINT_DARK))
    g.o("Color", g.mix(out, g.scale_rgb(out, 0.0), jamt, 'RGBA'))
    g.o("Debug", g.mul(g.gt(mode, 0.5), r1))
