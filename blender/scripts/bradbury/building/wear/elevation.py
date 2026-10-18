# Elevations: each face drawn square on as the street sees it, coloured by material class, with a feature's mask laid
# over it in the feature's debug colour. A 2D check of where marks land, and against what, before any render:
#   blender -b -P wear_layer.py -- elevations=1      (tests/artifacts/screens/bradbury_wear/elevations/)
import os
import numpy as np
from . import geometry as geo, classes

PALETTE = {classes.NONE: (0.30, 0.30, 0.30), classes.BRICK: (0.78, 0.38, 0.28), classes.TERRACOTTA: (0.90, 0.62, 0.42),
           classes.STONE: (0.74, 0.69, 0.56), classes.GLASS: (0.32, 0.58, 0.86), classes.METAL: (0.08, 0.08, 0.08),
           classes.PAINT: (0.25, 0.62, 0.32), classes.WOOD: (0.48, 0.30, 0.12), classes.GLAZED: (0.60, 0.62, 0.86)}


def _class_rgb(C):
    rgb = np.ones(C.shape + (3,))
    for c, col in PALETTE.items(): rgb[C == c] = col
    return rgb


def _mask_on(block_res, F, S, Z, mask, mres):
    # sample a feature's atlas (rows from z0 up) at the elevation's texel centres (nearest texel)
    H, W = mask.shape[:2]
    cols = np.clip(((F.off + (S - F.s0)) / mres).astype(np.int64), 0, W - 1)
    rows = np.clip(((Z - geo.ATLAS.z0) / mres).astype(np.int64), 0, H - 1)
    return mask[rows, cols]


def write(block, specs, results, canvases, outdir, res=0.05, log=print):
    """class elevation per face (<face>.png) and, per feature, its mask over each face it marks (<feature>_<face>.png);
    canvases: {feature: (H, W, C) array} for the features whose masks are in memory, others are read from masks/."""
    os.makedirs(outdir, exist_ok=True)
    made = []
    for F in geo.FACADES:
        fm = block.front_map(F.idx, res)
        base = _class_rgb(fm["C"])
        geo.write_png(os.path.join(outdir, f"{F.name}.png"), base, 8); made.append(f"{F.name}.png")
        grey = 0.35 + 0.45 * base.mean(axis=2, keepdims=True)
        for spec in specs:
            cv = canvases.get(spec.NAME)
            if cv is None: continue
            # a feature whose channel 0 is not its marks on the facade (AI 572 keeps other data in rows of its own)
            # says what to draw with elevation(canvas) -> (H, W); the others draw channel 0
            ch = spec.elevation(cv) if hasattr(spec, "elevation") else cv[:, :, 0]
            m = _mask_on(res, F, fm["S"], fm["Z"], ch, results[spec.NAME].mask["res"])
            if not (m > 0).any(): continue
            col = np.array(spec.DEBUG_COLOR)[None, None, :]
            out = grey * (1 - m[:, :, None]) + col * m[:, :, None]
            geo.write_png(os.path.join(outdir, f"{spec.NAME}_{F.name}.png"), out, 8); made.append(f"{spec.NAME}_{F.name}.png")
    log(f"elevations at {res * 100:.0f} cm: {len(made)} images in {outdir}")
    return made


def read_mask(path):
    # a mask PNG back as an (H, W, C) float array with row 0 = the atlas's bottom
    import bpy
    img = bpy.data.images.load(path, check_existing=False); img.colorspace_settings.name = 'Non-Color'
    w, h = img.size
    buf = np.empty(w * h * img.channels, np.float32); img.pixels.foreach_get(buf)
    a = buf.reshape(h, w, img.channels)
    bpy.data.images.remove(img)
    return a
