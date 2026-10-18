# cafe_umbrella.py -- the sidewalk café's market umbrella (2026-10-14): one detailed octagonal canvas umbrella into a
# caller's bmesh. layer_site_cafe.py places one per café set (it replaced AI 632's square pyramid shells).
#
# After b8's umbrellas (x 250-420, 600-900, 1000-1122 at y 1070-1160; crops in umbrella_detail/ref/): cream octagonal
# market umbrellas, the canvas in 8 panels that sag a little between the ribs, the rib seams soft ridges, a raised vent
# cap with a finial, a straight valance, a natural-wood pole and, underneath, wood ribs and struts from a runner. Every
# part is real geometry, in the umbrella's frame (u = axis_u, v = u turned +90 deg, h above z0):
#   canopy    the 8 panels as one smooth cyclic sheet: each panel sags between its ribs (a parabolic dip, seeded
#             2.2-3.4 % of the chord, eased at the vent and at the tensioned hem), a soft seam ridge over every rib, the
#             hem scalloped between the rib tips and turned under (a doubled band), the vent opening (r 0.16) turned
#             under the same way. The octagon's flats face +-u / +-v, EDGE_IN inside cfg half (the old square's extent)
#   vent cap  a small 8-panel canopy (r 0.30) lifted over the vent on the top spindle (the gap the wind escapes
#             through), its hem turned, 8 short flaps, 8 rods under it; a turned wood finial on top
#   valance   8 flaps (cfg valance deep) hanging from the hem's fold, a gap at every rib tip; each seeded: a lean out, a
#             soft flutter along its width, a sagging bottom edge with a turned hem
#   frame     8 wood ribs (22 x 16 mm, rounded, bowed 8 mm) 2.5 mm under the seams, from the hub to metal ferrules in
#             the hem; 8 wood struts (16 x 12 mm) from lugs on the runner's ring to brackets under the ribs (at 45 % of
#             their length), pinned at both ends; the hub, a turned wood block the ribs pivot in, on top of the pole
#   pole      the lower section (cfg pole_r) from the street up through the café table's hole, a metal sleeve over the
#             joint (1.33 m), the upper section (r 24 mm) up into the hub; the runner (a wood collar and a metal ring
#             with the lugs) above its locking pin; under the hub a pulley (cheeks, wheel, axle) with the halyard over
#             it, one end down to the runner, the other to a cleat (two turns round its horn, a hanging tail)
# Interface (layer_site_cafe.py depends on it):
#   materials()   create or refresh the umbrella's node materials (procedural, UV driven, shifted per object):
#                   TM_RB_cafe_canopy   woven cream canvas: a fine plain weave with slubs, a soft sheen, translucent so
#                                       the sunlit canopy glows a little from below; the doubled seam bands either side
#                                       of each rib let less light through, with a stitch line
#                   TM_RB_cafe_wood     varnished natural hardwood (lighter and yellower than the teak), grain along U
#                   TM_RB_cafe_metal    satin stainless hardware
#                   TM_RB_cafe_rope     the off-white braided halyard
#   build(bm, slot, centre, axis_u, cfg, z0, seed=0) -> dict
#                 one umbrella into bm in world coordinates. slot(name) -> the caller's material index; centre (x, y) =
#                 the pole's axis; axis_u = the run's direction (a flat of the octagon faces it); cfg =
#                 plan["props"]["sidewalk_cafe"]["config"]["umbrella"] (half, rim_z, apex_z: the canopy cone's rim at
#                 the rib tips and its apex on the axis, above z0; valance: the flaps' depth; pole_r < the table's
#                 hole); z0 = the sidewalk top (the pole stands on it); seed: any str / int (the variation).
#                 Returns {"tris", "parts": {part: tris}, "extent_u", "extent_v" (the largest |u| / |v| of any vertex),
#                 "top" / "bottom" (the finial's tip, the pole's foot: 0.0, above z0), "low_r" (the widest radius below
#                 LOW_H, where the table is), "rope_angle_deg" (the halyard's side), "R" (the rib tips' radius)}
#   to_object(name, coll, bm, slot_names, tags)   the filled bmesh as a mesh object, its UVs and smooth flags kept
#                 (rb_lib.finish would dissolve the sheet's rows and box-project the UVs)
# Mesh data: "UVMap" in metres (the canvas across / along each panel, so the weave follows the cut; wood along the
# member = the grain), "rb_seam" (the canvas's distance to the nearest stitched seam and the length along it: the
# shader's seam bands and stitches; 1.0 elsewhere).
# Triangles (measured by the test): 14 156 per umbrella (canopy 5376, valance 1536, vent cap with its flaps, rods and
# collar 2224, ribs, struts, hub, spindle and finial 2712, hardware 1452, pole sections and runner 400, halyard 456).
# The test also checks: every vertex inside cfg half (1.0779 of 1.1), the lowest point on z0, nothing wider than the
# pole below LOW_H (0.025 in the 0.035 hole), the canopy's normals up; neighbours 2.28 m apart keep 124 mm.
# Test renders (the building file's INSPECTION_RIG, never saved):
#   blender -b blender_files/terramar/parts/terramar_part_shell.blend --python cafe_umbrella.py --
#           [out=<dir>] [samples=96] [shots=side,three_q,under,b8,vent,valance,pole,hub] [pct=100]
import sys
from pathlib import Path
_SCRIPTS = next(p for p in Path(__file__).resolve().parents if (p / "common" / "paths.py").is_file())
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from common import paths as BP
BP.add_import_paths(__file__)
import importlib
import json
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import furniture_materials as FM  # noqa: E402  (the node writer and the per-object UV shift)

importlib.reload(FM)

CANVAS, WOOD, METAL, ROPE = "TM_RB_cafe_canopy", "TM_RB_cafe_wood", "TM_RB_cafe_metal", "TM_RB_cafe_rope"
CANVAS_RGB = (0.76, 0.725, 0.645)                        # linear: b8's cream canvas, under AgX's clip
UV_LAYER, SEAM_LAYER = FM.UV_LAYER, "rb_seam"
N = 8                                                    # ribs, panels, flaps
LOW_H = 0.80                                             # below this (above z0) the pole passes the café table
EDGE_IN = 0.025                                          # the octagon's flats this far inside cfg half
# the design, metres (heights above z0)
BOW = 0.008                                              # the ribs' upward bow at mid-length (b8: near straight)
VENT_R = 0.16                                            # the main canopy's vent opening
SAG = (0.022, 0.034)                                     # a panel's dip / its chord (seeded per panel)
SCALLOP = (0.022, 0.032)                                 # the hem's inset between the rib tips (seeded per panel)
BEAD, BEAD_W = 0.0025, 0.010                             # the seam ridge over each rib: height, width
HEM_R, HEM_BACK = 0.0035, 0.026                          # the turned hem: fold radius, the doubled band's width
RIB_W, RIB_D, RIB_GAP = 0.022, 0.016, 0.0025             # rib section, its top under the canvas
STRUT_W, STRUT_D, STRUT_T = 0.016, 0.012, 0.45           # strut section, where it meets the rib (fraction of R)
RUNNER = (1.88, 1.995, 0.040)                            # runner collar: bottom, top, radius
JOINT, SLEEVE_R, SLEEVE_L = 1.33, 0.029, 0.14            # the pole's joint, its sleeve
UPPER_R = 0.024                                          # the upper pole section
CAP_R, CAP_GAP, CAP_PITCH, CAP_FLAP = 0.30, 0.075, 0.40, 0.035   # vent cap: tip radius, lift, slope, flaps
FLAP_GAP = 0.022                                         # the valance's gap either side of a rib tip
CLEAT_H = 1.50                                           # the halyard's cleat


