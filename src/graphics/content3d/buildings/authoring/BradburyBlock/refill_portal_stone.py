"""Rebuild the portal's stone in the saved files, in place, after portal_lib's stone changes (2026-10-08: the ground-floor
pack's entrance terracotta in place of the dressed sandstone).

    blender -b -P refill_portal_stone.py

mat_sandstone() hands back a material that already exists, so rerunning a piece keeps the stone a file was first built
with; this refills it instead. In bradbury_portal.blend and every ornaments/*.blend: each local PORTAL_sandstone and
PORTAL_sandstone_carved material (with any .001 suffix) is rebuilt by portal_lib.fill_sandstone, and the two decals tinted
onto the wall's stone -- PORTAL_lettering and PORTAL_frieze_flowers, pieces/08_frieze.py -- have their tint retargeted
onto the new SANDSTONE_SRGB (the gain is the wall's linear colour over the image's opaque texels' mean, as the piece
computes it). Each file is saved only if something changed; the wear layer and the scene take it on their next rebuild
(python use_capital_stage.py 2 --from block).
"""
import bpy, glob, os, re, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.join(HERE, "portal_lib.py")
exec(compile(open(LIB, encoding="utf-8").read(), LIB, "exec"))
ROOT = os.path.abspath(os.path.join(HERE, *([".."] * 6)))
ART = os.path.join(ROOT, "tests", "artifacts", "blender", "bradbury", "portal_project")
FILES = [os.path.join(ART, "bradbury_portal.blend")] + sorted(glob.glob(os.path.join(ART, "ornaments", "*.blend")))
STONE_RX = re.compile(r"^PORTAL_sandstone(_carved)?(\.\d+)?$")
DECAL_RX = re.compile(r"^PORTAL_(lettering|frieze_flowers)(\.\d+)?$")
wall = np.array([_srgb_to_lin(v / 255.0) for v in SANDSTONE_SRGB])


def retint(m):
    nt = m.node_tree
    base = next((n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image and n.image.colorspace_settings.name == 'sRGB'), None)
    tint = next((n for n in nt.nodes if n.type == 'MIX' and n.blend_type == 'MULTIPLY' and base is not None
                 and any(l.from_node == base for i in n.inputs for l in i.links)), None)
    if base is None or tint is None: return None
    im = base.image; W, H = im.size
    px = np.empty(W * H * 4, dtype=np.float32); im.pixels.foreach_get(px); px = px.reshape(-1, 4)
    lin = px[:, :3][px[:, 3] > 0.99].astype(np.float64)
    lin = np.where(lin <= 0.04045, lin / 12.92, ((lin + 0.055) / 1.055) ** 2.4).mean(0)
    b = next(i for i in tint.inputs if i.identifier == "B_Color")
    old = tuple(b.default_value)[:3]
    b.default_value = tuple(float(g) for g in wall / lin) + (1.0,)
    m.diffuse_color = tuple(float(v) for v in wall * 0.8) + (1.0,)
    return old, tuple(b.default_value)[:3]


for fp in FILES:
    if not os.path.isfile(fp): print("missing", fp); continue
    bpy.ops.wm.open_mainfile(filepath=fp)
    stones, decals = [], []
    for m in bpy.data.materials:
        if m.library is not None or not m.use_nodes: continue
        if STONE_RX.match(m.name):
            fill_sandstone(m, joints=False); stones.append(m.name)
        elif DECAL_RX.match(m.name):
            r = retint(m)
            if r: decals.append(f"{m.name} gain ({', '.join(f'{v:.3f}' for v in r[0])}) -> ({', '.join(f'{v:.3f}' for v in r[1])})")
    rel = os.path.relpath(fp, ART)
    if not stones and not decals:
        print(f"{rel}: no portal stone here"); continue
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=fp, compress=True, relative_remap=True)
    print(f"{rel}: refilled {', '.join(stones) or 'no stone'}" + "".join(f"; {d}" for d in decals))
d, tile = sandstone_dir()
print(f"REFILL DONE: the portal's stone is {os.path.basename(d)} at {tile:g} m a tile, onto sRGB {SANDSTONE_SRGB}")
