# Authors original species-specific bark and leafy twig atlases from deterministic recipes.
import math
import struct
import zlib
from pathlib import Path

import numpy as np

from bark_fields import BARK_U_METERS, BARK_V_METERS, sample_bark


def png(path, pixels):
    pixels = np.asarray(np.clip(pixels, 0, 255), dtype=np.uint8)
    height, width, channels = pixels.shape
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    raw = b''.join(b'\x00' + row.tobytes() for row in pixels)
    header = struct.pack('>IIBBBBB', width, height, 8, 6 if channels == 4 else 2, 0, 0, 0)
    Path(path).write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


LEAF = np.array([[0, -.40], [-.35, -.42], [-.62, -.18], [-.59, .03], [-.91, .25],
                 [-.66, .36], [-.66, .67], [-.38, .55], [0, 1.0], [.38, .55],
                 [.66, .67], [.65, .35], [.92, .22], [.58, -.03], [.62, -.24], [.30, -.41]], dtype=float)


def leaf_outline(kind):
    if kind == 'plane':
        return LEAF
    if kind == 'linden':
        return np.array([[0, -.18], [-.24, -.43], [-.52, -.45], [-.73, -.26], [-.81, .02],
                         [-.77, .29], [-.57, .55], [-.31, .72], [-.12, .83], [0, 1.06],
                         [.16, .80], [.43, .65], [.68, .42], [.80, .14], [.77, -.16],
                         [.56, -.39], [.26, -.43]])
    if kind == 'oak':
        return np.array([[0, -.58], [-.19, -.49], [-.36, -.38], [-.27, -.22], [-.55, -.13],
                         [-.34, .03], [-.64, .22], [-.38, .32], [-.57, .59], [-.30, .57],
                         [-.30, .84], [0, 1.11], [.30, .85], [.29, .56], [.58, .59],
                         [.37, .31], [.64, .22], [.33, .03], [.55, -.14], [.27, -.23], [.35, -.39], [.17, -.49]])
    if kind == 'viburnum':
        return np.array([[.66 * math.sin(t) * (.88 + .12 * math.cos(t)), .18 + .78 * math.cos(t)]
                         for t in np.linspace(0, math.tau, 32, endpoint=False)])
    raise ValueError(f'Unknown leaf silhouette: {kind}')


def bark_maps(directory, size, recipe):
    if recipe.get('photographicBark'):
        from photographic_bark import residual_maps
        residual_maps(recipe['photographicBark'], directory, size, png)
        return
    kind = recipe['bark']
    fields = {name: np.empty((size, size), np.float32)
              for name in ['height', 'furrow', 'rim', 'weather', 'grain', 'detail', 'plate']}
    for start in range(0, size, 128):
        yy, xx = np.mgrid[start:min(start + 128, size), 0:size]
        sampled = sample_bark(kind, (xx + .5) / size, 1 - (yy + .5) / size)
        for name, values in sampled.items():
            fields[name][start:start + values.shape[0]] = values
    grain = fields['grain']
    # Macro color lives on the fused mesh, so texture chart boundaries carry only fine grain.
    grain_contrast = {'mottled': 22, 'ridged_gray': 26, 'oak_furrows': 30, 'shrub_bark': 20, 'elm_ridges': 28}[kind]
    rgb = np.repeat((224 + grain * grain_contrast)[:, :, None], 3, axis=2)
    rough = {'mottled': 194, 'ridged_gray': 202, 'oak_furrows': 210, 'shrub_bark': 194, 'elm_ridges': 208}[kind] + grain * 7
    detail_meters = {'mottled': .00025, 'ridged_gray': .00055, 'oak_furrows': .0007, 'shrub_bark': .00025, 'elm_ridges': .0006}[kind]
    residual = grain * detail_meters
    dx = (np.roll(residual, -1, 1) - np.roll(residual, 1, 1)) * size / (2 * BARK_U_METERS)
    dy = (np.roll(residual, 1, 0) - np.roll(residual, -1, 0)) * size / (2 * BARK_V_METERS)
    normals = np.stack([-dx, -dy, np.ones_like(dx)], axis=2)
    normals /= np.linalg.norm(normals, axis=2, keepdims=True)
    png(directory / 'bark_basecolor.png', rgb)
    png(directory / 'bark_normal.png', (normals * .5 + .5) * 255)
    png(directory / 'bark_orm.png', np.stack([np.full((size, size), 255), rough, np.zeros((size, size))], axis=2))


def polygon_mask(x, y, polygon):
    inside = np.zeros(x.shape, bool)
    for point, previous in zip(polygon, np.roll(polygon, 1, axis=0)):
        px, py = point
        qx, qy = previous
        crossing = (py > y) != (qy > y)
        denominator = qy - py if qy != py else 1e-12
        inside ^= crossing & (x < (qx - px) * (y - py) / denominator + px)
    return inside


def line_distance(x, y, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = np.clip(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy), 0, 1)
    return np.hypot(x - a[0] - t * dx, y - a[1] - t * dy)