def _smooth(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3.0 - 2.0 * t)


def _rrect(hw, hd, rc):
    """A rounded rectangle section (x across, y up), 8 points (the corners cut at rc), counter-clockwise."""
    return [(hw, -hd + rc), (hw, hd - rc), (hw - rc, hd), (-hw + rc, hd), (-hw, hd - rc), (-hw, -hd + rc),
            (-hw + rc, -hd), (hw - rc, -hd)]


def _circle(r, n):
    return [(r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n)) for k in range(n)]


# ---------------------------------------------------------------- materials


def _canvas(mat):
    """Woven cream canvas: a plain weave of about 0.7 mm threads with slubs along the warp, matte with a soft sheen,
    mixed with a translucent lobe so the sunlit canopy glows a little from below; the doubled seam bands (rb_seam x <
    18 mm) let half as much through and carry a stitch line."""
    w = FM.Nodes(mat)
    uv = w.uv()
    seam = w.new("ShaderNodeSeparateXYZ")
    w.feed(seam, 0, w.new("ShaderNodeUVMap", uv_map=SEAM_LAYER).outputs["UV"])
    d, along = seam.outputs[0], seam.outputs[1]
    wu = w.wave(uv, 450.0, "X", 1.0, 1.0, 2.0)
    wv = w.wave(uv, 450.0, "Y", 1.0, 1.0, 2.0)
    weave = w.math("ADD", w.math("MULTIPLY", wu, wv),
                   w.math("MULTIPLY", w.math("SUBTRACT", 1.0, wu), w.math("SUBTRACT", 1.0, wv)))
    slub = w.map(w.noise(w.scale(uv, (6.0, 160.0, 1.0)), 1.0, 2.0, 0.5), 0.35, 0.65, 0.0, 1.0)
    band = w.map(d, 0.019, 0.015, 0.0, 1.0)                                  # 1 on the doubled seam allowance
    line = w.map(w.math("ABSOLUTE", w.math("SUBTRACT", d, 0.012)), 0.0004, 0.0009, 1.0, 0.0)
    dash = w.map(w.math("SINE", w.math("MULTIPLY", along, 1570.8)), -0.3, 0.4, 0.0, 1.0)   # 4 mm stitches
    stitch = w.math("MULTIPLY", line, dash)
    f = w.math("MULTIPLY", w.math("MULTIPLY_ADD", weave, 0.035, 0.965), w.math("MULTIPLY_ADD", slub, 0.04, 0.975))
    f = w.math("MULTIPLY", f, w.math("MULTIPLY_ADD", stitch, -0.12, 1.0))
    f = w.math("MULTIPLY", f, w.math("MULTIPLY_ADD", band, -0.025, 1.0))
    col = w.tint(CANVAS_RGB, f)
    bsdf = w.new("ShaderNodeBsdfPrincipled")
    w.feed(bsdf, "Base Color", col)
    w.feed(bsdf, "Roughness", 0.82)
    w.feed(bsdf, "Specular IOR Level", 0.32)
    w.feed(bsdf, "Sheen Weight", 0.35)
    w.feed(bsdf, "Sheen Roughness", 0.45)
    bump = w.new("ShaderNodeBump")
    w.feed(bump, "Strength", 0.10)
    w.feed(bump, "Distance", 0.0005)
    w.feed(bump, "Height", w.math("MULTIPLY_ADD", weave, 0.6, w.math("MULTIPLY_ADD", slub, 0.3,
                                                                       w.math("MULTIPLY", stitch, 0.8))))
    w.feed(bsdf, "Normal", bump.outputs["Normal"])
    tr = w.new("ShaderNodeBsdfTranslucent")
    w.feed(tr, "Color", w.tint(col, 1.0))
    w.feed(tr, "Normal", bump.outputs["Normal"])
    mix = w.new("ShaderNodeMixShader")
    w.feed(mix, 0, w.math("MULTIPLY_ADD", band, -0.08, 0.16))              # 16 % through, 8 % on the seam bands
    w.feed(mix, 1, bsdf.outputs["BSDF"])
    w.feed(mix, 2, tr.outputs["BSDF"])
    w.feed(w.new("ShaderNodeOutputMaterial"), "Surface", mix.outputs["Shader"])
    mat.diffuse_color = (*CANVAS_RGB, 1.0)


def _wood(mat):
    """Varnished natural hardwood (ash / eucalyptus, lighter and yellower than the teak): tone bands, latewood lines
    along U, pores, a thin clear coat."""
    w = FM.Nodes(mat)
    uv = w.uv()
    streak = w.noise(w.scale(uv, (0.6, 16.0, 1.0)), 1.0, 4.0, 0.6)
    lines = w.wave(w.scale(uv, (0.2, 1.0, 1.0)), 52.0, "Y", 2.6, 3.0, 1.4)
    fine = w.wave(w.scale(uv, (0.3, 1.0, 1.0)), 150.0, "Y", 5.0, 2.0, 1.2)
    pores = w.noise(w.scale(uv, (30.0, 700.0, 1.0)), 1.0, 2.0, 0.5)
    col = w.mix(w.map(streak, 0.25, 0.75, 0.0, 1.0), (0.315, 0.200, 0.100), (0.455, 0.315, 0.170))
    f = w.math("MULTIPLY", w.math("MULTIPLY_ADD", w.map(lines, 0.72, 1.0, 0.0, 1.0), -0.13, 1.0),
               w.math("MULTIPLY_ADD", w.map(fine, 0.72, 1.0, 0.0, 1.0), -0.06, 1.0))
    f = w.math("MULTIPLY", f, w.math("MULTIPLY_ADD", w.map(pores, 0.56, 0.74, 0.0, 1.0), -0.06, 1.0))
    rough = w.math("MULTIPLY_ADD", pores, 0.10, 0.42)
    height = w.math("MULTIPLY_ADD", lines, 0.5, w.math("MULTIPLY", pores, 0.5))
    w.tail(w.tint(col, f), rough, height, 0.04, 0.001, Specular_IOR_Level=0.45, Coat_Weight=0.25,
           Coat_Roughness=0.25)
    mat.diffuse_color = (0.38, 0.25, 0.13, 1.0)


