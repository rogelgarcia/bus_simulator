# Prepares fixed bounded PBR tiers from existing images without changing catalog calibration or semantic terrain IDs.
import hashlib
import json
import platform
import sys
from pathlib import Path
import numpy as np
import PIL
from PIL import Image

MAX_PIXELS = 1024 * 1024
WORKING_BYTES = 96 * 1024 * 1024
SIZES = (32, 128, 512)


def read_rgb(file, dimensions):
    with Image.open(file) as image:
        if image.width != image.height or image.width > 1024 or image.width < 512 or image.width & (image.width - 1):
            raise ValueError('Appearance source must be square power-of-two 512..1024 pixels')
        dimensions.append({'file': Path(file).name, 'width': image.width, 'height': image.height, 'mode': image.mode})
        return np.asarray(image.convert('RGB'), dtype=np.uint8).copy()


def reduce_box(values, size):
    factor = values.shape[0] // size
    return values.reshape(size, factor, size, factor, *values.shape[2:]).mean(axis=(1, 3), dtype=np.float32)


def periodic_box(values, radius):
    result = values
    for axis in (0, 1):
        padding = [(0, 0), (0, 0)]
        padding[axis] = (radius, radius)
        padded = np.pad(result, padding, mode='wrap')
        prefix = np.cumsum(padded, axis=axis, dtype=np.float64)
        prefix = np.concatenate((np.zeros_like(np.take(prefix, [0], axis=axis)), prefix), axis=axis)
        width = radius * 2 + 1
        result = ((np.take(prefix, range(width, prefix.shape[axis]), axis=axis)
                   - np.take(prefix, range(prefix.shape[axis] - width), axis=axis)) / width).astype(np.float32)
    return result


def remove_broad_tone(values, radius):
    for channel in range(3):
        original_mean = float(values[:, :, channel].mean())
        logarithm = np.log(np.maximum(values[:, :, channel], 1e-5))
        low = logarithm.copy()
        for _ in range(3):
            low = periodic_box(low, radius)
        detail = np.exp(logarithm - low + float(logarithm.mean()))
        detail *= original_mean / max(float(detail.mean()), 1e-5)
        values[:, :, channel] = np.clip(detail, 0, 1)


def prepare_height(file, dimensions):
    with Image.open(file) as image:
        if image.width != image.height or image.width > 1024 or image.width < 512 or image.width & (image.width - 1):
            raise ValueError('Appearance source must be square power-of-two 512..1024 pixels')
        dimensions.append({'file': Path(file).name, 'width': image.width, 'height': image.height, 'mode': image.mode})
        raw = np.asarray(image)
        if raw.ndim == 3:
            if not np.array_equal(raw[:, :, 0], raw[:, :, 1]) or not np.array_equal(raw[:, :, 0], raw[:, :, 2]):
                raise ValueError('Displacement source must be a scalar height map')
            raw = raw[:, :, 0]
        values = raw.astype(np.float32)
    if not np.all(np.isfinite(values)):
        raise ValueError('Displacement source has non-finite samples')
    center = float(np.median(values))
    lo, hi = np.percentile(values, (1, 99))
    span = max(center - float(lo), float(hi) - center)
    if span <= 1e-6:
        values.fill(.5)
    else:
        values = np.clip((values - center) * (.45 / span) + .5, 0, 1)
    return values, {'algorithm': 'source-height-median-p01-p99-v1', 'sourceMin': float(lo), 'sourceMax': float(hi), 'sourceMedian': center}


def normalize(values):
    norm = np.linalg.norm(values, axis=2, keepdims=True)
    empty = norm[:, :, 0] < 1e-6
    values[empty] = (0, 0, 1)
    norm[empty] = 1
    values /= norm
    return values