def leaf_maps(directory, size, recipe):
    scale = 2
    total = size * scale
    cell = total // 2
    rgba = np.zeros((total, total, 4), np.float32)
    rgba[:, :, :3] = [64, 107, 31]
    normal = np.zeros((total, total, 3), np.float32)
    normal[:] = [127.5, 127.5, 255]
    roughness = np.zeros((total, total, 3), np.float32)
    roughness[:] = [255, 163, 0]
    for tile in range(4):
        paired = recipe['leaf'] == 'linden'
        shape_tile = tile % 2 if paired else tile
        rng = np.random.default_rng(recipe['seed'] + shape_tile)
        ox, oy = (tile % 2) * cell, (tile // 2) * cell
        yy, xx = np.mgrid[0:cell, 0:cell] / cell
        stem_x = .48 + .055 * np.sin(yy * 3 + shape_tile)
        stem = np.abs(xx - stem_x) < (.0038 * (1 - yy) + .0018)
        stem &= (yy > .035) & (yy < .91)
        target = rgba[oy:oy + cell, ox:ox + cell]
        target[stem] = [94, 102, 44, 255]
        for index in range(recipe['leafCount']):
            side = -1 if index % 2 == 0 else 1
            origin_y = .16 + index * .078 if recipe['leaf'] != 'viburnum' else .17 + (index // 2) * .16
            center = np.array([.5 + side * rng.uniform(.17, .235), origin_y + .05])
            if index == 8:
                center = np.array([.5, .80])
            elif index > 8:
                origin_y = .20 + (index - 9) * .17
                center = np.array([.5 + side * .055, origin_y])
            angle = side * rng.uniform(.60, 1.2) if index != 8 else .1
            radius = rng.uniform(*recipe['leafRadius'])
            cs, sn = math.cos(angle), math.sin(angle)
            local_x = (xx - center[0]) * cs / radius - (yy - center[1]) * sn / radius
            local_y = (xx - center[0]) * sn / radius + (yy - center[1]) * cs / radius
            serrated = []
            outline = leaf_outline(recipe['leaf'])
            teeth = {'plane': .006, 'linden': .018, 'oak': .003, 'viburnum': .034}[recipe['leaf']]
            for a, b in zip(outline, np.roll(outline, -1, axis=0)):
                for step in range(4):
                    t = step / 4
                    point = a * (1 - t) + b * t
                    if step % 2:
                        point *= 1 + teeth
                    serrated.append(point)
            mask = polygon_mask(local_x, local_y, np.array(serrated))
            base_y = {'plane': -.40, 'linden': -.18, 'oak': -.58, 'viburnum': -.60}[recipe['leaf']]
            leaf_base = center + np.array([-sn, cs]) * (base_y * radius)
            attach = [.48 + .055 * math.sin(origin_y * 3 + shape_tile), origin_y - .045]
            petiole = line_distance(xx, yy, attach, leaf_base) < .0023
            target[petiole] = [96, 112, 42, 255]
            vein = np.full(xx.shape, 10.0)
            if recipe['leaf'] in ['plane', 'linden']:
                for endpoint in [[0, .98], [-.64, .60], [.64, .63], [-.72, .18], [.72, .18]]:
                    vein = np.minimum(vein, line_distance(local_x, local_y, [0, base_y], endpoint))
            else:
                vein = line_distance(local_x, local_y, [0, base_y], [0, 1.0])
                for row in range(5):
                    y = -.30 + row * .24
                    for sign in [-1, 1]:
                        vein = np.minimum(vein, line_distance(local_x, local_y, [0, y - .12], [sign * .52, y + .18]))
            vein_tint = np.exp(-vein * 100)
            fine = np.sin(local_x * 43 + local_y * 20) * np.sin(local_y * 61) * 1.2
            mottling = np.sin(local_x * 7 + shape_tile) * np.cos(local_y * 9 + index) * 3.5
            base_color = recipe['backColor'] if paired and tile >= 2 else recipe['baseColor']
            color = np.array(base_color) + np.array([3, 5, 1.5]) * shape_tile + rng.uniform(-7, 7)
            color_map = color + (fine + mottling)[:, :, None] + vein_tint[:, :, None] * np.array([17, 17, 8])
            target[mask, :3] = color_map[mask]
            target[mask, 3] = 255
            nx = local_x * .15 + np.sin(local_y * 7) * .035
            ny = (local_y - .3) * .14
            normals = np.stack([-nx * cs - ny * sn, nx * sn - ny * cs, np.ones_like(nx)], axis=2)
            normals /= np.linalg.norm(normals, axis=2, keepdims=True)
            normal[oy:oy + cell, ox:ox + cell][mask] = (normals[mask] * .5 + .5) * 255
            roughness[oy:oy + cell, ox:ox + cell][mask, 1] = recipe['leafRoughness'] + vein_tint[mask] * 21 + mottling[mask]
    alpha = rgba[:, :, 3] / 255
    for _ in range(12):
        covered = alpha > 0
        count = np.zeros_like(alpha)
        sums = np.zeros((total, total, 3), np.float32)
        for axis, shift in [(0, 1), (0, -1), (1, 1), (1, -1)]:
            neighbor = np.roll(covered, shift, axis)
            count += neighbor
            sums += np.roll(rgba[:, :, :3], shift, axis) * neighbor[:, :, None]
        fill = ~covered & (count > 0)
        rgba[fill, :3] = sums[fill] / count[fill, None]
        alpha[fill] = 1
    def reduce(image):
        return image.reshape(size, scale, size, scale, image.shape[2]).mean(axis=(1, 3))
    png(directory / 'foliage_basecolor.png', reduce(rgba))
    png(directory / 'foliage_normal.png', reduce(normal))
    png(directory / 'foliage_orm.png', reduce(roughness))


def create_maps(directory, size, recipe, bark_size=None):
    directory.mkdir(parents=True, exist_ok=True)
    bark_maps(directory, size if bark_size is None else bark_size, recipe)
    from leaf_surfaces import solid_leaf_maps
    solid_leaf_maps(directory, size, recipe, png)