def _metal(mat):
    """Satin stainless: a slow roughness drift and a faint brushing along U."""
    w = FM.Nodes(mat)
    uv = w.uv()
    drift = w.noise(w.scale(uv, (6.0, 6.0, 6.0)), 1.0, 2.0, 0.5)
    brush = w.noise(w.scale(uv, (8.0, 900.0, 1.0)), 1.0, 1.0, 0.5)
    w.tail((0.60, 0.60, 0.58, 1.0), w.math("MULTIPLY_ADD", drift, 0.08, 0.26), brush, 0.02, 0.0004, Metallic=1.0)
    mat.diffuse_color = (0.60, 0.60, 0.58, 1.0)


def _rope(mat):
    """The braided off-white halyard: diagonal strands (U along the rope), matte with a little sheen."""
    w = FM.Nodes(mat)
    uv = w.uv()
    strands = w.new("ShaderNodeTexWave", wave_type="BANDS", bands_direction="DIAGONAL", wave_profile="SIN")
    w.feed(strands, "Vector", w.scale(uv, (1.0, 1.0, 1.0)))
    strands.inputs["Scale"].default_value = 60.0
    col = w.tint((0.70, 0.68, 0.62), w.math("MULTIPLY_ADD", strands.outputs["Fac"], 0.10, 0.92))
    w.tail(col, 0.85, strands.outputs["Fac"], 0.25, 0.001, Sheen_Weight=0.3, Specular_IOR_Level=0.3)
    mat.diffuse_color = (0.70, 0.68, 0.62, 1.0)


def materials():
    """Create or refresh TM_RB_cafe_canopy, TM_RB_cafe_wood, TM_RB_cafe_metal and TM_RB_cafe_rope."""
    for name, make in ((CANVAS, _canvas), (WOOD, _wood), (METAL, _metal), (ROPE, _rope)):
        make(bpy.data.materials.get(name) or bpy.data.materials.new(name))


# ---------------------------------------------------------------- geometry