def prepare_channel(source, channel, output, *, height=None, preparation=None):
    values = source.astype(np.float32) / 255
    if channel == 'baseColor':
        low = values <= .04045
        values[low] /= 12.92
        values[~low] = ((values[~low] + .055) / 1.055) ** 2.4
        del low
        if preparation and preparation.get('baseColor'):
            remove_broad_tone(values, preparation['baseColor']['radiusPixels'])
    elif channel == 'normal':
        values *= 2
        values -= 1
        normalize(values)
    result = []
    for size in SIZES:
        tier = reduce_box(values, size)
        if channel == 'baseColor':
            low = tier <= .0031308
            tier[low] *= 12.92
            tier[~low] = 1.055 * tier[~low] ** (1 / 2.4) - .055
            del low
        elif channel == 'normal':
            normalize(tier)
            tier += 1
            tier *= .5
        rgba = np.full((size, size, 4), 255, dtype=np.uint8)
        rgba[:, :, :3] = np.rint(np.clip(tier, 0, 1) * 255).astype(np.uint8)
        if height is not None:
            if height.shape != source.shape[:2]:
                raise ValueError('Displacement and ORM source dimensions must match')
            rgba[:, :, 3] = np.rint(reduce_box(height, size) * 255).astype(np.uint8)
        payload = np.flipud(rgba).tobytes()
        sha = hashlib.sha256(payload).hexdigest()
        relative = f'pages/{sha}.rgba8'
        file = output / relative
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(payload)
        result.append({'url': relative, 'width': size, 'height': size, 'encoding': 'rgba8', 'colorSpace': 'srgb' if channel == 'baseColor' else 'linear',
                       'byteLength': len(payload), 'decodedByteLength': len(payload), 'sha256': sha, 'revision': sha})
    return result


def main(request):
    output = Path(request['outputDirectory'])
    dimensions, materials, material_preparation = [], [], []
    for material in request['materials']:
        channels = {}
        for channel in ('baseColor', 'normal'):
            source = read_rgb(material['mapFiles'][channel], dimensions)
            channels[channel] = prepare_channel(source, channel, output, preparation=material.get('preparation'))
            del source
        if 'orm' in material['mapFiles']:
            source = read_rgb(material['mapFiles']['orm'], dimensions)
        else:
            roughness = read_rgb(material['mapFiles']['roughness'], dimensions)[:, :, 0]
            source = np.zeros((*roughness.shape, 3), dtype=np.uint8)
            source[:, :, 0] = read_rgb(material['mapFiles']['ao'], dimensions)[:, :, 0] if 'ao' in material['mapFiles'] else 255
            source[:, :, 1] = roughness
            if 'metalness' in material['mapFiles']:
                source[:, :, 2] = read_rgb(material['mapFiles']['metalness'], dimensions)[:, :, 0]
            del roughness
        lo, hi = np.percentile(source[:, :, 1], material['percentiles']) / 255
        height, height_report = prepare_height(material['mapFiles']['displacement'], dimensions) if 'displacement' in material['mapFiles'] else (None, None)
        channels['orm'] = prepare_channel(source, 'orm', output, height=height)
        del source
        tiers = [{'id': str(size), 'resolution': size, 'channels': {channel: pages[i] for channel, pages in channels.items()}} for i, size in enumerate(SIZES)]
        entry = {'soilId': material['soilId'], 'roughnessInputRange': {'min': float(lo), 'max': float(hi)}, 'tiers': tiers}
        if height is not None:
            entry['height'] = {'encoding': 'orm-alpha-unorm8', 'interpretation': 'relative-relief', 'neutral': .5}
        materials.append(entry)
        material_preparation.append({'soilId': material['soilId'], 'materialId': material['materialId'],
                                     'baseColor': (material.get('preparation') or {}).get('baseColor'), 'height': height_report})
        del height
        print(f"Prepared {material['soilId']}: 32/128/512 RGB-normal-ORM pages", flush=True)
    report = {'materials': materials, 'sourceDimensions': dimensions, 'materialPreparation': material_preparation, 'maximumSourcePixels': MAX_PIXELS, 'workingByteLimit': WORKING_BYTES,
              'converter': {'python': platform.python_version(), 'pillow': PIL.__version__, 'numpy': np.__version__, 'filter': 'linear-light-box/normalized-vector-box/linear-orm-height-box'}}
    (output / 'conversion.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main(json.loads(Path(sys.argv[1]).read_text(encoding='utf-8')))
