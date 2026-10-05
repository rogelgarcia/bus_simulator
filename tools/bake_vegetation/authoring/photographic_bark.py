# Authenticates and samples CC0 bark photographs for fused wood and residual PBR maps.
import hashlib
import json
from functools import lru_cache
from pathlib import Path

import bpy
import numpy as np


def linear(encoded):
    return np.where(encoded <= .04045, encoded / 12.92, ((encoded + .055) / 1.055) ** 2.4)


def encoded(value):
    return np.where(value <= .0031308, value * 12.92, 1.055 * np.maximum(value, 0) ** (1 / 2.4) - .055)


def blur(values, sigma):
    height, width = values.shape[:2]
    frequency = np.fft.fftfreq(height)[:, None] ** 2 + np.fft.rfftfreq(width)[None, :] ** 2
    weight = np.exp(-2 * np.pi ** 2 * sigma ** 2 * frequency)
    if values.ndim == 3:
        weight = weight[:, :, None]
    return np.fft.irfft2(np.fft.rfft2(values, axes=(0, 1)) * weight, s=(height, width), axes=(0, 1)).astype(np.float32)


@lru_cache(maxsize=1)
def source_maps(source):
    directory = Path(__file__).parents[1] / source
    provenance = json.loads((directory / 'source.json').read_text(encoding='utf8'))
    maps = {}
    for name, record in provenance['maps'].items():
        filename = Path(__file__).parents[3] / provenance['inputDirectory'] / record['file']
        if hashlib.sha256(filename.read_bytes()).hexdigest() != record['sha256']:
            raise RuntimeError(f'Photographic bark source changed: {filename}')
        image = bpy.data.images.load(str(filename), check_existing=False)
        image.colorspace_settings.name = 'Non-Color'
        pixels = np.empty(image.size[0] * image.size[1] * 4, np.float32)
        image.pixels.foreach_get(pixels)
        maps[name] = pixels.reshape((image.size[1], image.size[0], 4))[:, :, :3].copy()
        bpy.data.images.remove(image)
    maps['color'] = linear(maps['color'])
    maps['macro'] = blur(maps['color'], 12)
    maps['height'] = blur(maps['height'][:, :, 0], 3)
    return maps


def sample(values, uv):
    height, width = values.shape[:2]
    x, y = (uv[:, 0] % 1) * width - .5, (uv[:, 1] % 1) * height - .5
    ix, iy = np.floor(x).astype(np.int32), np.floor(y).astype(np.int32)
    fx, fy = x - ix, y - iy
    if values.ndim == 3:
        fx, fy = fx[:, None], fy[:, None]
    return ((values[iy % height, ix % width] * (1 - fx) + values[iy % height, (ix + 1) % width] * fx) * (1 - fy)
            + (values[(iy + 1) % height, ix % width] * (1 - fx) + values[(iy + 1) % height, (ix + 1) % width] * fx) * fy)


def surface(source, uv):
    maps = source_maps(source)
    return sample(maps['height'], uv), sample(maps['macro'], uv)


def residual_maps(source, directory, size, png):
    maps = source_maps(source)
    if maps['color'].shape[:2] != (size, size):
        raise RuntimeError('Photographic bark source size must match the declared bake size')
    luminance = np.array([.2126, .7152, .0722])
    ratio = (maps['color'] @ luminance) / np.maximum(maps['macro'] @ luminance, .001)
    rgb = np.repeat(encoded(linear(224 / 255) * ratio)[:, :, None], 3, axis=2)
    normals = maps['normal'] * 2 - 1
    normals[:, :, :2] *= .6
    normals /= np.maximum(np.linalg.norm(normals, axis=2, keepdims=True), .0001)
    rough = np.clip(maps['roughness'][:, :, 0], .68, .98)
    png(directory / 'bark_basecolor.png', np.flipud(rgb * 255))
    png(directory / 'bark_normal.png', np.flipud((normals * .5 + .5) * 255))
    png(directory / 'bark_orm.png', np.flipud(np.stack([np.ones_like(rough), rough, np.zeros_like(rough)], axis=2) * 255))