class _Umb:
    """One umbrella's frame and the faces it adds: local (u, v, h) Vectors -> world; the parts' triangle counts."""

    def __init__(self, bm, slot, centre, axis_u, z0):
        n = math.hypot(axis_u[0], axis_u[1]) or 1.0
        self.bm, self.slot, self.z0 = bm, slot, float(z0)
        self.U = (axis_u[0] / n, axis_u[1] / n)
        self.V = (-self.U[1], self.U[0])
        self.c = (float(centre[0]), float(centre[1]))
        self.uv = bm.loops.layers.uv.get(UV_LAYER) or bm.loops.layers.uv.new(UV_LAYER)
        self.seam = bm.loops.layers.uv.get(SEAM_LAYER) or bm.loops.layers.uv.new(SEAM_LAYER)
        self.parts = {}
        self.made = []                                                    # every face, in order (pieces recalc theirs)
        self.local = []                                                   # every local point (extents)

    def world(self, p):
        self.local.append(p)
        return Vector((self.c[0] + self.U[0] * p[0] + self.V[0] * p[1], self.c[1] + self.U[1] * p[0] + self.V[1] * p[1],
                       self.z0 + p[2]))

    def grid(self, rows, mat, uvf, part, cyclic=False, flip=False, smooth=True):
        """Quads between consecutive rows of local points (equal lengths; cyclic closes each row). uvf(i, j, jj) ->
        ((u, v), (seam_x, seam_y)) for row i, the face's column j and the corner's column jj (jj = j or j + 1, may equal
        the row length when cyclic). Returns the vertex rows. The normal is (column step) x (row step), reversed by
        flip."""
        verts = [[self.bm.verts.new(self.world(p)) for p in row] for row in rows]
        n = len(rows[0])
        tris = 0
        for i in range(len(rows) - 1):
            for j in range(n if cyclic else n - 1):
                q = [(i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j)]
                if flip:
                    q.reverse()
                vs = [verts[a][b % n] for a, b in q]
                f = self.bm.faces.new(vs)
                f.material_index = self.slot(mat)
                f.smooth = smooth
                self.made.append(f)
                at = {v: (a, b) for v, (a, b) in zip(vs, q)}
                for loop in f.loops:
                    a, b = at[loop.vert]
                    uv, sm = uvf(a, j, b)
                    loop[self.uv].uv = uv
                    loop[self.seam].uv = sm
                tris += 2
        self.parts[part] = self.parts.get(part, 0) + tris
        return verts

    def cap(self, ring, mat, part, uv_xy):
        """A flat n-gon over a vertex ring (its winding fixed later by recalc); uv_xy(local point) -> (u, v)."""
        f = self.bm.faces.new(ring)
        f.material_index = self.slot(mat)
        f.smooth = False
        self.made.append(f)
        for loop in f.loops:
            loop[self.uv].uv = uv_xy(loop.vert)
            loop[self.seam].uv = (1.0, 0.0)
        self.parts[part] = self.parts.get(part, 0) + len(ring) - 2
        return f

    def solid(self, faces):
        bmesh.ops.recalc_face_normals(self.bm, faces=faces)

    def sweep(self, centres, ups, section, mat, part, caps=True, smooth=True):
        """A closed prism along a polyline of local points: the section (x across, y up) in each station's frame
        (side = tangent x up); UVs u along the length, v round the section (metres)."""
        rings, n = [], len(centres)
        for k, c in enumerate(centres):
            t = (centres[min(k + 1, n - 1)] - centres[max(k - 1, 0)]).normalized()
            up = ups[k] - t * ups[k].dot(t)
            up.normalize()
            side = t.cross(up)
            rings.append([c + side * x + up * y for x, y in section])
        acc = [0.0]
        for k in range(1, n):
            acc.append(acc[-1] + (centres[k] - centres[k - 1]).length)
        per = [0.0]
        m = len(section)
        for j in range(1, m + 1):
            a, b = section[j - 1], section[j % m]
            per.append(per[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
        before = len(self.made)
        verts = self.grid(rings, mat, lambda i, j, jj: ((acc[i], per[jj]), (1.0, 0.0)), part, cyclic=True,
                          smooth=smooth)
        if caps:
            for ring in (verts[0], verts[-1]):
                self.cap(list(ring), mat, part, lambda v: (v.co.x, v.co.y))
        self.solid(self.made[before:])
        return verts

    def revolve(self, prof, segs, mat, part, at=(0.0, 0.0), closed=False, smooth=True, phase=0.0):
        """A solid of revolution about the vertical axis through local (u, v) = at: prof [(r, h), ...] from the bottom
        up; closed: the profile is a loop (a tube's section), else r = 0 ends close to a point and the others get flat
        caps. smooth: a bool or one per profile segment. UVs: u along the profile (the grain), v round it."""
        before = len(self.made)
        rings, poles = [], {}
        for idx, (r, h) in enumerate(prof):
            if r <= 1e-9 and not closed:
                poles[idx] = Vector((at[0], at[1], h))
            rings.append([Vector((at[0] + r * math.cos(phase + 2 * math.pi * k / segs),
                                  at[1] + r * math.sin(phase + 2 * math.pi * k / segs), h)) for k in range(segs)])
        acc = [0.0]
        for k in range(1, len(prof)):
            acc.append(acc[-1] + math.hypot(prof[k][0] - prof[k - 1][0], prof[k][1] - prof[k - 1][1]))
        body = [i for i in range(len(prof)) if i not in poles]
        lo, hi = body[0], body[-1]
        seg_rows = [rings[i] for i in range(lo, hi + 1)]
        if closed:
            seg_rows.append(rings[0])
            acc.append(acc[-1] + math.hypot(prof[0][0] - prof[-1][0], prof[0][1] - prof[-1][1]))
        sm = smooth if isinstance(smooth, (list, tuple)) else None
        keep = seg_rows[:-1] if closed else seg_rows
        verts = [[self.bm.verts.new(self.world(p)) for p in row] for row in keep]
        if closed:
            verts.append(verts[0])
        tris = 0
        for i in range(len(verts) - 1):
            pi = lo + i
            r_mid = 0.5 * (prof[pi % len(prof)][0] + prof[(pi + 1) % len(prof)][0])
            for k in range(segs):
                kk = (k + 1) % segs
                vs = [verts[i][k], verts[i][kk], verts[i + 1][kk], verts[i + 1][k]]
                f = self.bm.faces.new(vs)
                f.material_index = self.slot(mat)
                f.smooth = sm[pi] if sm else smooth
                self.made.append(f)
                for loop, (a, b) in zip(f.loops, ((i, k), (i, k + 1), (i + 1, k + 1), (i + 1, k))):
                    loop[self.uv].uv = (acc[lo + a], 2 * math.pi * r_mid * b / segs)
                    loop[self.seam].uv = (1.0, 0.0)
                tris += 2
        for idx, ring in ((lo, verts[0]), (hi, verts[-1])):
            if closed:
                break
            pole_idx = idx - 1 if idx == lo else idx + 1
            if pole_idx in poles:
                c = self.bm.verts.new(self.world(poles[pole_idx]))
                for k in range(segs):
                    f = self.bm.faces.new((ring[k], ring[(k + 1) % segs], c))
                    f.material_index = self.slot(mat)
                    f.smooth = sm[min(idx, pole_idx)] if sm else smooth
                    self.made.append(f)
                    for loop in f.loops:
                        loop[self.uv].uv = (acc[pole_idx], 0.0)
                        loop[self.seam].uv = (1.0, 0.0)
                    tris += 1
            else:
                self.cap(list(ring), mat, part, lambda v: (v.co.x, v.co.y))
        self.parts[part] = self.parts.get(part, 0) + tris
        self.solid(self.made[before:])

    def cylinder(self, a, b, r, segs, mat, part, ref=None):
        """A capped cylinder between local points a and b."""
        axis = (b - a).normalized()
        ref = ref or (Vector((0.0, 0.0, 1.0)) if abs(axis.z) < 0.9 else Vector((1.0, 0.0, 0.0)))
        up = (ref - axis * ref.dot(axis)).normalized()
        self.sweep([a, b], [up, up], _circle(r, segs), mat, part)

    def box(self, c, ax, ay, az, mat, part):
        """A box: centre c, half-extent vectors ax, ay, az (local); UVs box-projected in local metres."""
        corners = [c + ax * sx + ay * sy + az * sz for sz in (-1, 1) for sy in (-1, 1) for sx in (-1, 1)]
        vs = [self.bm.verts.new(self.world(p)) for p in corners]
        made = []
        for q in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            f = self.bm.faces.new([vs[i] for i in q])
            f.material_index = self.slot(mat)
            f.smooth = False
            self.made.append(f)
            nrm = (corners[q[1]] - corners[q[0]]).cross(corners[q[3]] - corners[q[0]])
            axis = max(range(3), key=lambda i: abs(nrm[i]))
            o = [i for i in range(3) if i != axis]
            for loop, i in zip(f.loops, q):
                loop[self.uv].uv = (corners[i][o[0]], corners[i][o[1]])
                loop[self.seam].uv = (1.0, 0.0)
            made.append(f)
        self.parts[part] = self.parts.get(part, 0) + 12
        self.solid(made)


class _Cone:
    """A canopy's surface over its ribs: the canvas's line over rib k (a cone with an upward bow) and its normal; the
    rib angles put the octagon's flats on +-u and +-v."""

    def __init__(self, R, top, rise, bow):
        self.R, self.top, self.rise, self.bow = R, top, rise, bow

    @staticmethod
    def ang(k):
        return math.pi / N + 2.0 * math.pi * k / N

    def line(self, k, t):
        a = self.ang(k)
        return Vector((t * self.R * math.cos(a), t * self.R * math.sin(a),
                       self.top - t * self.rise + self.bow * math.sin(math.pi * t)))

    def tangent(self, k, t):
        a = self.ang(k)
        return Vector((self.R * math.cos(a), self.R * math.sin(a),
                       -self.rise + self.bow * math.pi * math.cos(math.pi * t))).normalized()

    def normal(self, k, t):
        a = self.ang(k)
        return self.tangent(k, t).cross(Vector((-math.sin(a), math.cos(a), 0.0))).normalized()

    def point(self, k, s, t, sag):
        """The canvas at fraction s across panel k (rib k to k + 1) and radial fraction t: the chord between the two
        rib lines, dipped by sag (a fraction of the chord, parabolic across) and raised in a soft ridge over each rib.
        Returns (point, normal, distance to the nearer rib)."""
        A, B = self.line(k, t), self.line(k + 1, t)
        nrm = self.normal(k, t).lerp(self.normal(k + 1, t), s).normalized()
        chord = (B - A).length
        e = min(s, 1.0 - s) * chord
        ridge = BEAD * math.exp(-(e / BEAD_W) ** 2) * _smooth(0.04, 0.2, chord)
        return A.lerp(B, s) + nrm * (ridge - sag * chord * 4.0 * s * (1.0 - s)), nrm, e


def _sheet(u, cone, t_in, sags, scallops, ns, nt, hem, inner_hem, part, uv_off):
    """One canopy's canvas as a cyclic sheet: N panels of ns columns (denser at the seams), nt rows from t_in to the
    scalloped hem, the hem turned under (hem = (fold radius, band width)) and, with inner_hem, the inner edge too.
    Returns edge(k, s) -> (point, outward tangent, normal) of the hem line, for the valance."""
    s_cols = [0.5 - 0.5 * math.cos(math.pi * j / ns) for j in range(ns)]
    cols = [(k, s) for k in range(N) for s in s_cols]
    n = len(cols)
    R = cone.R

    def t_edge(k, s):
        return 1.0 - scallops[k] * 4.0 * s * (1.0 - s) / R

    def taper(t):
        return (1.0 - 0.45 * _smooth(0.8, 1.0, t)) * (0.35 + 0.65 * _smooth(t_in, t_in + 0.2, t))

    def at(k, s, f):
        t = t_in + (t_edge(k, s) - t_in) * f
        p, nrm, e = cone.point(k, s, t, sags[k] * taper(t))
        return p, nrm, e, t

    fs = [1.0 - (1.0 - i / nt) ** 1.3 for i in range(nt + 1)]
    rows, nrms, ts, es = [], [], [], []
    for f in fs:
        got = [at(k, s, f) for k, s in cols]
        rows.append([g[0] for g in got])
        nrms.append([g[1] for g in got])
        es.append([g[2] for g in got])
        ts.append([g[3] for g in got])
    slant = math.hypot(R, cone.rise)
    vv = [[t * slant for t in row] for row in ts]

    def folds(edge_row, prev_row, nrm_row, v_row, r, back, sign):
        """The turned hem's rows past an edge row: round the fold (radius r), then back under it by `back`."""
        out, outv = [], []
        T = [(e - p).normalized() for e, p in zip(edge_row, prev_row)]
        for th in (75.0, 140.0, 180.0):
            a = math.radians(th)
            out.append([e + t * (r * math.sin(a)) - m * (r * (1.0 - math.cos(a)))
                        for e, t, m in zip(edge_row, T, nrm_row)])
            outv.append([v + sign * r * a for v in v_row])
        out.append([e - m * (2.0 * r) - t * back for e, t, m in zip(edge_row, T, nrm_row)])
        outv.append([v + sign * (r * math.pi + back) for v in v_row])
        return out, outv

    hem_rows, hem_v = folds(rows[-1], rows[-2], nrms[-1], vv[-1], hem[0], hem[1], 1.0)
    all_rows, all_v, all_t, all_e = list(rows), list(vv), list(ts), list(es)
    all_rows += hem_rows
    all_v += hem_v
    all_t += [ts[-1]] * len(hem_rows)
    all_e += [es[-1]] * len(hem_rows)
    if inner_hem:
        in_rows, in_v = folds(rows[0], rows[1], nrms[0], vv[0], hem[0], hem[1], -1.0)
        all_rows = in_rows[::-1] + all_rows
        all_v = in_v[::-1] + all_v
        all_t = [ts[0]] * len(in_rows) + all_t
        all_e = [es[0]] * len(in_rows) + all_e
    sin_half = math.sin(math.pi / N)

    def uvf(i, j, jj):
        k = j // ns
        loc = jj - k * ns
        s = 1.0 if loc == ns else s_cols[loc]
        t = all_t[i][jj % n]
        chord = 2.0 * t * R * sin_half
        v = all_v[i][jj % n]
        return ((s - 0.5) * chord + 2.5 * k + uv_off, v), (min(s, 1.0 - s) * chord, v)

    u.grid(all_rows, CANVAS, uvf, part, cyclic=True, flip=True)

    def edge(k, s):
        t = t_edge(k, s)
        p, nrm, _e = cone.point(k, s, t, sags[k] * taper(t))
        q, _n, _e = cone.point(k, s, t - 0.004, sags[k] * taper(t - 0.004))
        return p, (p - q).normalized(), nrm

    return edge


def _flaps(u, cone, edge, rng, H, nf, nr, hem_r, gap, fold, amp, part, uv_off):
    """The valance: one flap per panel hanging from the bottom of the hem's fold (hem_r its radius), gap from each rib
    tip; seeded lean, belly, flutter (amp: its range as a fraction of H) and a sagging bottom edge; the bottom turned
    inward (fold = its radius; 0: a plain edge)."""
    chord = 2.0 * cone.R * math.sin(math.pi / N)
    for k in range(N):
        beta = cone.ang(k) + math.pi / N
        out = Vector((math.cos(beta), math.sin(beta), 0.0))
        lean = rng.uniform(0.02, 0.10) * H                                # the flap's bottom out, this x its depth
        a, fq, ph = rng.uniform(*amp) * H, rng.uniform(1.0, 2.2), rng.uniform(0.0, 1.0)
        belly = rng.uniform(0.02, 0.06) * H                               # bellied out at mid-width
        drop = rng.uniform(0.01, 0.04) * H
        s0 = gap / chord
        ss = [s0 + (1.0 - 2.0 * s0) * j / (nf - 1) for j in range(nf)]
        tops = []
        for s in ss:
            p, T, nrm = edge(k, s)
            tops.append(p - nrm * (2.0 * hem_r) - T * 0.0015)
        rows, vs = [], []
        for i in range(nr + 1):
            row, vr = [], []
            for j, s in enumerate(ss):
                sp = j / (nf - 1)
                hh = (H + drop * 4.0 * sp * (1.0 - sp)) * i / nr
                y = hh / H
                wob = (lean * y ** 1.2 + a * math.sin(2.0 * math.pi * (fq * sp + ph)) * y ** 1.5
                       + belly * math.sin(math.pi * sp) * y)
                row.append(tops[j] + Vector((0.0, 0.0, -hh)) + out * wob)
                vr.append(hh)
            rows.append(row)
            vs.append(vr)
        if fold > 0.0:
            bottom = rows[-1]
            for th in (90.0, 180.0):
                t = math.radians(th)
                rows.append([b - out * (fold * (1.0 - math.cos(t))) - Vector((0.0, 0.0, fold * math.sin(t)))
                             for b in bottom])
                vs.append([v + fold * t for v in vs[nr]])
            rows.append([b - out * (2.0 * fold) + Vector((0.0, 0.0, 0.016)) for b in bottom])
            vs.append([v + fold * math.pi + 0.016 for v in vs[nr]])
        width = (1.0 - 2.0 * s0) * chord

        def uvf(i, j, jj, vs=vs, k=k, width=width):
            return (jj / (nf - 1) * width + 2.0 * k + uv_off, vs[i][jj]), (vs[i][jj], jj / (nf - 1) * width)

        u.grid(rows, CANVAS, uvf, part, flip=True)


def _ribs(u, cone, t0, t1, w, d, gap, mat, part, stations=14, ferrule=True):
    """The ribs under the seams: a rounded section whose top is gap under the canvas line, from t0 to t1, and (ferrule)
    a metal cap on each tip."""
    sec = _rrect(w / 2, d / 2, min(w, d) * 0.25)
    for k in range(N):
        ts = [t0 + (t1 - t0) * i / (stations - 1) for i in range(stations)]
        cs = [cone.line(k, t) - cone.normal(k, t) * (gap + d / 2) for t in ts]
        ups = [cone.normal(k, t) for t in ts]
        u.sweep(cs, ups, sec, mat, part)
        if ferrule:
            tan = cone.tangent(k, t1)
            u.sweep([cs[-1] - tan * 0.032, cs[-1] + tan * 0.003], [ups[-1], ups[-1]],
                    _rrect(w / 2 + 0.002, d / 2 + 0.002, 0.005), METAL, "hardware")


def _struts(u, cone, h_lug, r_lug):
    """The struts: wood bars from the runner's lugs to metal brackets under the ribs, a pin across each end."""
    for k in range(N):
        a = cone.ang(k)
        tang = Vector((-math.sin(a), math.cos(a), 0.0))
        nrm, tan = cone.normal(k, STRUT_T), cone.tangent(k, STRUT_T)
        q = cone.line(k, STRUT_T) - nrm * (RIB_GAP + RIB_D + 0.008)        # the bracket's centre
        u.box(q, tan * 0.018, tang * 0.0135, nrm * 0.008, METAL, "hardware")
        u.cylinder(q - tang * 0.0165, q + tang * 0.0165, 0.003, 8, METAL, "hardware")
        p0 = Vector((r_lug * math.cos(a), r_lug * math.sin(a), h_lug))
        axis = (q - p0).normalized()
        up = axis.cross(tang).normalized()
        u.sweep([p0, q], [up, up], _rrect(STRUT_W / 2, STRUT_D / 2, 0.003), WOOD, "frame")
        radial = Vector((math.cos(a), math.sin(a), 0.0))
        u.box(p0, radial * 0.009, tang * 0.0075, Vector((0.0, 0.0, 0.011)), METAL, "hardware")     # the lug
        u.cylinder(p0 - tang * 0.0105, p0 + tang * 0.0105, 0.0025, 8, METAL, "hardware")


def _halyard(u, pts, r, part="rope"):
    """The halyard along local points (a round section)."""
    ups = []
    for k in range(len(pts)):
        t = (pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)]).normalized()
        ref = Vector((0.0, 0.0, 1.0)) if abs(t.z) < 0.9 else Vector((1.0, 0.0, 0.0))
        ups.append(ref)
    u.sweep(pts, ups, _circle(r, 6), ROPE, part)


