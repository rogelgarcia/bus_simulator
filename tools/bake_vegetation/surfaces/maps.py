# Keeps photographic channels registered while deriving review-ready map packs.
import json
from pathlib import Path
import bpy
import numpy as np


def read_pixels(path, size=None):
    image = bpy.data.images.load(str(path), check_existing=False)
    image.colorspace_settings.name = 'Non-Color'
    if size:
        image.scale(*size)
    width, height = image.size
    pixels = np.empty(width * height * 4, np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    return pixels.reshape(height, width, 4)[::-1, :, :3].copy()


def write_pixels(path, pixels):
    height, width = pixels.shape[:2]
    if pixels.ndim == 2:
        pixels = np.repeat(pixels[:, :, None], 3, axis=2)
    rgba = np.ones((height, width, 4), np.float32)
    rgba[:, :, :3] = np.clip(pixels, 0, 1)
    image = bpy.data.images.new(path.stem, width=width, height=height, alpha=False)
    image.colorspace_settings.name = 'Non-Color'
    image.pixels.foreach_set(np.ascontiguousarray(rgba[::-1]).ravel())
    image.filepath_raw = str(path); image.file_format = 'PNG'; image.save()
    bpy.data.images.remove(image)


def sample(array, uv, repeat=False):
    h, w = array.shape[:2]
    p = (uv % 1 if repeat else np.clip(uv, 0, 1)) * [w - 1, h - 1]
    x, y = p[:, 0], p[:, 1]
    a, b = x.astype(int), y.astype(int)
    c, d = np.minimum(a + 1, w - 1), np.minimum(b + 1, h - 1)
    fx, fy = x - a, y - b
    if array.ndim == 3:
        fx, fy = fx[:, None], fy[:, None]
    return (array[b, a] * (1-fx) + array[b, c] * fx) * (1-fy) + (array[d, a] * (1-fx) + array[d, c] * fx) * fy


def map_paths(root, source, leaf=False):
    suffixes = {'color': '_Color.jpg', 'normal': '_NormalGL.jpg', 'height': '_Displacement.jpg',
                'roughness': '_Roughness.jpg', 'mask': '_Opacity.jpg'} if leaf else {
                'color': '_diff_', 'normal': '_nor_gl_', 'height': '_disp_', 'roughness': '_rough_'}
    return {key: root / next(v['file'] for name, v in source['maps'].items() if suffix in name)
            for key, suffix in suffixes.items()}


def extend_scan(array):
    # Four registered photographic crops break the obvious one-metre knot repeat.
    shifts = [(0,0),(317,853),(937,1513),(127,389)]
    tiles = [np.roll(array, shift, axis=(0,1))[::2].copy() for shift in shifts]
    rows = len(tiles[0]); ramp = np.clip((np.arange(rows)/rows-.76)/.24,0,1)
    ramp = (ramp*ramp*(3-2*ramp))[:,None,None]
    return np.concatenate([tile*(1-ramp)+tiles[(i+1)%4]*ramp for i,tile in enumerate(tiles)])


def padding_indices(mask):
    valid=mask>.52;h,w=valid.shape
    row_valid=valid.any(axis=1); row_ids=np.arange(h)
    before=np.maximum.accumulate(np.where(row_valid,row_ids,-h))
    after=np.minimum.accumulate(np.where(row_valid,row_ids,2*h)[::-1])[::-1]
    nearest=np.where(row_ids-before<after-row_ids,before,after).clip(0,h-1)
    valid=valid[nearest]
    cols=np.arange(w)[None,:]
    left=np.maximum.accumulate(np.where(valid,cols,-w),axis=1)
    right=np.minimum.accumulate(np.where(valid,cols,2*w)[:,::-1],axis=1)[:,::-1]
    nearest_col=np.where(cols-left<right-cols,left,right).clip(0,w-1)
    return nearest[:,None],nearest_col


def prepare(root, output, recipes):
    sources = json.loads((Path(__file__).parent / 'sources.json').read_text())['sources']
    prepared = {}
    for species, recipe in recipes.items():
        folder = output / 'pbr' / species; folder.mkdir(parents=True, exist_ok=True)
        bark = {}
        for channel, path in map_paths(root, sources[recipe['bark']]).items():
            array = read_pixels(path, (2048, 2048))
            if channel == 'color':
                array *= recipe['barkTint']
            array = extend_scan(array)
            if channel == 'normal':
                normal=array*2-1
                normal/=np.maximum(np.linalg.norm(normal,axis=2,keepdims=True),1e-8)
                array=normal*.5+.5
            target = folder / ('bark_' + channel + '.png')
            write_pixels(target, array)
            bark[channel] = target
        leaf = {}
        x0, y0, x1, y1 = recipe['crop']
        source_paths=map_paths(root, sources[recipe['leaf']], True)
        mask=read_pixels(source_paths['mask'])[:,:,0]
        height,width=mask.shape
        mask=np.rot90(mask[round(y0*height):round(y1*height),round(x0*width):round(x1*width)],recipe['rotate'])
        nearest=padding_indices(mask)
        for channel, path in source_paths.items():
            array = read_pixels(path)
            height, width = array.shape[:2]
            array = array[round(y0*height):round(y1*height), round(x0*width):round(x1*width)]
            array = np.rot90(array, recipe['rotate']).copy()
            if channel != 'mask': array=array[nearest]
            if channel == 'normal' and recipe['rotate']:
                old = array.copy(); array[:, :, 0] = 1-old[:, :, 1]; array[:, :, 1] = old[:, :, 0]
            if channel == 'color':
                front = array * recipe['leafTint']
                back = array * recipe['backTint']
                if species == 'silver_linden':
                    luminance = array.mean(axis=2, keepdims=True)
                    back = luminance * .40 + np.array([.46, .48, .41])
            elif channel == 'roughness':
                front = np.clip(.34 + array * .34, .34, .76)
                back = np.clip(front + (.23 if species == 'silver_linden' else .12), 0, .98)
            else:
                front = array; back = array.copy()
            # Top half: upper surface. Bottom half: underside. No alpha material is used.
            target = folder / ('leaf_' + channel + '.png')
            write_pixels(target, np.concatenate([front, back]))
            leaf[channel] = target
        prepared[species] = {'bark': bark, 'leaf': leaf}
        print('[Photo PBR] Prepared', species, flush=True)
    return prepared