def build(bm, slot, centre, axis_u, cfg, z0, seed=0):
    """One umbrella into bm (world coordinates); see the module header for the arguments and the returned dict."""
    rng = random.Random(f"cafe_umbrella:{seed}")
    u = _Umb(bm, slot, centre, axis_u, z0)
    half, rim, top = float(cfg["half"]), float(cfg["rim_z"]), float(cfg["apex_z"])
    H = float(cfg.get("valance", 0.12))
    pole_r = float(cfg.get("pole_r", 0.025))
    R = (half - EDGE_IN) / math.cos(math.pi / N)
    bow = BOW * rng.uniform(0.85, 1.15)
    cone = _Cone(R, top, top - rim, bow)
    off = rng.uniform(0.0, 40.0)
    # canopy and valance
    edge = _sheet(u, cone, VENT_R / R, [rng.uniform(*SAG) for _ in range(N)], [rng.uniform(*SCALLOP) for _ in range(N)],
                  14, 16, (HEM_R, HEM_BACK), True, "canopy", off)
    _flaps(u, cone, edge, rng, H, 13, 5, HEM_R, FLAP_GAP, 0.002, (0.025, 0.06), "valance", off + 30.0)
    # the frame: ribs, hub, struts
    _ribs(u, cone, 0.045 / R, 1.0 - 0.010 / R, RIB_W, RIB_D, RIB_GAP, WOOD, "frame")
    root = cone.line(0, 0.045 / R) - cone.normal(0, 0.045 / R) * (RIB_GAP + RIB_D / 2)
    hh0, hh1 = root.z - 0.032, root.z + 0.028
    u.revolve([(0.0, hh0 - 0.026), (0.031, hh0 - 0.026), (0.031, hh0 - 0.004), (0.054, hh0), (0.062, hh0 + 0.007),
               (0.062, hh1 - 0.006), (0.056, hh1), (0.018, hh1 + 0.004), (0.0, hh1 + 0.004)], 20, WOOD, "frame",
              smooth=[False, True, False, True, True, True, False, False])
    r0, r1, r_run = RUNNER
    ring0, ring1 = r1 + 0.0005, r1 + 0.0245
    _struts(u, cone, 0.5 * (ring0 + ring1), 0.054)
    # the pole: two sections, the joint sleeve, the runner and its pin, the pulley, the halyard and its cleat
    u.revolve([(0.0, 0.0), (pole_r - 0.002, 0.0), (pole_r, 0.002), (pole_r, JOINT + 0.006), (0.0, JOINT + 0.006)], 16,
              WOOD, "pole", smooth=[False, True, True, False])
    u.revolve([(0.0, JOINT - 0.006), (UPPER_R, JOINT - 0.006), (UPPER_R, hh0 - 0.012), (0.0, hh0 - 0.012)], 16, WOOD,
              "pole", smooth=[False, True, False])
    j0, j1 = JOINT - SLEEVE_L / 2, JOINT + SLEEVE_L / 2
    u.revolve([(pole_r + 0.0003, j0), (SLEEVE_R - 0.002, j0), (SLEEVE_R, j0 + 0.004), (SLEEVE_R, j1 - 0.004),
               (SLEEVE_R - 0.002, j1), (pole_r + 0.0003, j1)], 20, METAL, "hardware", closed=True,
              smooth=[False, True, True, True, False, False])
    ri = UPPER_R + 0.0012
    u.revolve([(ri, r0), (r_run - 0.004, r0), (r_run, r0 + 0.006), (r_run, r1 - 0.004), (r_run - 0.003, r1), (ri, r1)],
              20, WOOD, "pole", closed=True, smooth=[False, True, True, True, False, False])
    u.revolve([(ri, ring0), (0.046, ring0), (0.046, ring1), (ri, ring1)], 20, METAL, "hardware", closed=True,
              smooth=[False, True, False, False])
    rope_k = rng.randrange(N)
    ra = 2.0 * math.pi * rope_k / N                                      # the halyard's side, between two ribs
    rad, tng = Vector((math.cos(ra), math.sin(ra), 0.0)), Vector((-math.sin(ra), math.cos(ra), 0.0))
    pin_dir = tng
    u.cylinder(pin_dir * -0.036 + Vector((0, 0, r0 - 0.0042)), pin_dir * 0.036 + Vector((0, 0, r0 - 0.0042)), 0.004,
               8, METAL, "hardware")                                     # the runner's locking pin, under it
    hw = hh0 - 0.075                                                      # the pulley wheel's centre height
    wr, wc = 0.012, 0.040
    for sgn in (-1, 1):                                                   # the cheeks
        u.box(rad * 0.039 + tng * (sgn * 0.0065) + Vector((0, 0, hw)), rad * 0.018, tng * 0.002,
              Vector((0.0, 0.0, 0.024)), METAL, "hardware")
    u.cylinder(rad * wc + tng * -0.004 + Vector((0, 0, hw)), rad * wc + tng * 0.004 + Vector((0, 0, hw)), wr, 16,
               METAL, "hardware")
    u.cylinder(rad * wc + tng * -0.0095 + Vector((0, 0, hw)), rad * wc + tng * 0.0095 + Vector((0, 0, hw)), 0.0025, 8,
               METAL, "hardware")
    rr = 0.0022
    rho = wr - 0.001
    arc = [rad * (wc + rho * math.cos(math.pi * i / 8)) + Vector((0, 0, hw + rho * math.sin(math.pi * i / 8)))
           for i in range(9)]
    inner_x, outer_x = wc - rho, wc + rho
    _halyard(u, [rad * outer_x + Vector((0, 0, hw - 0.002))] + arc + [rad * inner_x + Vector((0, 0, hw - 0.002))], rr)
    _halyard(u, [rad * inner_x + Vector((0, 0, hw - 0.002)), rad * inner_x + Vector((0, 0, ring1))], rr)
    horn = 0.044
    _halyard(u, [rad * outer_x + Vector((0, 0, hw - 0.002)), rad * (horn + 0.003) + Vector((0, 0, CLEAT_H + 0.075))],
             rr)
    _halyard(u, [rad * horn + Vector((0, 0, CLEAT_H - 0.075)), rad * (horn + 0.0015) + Vector((0, 0, CLEAT_H - 0.16)),
              rad * (horn + 0.004) + Vector((0, 0, CLEAT_H - 0.27))], rr)
    u.box(rad * 0.0265 + Vector((0, 0, CLEAT_H)), rad * 0.0035, tng * 0.007, Vector((0, 0, 0.055)), METAL, "hardware")
    for dz in (-0.035, 0.035):
        u.box(rad * 0.0345 + Vector((0, 0, CLEAT_H + dz)), rad * 0.0055, tng * 0.005, Vector((0, 0, 0.007)), METAL,
              "hardware")
    u.box(rad * horn + Vector((0, 0, CLEAT_H)), rad * 0.004, tng * 0.005, Vector((0, 0, 0.072)), METAL, "hardware")
    for dz in (-0.012, 0.012):                                           # two turns round the horn
        ring = [rad * (horn + 0.009 * math.cos(2 * math.pi * i / 10)) + tng * (0.009 * math.sin(2 * math.pi * i / 10))
                + Vector((0, 0, CLEAT_H + dz + 0.004 * math.sin(2 * math.pi * i / 10))) for i in range(11)]
        _halyard(u, ring, rr)
    # the vent cap on the spindle, its rods, the finial
    h_main = cone.line(0, CAP_R / R).z
    cap_rim = h_main + CAP_GAP
    cap_top = cap_rim + CAP_R * CAP_PITCH
    cap = _Cone(CAP_R, cap_top, cap_top - cap_rim, 0.004)
    t_ci = 0.022 / CAP_R
    cap_edge = _sheet(u, cap, t_ci, [rng.uniform(0.015, 0.025) for _ in range(N)],
                      [rng.uniform(0.006, 0.010) for _ in range(N)], 8, 7, (0.0025, 0.014), False, "vent_cap",
                      off + 60.0)
    _flaps(u, cap, cap_edge, rng, CAP_FLAP, 7, 3, 0.0025, 0.003, 0.0, (0.025, 0.05), "vent_cap", off + 90.0)
    _ribs(u, cap, 0.05, 0.95, 0.007, 0.006, 0.0015, METAL, "vent_cap", stations=4, ferrule=False)
    collar = cap.line(0, 0.05).z - cap.normal(0, 0.05).z * 0.0045
    u.revolve([(0.0, collar - 0.03), (0.016, collar - 0.03), (0.016, collar + 0.004), (0.0, collar + 0.004)], 12,
              METAL, "vent_cap", smooth=[False, True, False])
    u.revolve([(0.0, hh1), (0.0105, hh1), (0.0105, collar - 0.028), (0.0, collar - 0.028)], 12, METAL, "frame",
              smooth=[False, True, False])
    hb = cap.line(0, 0.026 / CAP_R).z - 0.002
    fin = [(0.0, hb), (0.027, hb), (0.027, hb + 0.010), (0.022, hb + 0.016), (0.013, hb + 0.022), (0.011, hb + 0.032),
           (0.019, hb + 0.044), (0.0245, hb + 0.058), (0.021, hb + 0.072), (0.012, hb + 0.085), (0.005, hb + 0.096),
           (0.0, hb + 0.101)]
    u.revolve(fin, 20, WOOD, "frame", smooth=[False, True, True, True, True, True, True, True, True, True, True])
    pts = u.local
    return {"tris": sum(u.parts.values()), "parts": dict(u.parts),
            "extent_u": max(abs(p[0]) for p in pts), "extent_v": max(abs(p[1]) for p in pts),
            "top": max(p[2] for p in pts), "bottom": min(p[2] for p in pts),
            "low_r": max((math.hypot(p[0], p[1]) for p in pts if p[2] < LOW_H), default=0.0),
            "rope_angle_deg": round(math.degrees(ra), 1), "R": R}


def to_object(name, coll, bm, slot_names, tags=None):
    """The filled bmesh as a mesh object: materials in slot order, the UVs and smooth flags kept, sharp edges where a
    flat face meets."""
    for e in bm.edges:
        e.smooth = all(f.smooth for f in e.link_faces)
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for s in slot_names:
        me.materials.append(bpy.data.materials.get(s) or bpy.data.materials.new(s))
    ob = bpy.data.objects.new(name, me)
    for k, v in (tags or {}).items():
        ob[k] = v
    coll.objects.link(ob)
    return ob


# ---------------------------------------------------------------- test renders


SHOTS = ("side", "three_q", "under", "b8", "vent", "valance", "pole", "hub")


def _checks(ob, res, centre, cfg, table):
    """The test's checks on one umbrella object: footprint, street contact, the pole's path through the table's hole,
    the canopy's normals up; returns a list of problems."""
    problems = []
    if max(res["extent_u"], res["extent_v"]) > cfg["half"]:
        problems.append(f"outside the old square: {res['extent_u']:.4f} / {res['extent_v']:.4f} > {cfg['half']}")
    if abs(res["bottom"]) > 1e-6:
        problems.append(f"lowest point {res['bottom']:+.5f} m from the street")
    if res["low_r"] >= table["hole_r"] - 0.005:
        problems.append(f"{res['low_r']:.4f} m wide below {LOW_H} m: no 5 mm play in the {table['hole_r']} m hole")
    me = ob.data
    canvas = [i for i, m in enumerate(me.materials) if m and m.name == CANVAS]
    up = down = 0
    for p in me.polygons:
        c = ob.matrix_world @ p.center
        r = math.hypot(c.x - centre[0], c.y - centre[1])
        if p.material_index in canvas and 0.35 < r < 0.85 and c.z > cfg["rim_z"]:
            n = (ob.matrix_world.to_3x3() @ p.normal)
            up, down = up + (n.z > 0.5), down + (n.z < -0.5)
    if down > up // 4:
        problems.append(f"canopy normals: {up} up, {down} down")
    return problems


def _test(argv):
    """Three umbrellas (the café's closest spacing, 2.28 m) round a café table with chairs near (40, -45), before a dark
    storefront-like backdrop, in the open file's composition lighting; the checks, then the views."""
    import furniture_chairs as FC  # noqa: E402
    import furniture_tables_seating as FT  # noqa: E402
    root = BP.ROOT
    opts = dict(a.split("=", 1) for a in argv if "=" in a)
    out = os.path.abspath(opts.get("out", BP.screens('buildings/terramar_recessed/rebuild/umbrella_detail/module')))
    os.makedirs(out, exist_ok=True)
    shots = [s for s in opts.get("shots", ",".join(SHOTS)).split(",") if s]
    scene = bpy.context.scene
    assert "INSPECTION_RIG" in bpy.data.collections, "open terramar_building.blend (its INSPECTION_RIG lights the test)"
    sys.path.insert(0, os.path.dirname(HERE))
    from render_inspection import use_gpu  # noqa: E402
    scene.render.engine = "CYCLES"
    device = use_gpu(scene)
    scene.cycles.samples = int(opts.get("samples", 96))
    scene.cycles.use_denoising = True
    scene.render.resolution_percentage = int(opts.get("pct", 100))
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    materials()
    FT.materials()
    FC.materials()
    coll = bpy.data.collections.new("UMB_TEST")
    scene.collection.children.link(coll)
    with open(BP.script('terramar/building/rebuild/terramar_plan.json'), encoding="utf-8") as fh:
        cafe = json.load(fh)["props"]["sidewalk_cafe"]["config"]                # the café's own umbrella and table
    cfg, tc, U, z0 = cafe["umbrella"], cafe["table"], (1.0, 0.0), 0.0
    C = (40.0, -45.0)
    table = {"kind": "cafe_table", "at": list(C), "face": (0.0, -1.0), "size": [2 * tc["r"], 2 * tc["r"]],
             "top_r": tc["r"], "hole_r": tc["hole"], "h": tc["h"]}

    def new_slots():
        slots = []

        def slot(name):
            if name not in slots:
                slots.append(name)
            return slots.index(name)
        return slots, slot

    obs, results = [], []
    for i, c in enumerate(((C[0] - 2.28, C[1]), C, (C[0] + 2.28, C[1]))):
        bm = bmesh.new()
        slots, slot = new_slots()
        res = build(bm, slot, c, U, cfg, z0, seed=f"test:{i}")
        ob = to_object(f"UMB_TEST_{i}", coll, bm, slots)
        problems = _checks(ob, res, c, cfg, table)
        obs.append(ob)
        results.append(res)
        print(f"UMB {i} tris {res['tris']} parts {res['parts']} extent {res['extent_u']:.4f} / {res['extent_v']:.4f} "
              f"top {res['top']:.3f} low_r {res['low_r']:.4f} rope {res['rope_angle_deg']} R {res['R']:.4f} "
              f"{'OK' if not problems else '; '.join(problems)}")
    bm = bmesh.new()
    slots, slot = new_slots()
    FT.build(bm, table, z0, slot)
    FT.finish_object("UMB_TEST_table", coll, bm, slots)
    for k, a in enumerate((35.0, 155.0, 275.0)):
        d = (math.cos(math.radians(a)), math.sin(math.radians(a)))
        item = {"kind": "cafe_chair", "at": [C[0] + 0.62 * d[0], C[1] + 0.62 * d[1]], "face": [-d[0], -d[1]],
                "size": [0.44, 0.44], "seat_h": 0.45, "back_h": 0.90, "variant": "arm", "set": "umbrella_test"}
        bm = bmesh.new()
        slots, slot = new_slots()
        FC.build(bm, item, z0, slot)
        FC.finish_object(f"UMB_TEST_chair_{k}", coll, bm, slots)
    # the closest approach between neighbours (the café's closest pair stands 2.28 m apart)
    from mathutils.bvhtree import BVHTree
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    trees = [BVHTree.FromObject(o, deps) for o in obs]
    gap = min(trees[2].find_nearest(v.co)[3] for v in obs[1].data.vertices)
    print(f"UMB closest approach between neighbours {gap * 1000:.1f} mm")
    # b8's umbrellas read against the dark shop glass: a dark glazed backdrop behind the row
    bd = bpy.data.materials.new("UMB_TEST_backdrop")
    bd.use_nodes = True
    b = bd.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.03, 0.028, 0.026, 1.0)
    b.inputs["Roughness"].default_value = 0.25
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=(C[0], C[1] + 4.2, 3.0), rotation=(math.pi / 2, 0.0, 0.0))
    plane = bpy.context.active_object
    plane.scale = (16.0, 6.0, 1.0)
    plane.data.materials.append(bd)
    for c in plane.users_collection:
        c.objects.unlink(plane)
    coll.objects.link(plane)
    ra = math.radians(results[1]["rope_angle_deg"])
    rx, ry = math.cos(ra), math.sin(ra)
    cams = {   # name: (location, target, vfov_deg)
        "side": ((C[0] + 0.9, C[1] - 4.6, 1.6), (C[0], C[1], 1.75), 42.0),
        "three_q": ((C[0] + 3.6, C[1] - 4.4, 3.3), (C[0], C[1], 2.0), 38.0),
        "under": ((C[0] + 0.25, C[1] - 0.95, 1.2), (C[0] - 0.05, C[1] + 0.2, 2.5), 74.0),
        "b8": ((C[0] + 0.6, C[1] - 50.0, 1.54), (C[0], C[1], 2.2), 4.6),
        "vent": ((C[0] + 1.2, C[1] - 1.5, 3.5), (C[0], C[1], 2.78), 28.0),
        "valance": ((C[0] + 0.9, C[1] - 2.0, 2.0), (C[0] + 0.3, C[1] - 1.05, 2.22), 34.0),
        "pole": ((C[0] + 1.05 * rx - 0.35 * ry, C[1] + 1.05 * ry + 0.35 * rx, 1.75), (C[0], C[1], 1.78), 52.0),
        "hub": ((C[0] + 0.5 * rx, C[1] + 0.5 * ry, 2.12), (C[0], C[1], 2.6), 44.0),
    }
    cam_data = bpy.data.cameras.new("UMB_TEST_cam")
    cam_data.sensor_fit = "VERTICAL"
    cam_data.clip_start = 0.02
    cam = bpy.data.objects.new("UMB_TEST_cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = 1600, 900
    for name in shots:
        loc, target, vfov = cams[name]
        cam.location = loc
        cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        cam_data.angle_y = math.radians(vfov)
        scene.render.filepath = os.path.join(out, f"umb_{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"rendered {name} on {device} -> {scene.render.filepath}")
    print(f"UMB TEST DONE: {len(obs)} umbrellas (the .blend is not saved)")


if __name__ == "__main__":
    _test(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
