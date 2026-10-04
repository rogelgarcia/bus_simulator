# Prepares fixed bounded PBR tiers from existing images without changing catalog calibration or semantic terrain IDs.
import hashlib
import json
import math
import platform
import sys
import tracemalloc
from pathlib import Path
import numpy as np
import PIL
from PIL import Image

MAX_PIXELS = 1024 * 1024
WORKING_BYTES = 96 * 1024 * 1024
SIZES = (32, 128, 512)
EXTRA_SIZES = (1024,)
MICRO_SIZES = (32, 128, 512, 1024)
MICRO_ALGORITHM = 'micro-periodic-highpass-v1'
MICRO_ENCODING = 'micro-normal-height-luminance-v1'


def read_rgb(file, dimensions):
    with Image.open(file) as image:
        if image.width != image.height or image.width > 1024 or image.width < 512 or image.width & (image.width - 1):
            raise ValueError('Appearance source must be square power-of-two 512..1024 pixels')
        dimensions.append({'file': Path(file).name, 'width': image.width, 'height': image.height, 'mode': image.mode})
        return np.asarray(image.convert('RGB'), dtype=np.uint8).copy()


def reduce_box(values, size):
    if size > values.shape[0] or values.shape[0] % size:
        raise ValueError(f'A {size}-pixel tier needs a source of at least {size} pixels; upsampling is not allowed')
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


def periodic_lowpass(values, radius):
    for _ in range(3):
        values = periodic_box(values, radius)
    return values


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


def read_height(file, dimensions):
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
    return values


def normalize_relief(values):
    center = float(np.median(values))
    lo, hi = np.percentile(values, (1, 99))
    span = max(center - float(lo), float(hi) - center)
    if span <= 1e-6:
        values.fill(.5)
    else:
        values = np.clip((values - center) * (.45 / span) + .5, 0, 1)
    return values, center, float(lo), float(hi)


def prepare_height(file, dimensions):
    values, center, lo, hi = normalize_relief(read_height(file, dimensions))
    return values, {'algorithm': 'source-height-median-p01-p99-v1', 'sourceMin': lo, 'sourceMax': hi, 'sourceMedian': center}


def normalize(values):
    norm = np.linalg.norm(values, axis=2, keepdims=True)
    empty = norm[:, :, 0] < 1e-6
    values[empty] = (0, 0, 1)
    norm[empty] = 1
    values /= norm
    return values


def write_page(rgba, output, color_space):
    payload = np.flipud(rgba).tobytes()
    sha = hashlib.sha256(payload).hexdigest()
    relative = f'pages/{sha}.rgba8'
    file = output / relative
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_bytes(payload)
    size = rgba.shape[0]
    return {'url': relative, 'width': size, 'height': size, 'encoding': 'rgba8', 'colorSpace': color_space,
            'byteLength': len(payload), 'decodedByteLength': len(payload), 'sha256': sha, 'revision': sha}


def prepare_channel(source, channel, output, *, height=None, preparation=None, sizes=SIZES):
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
    for size in sizes:
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
        result.append(write_page(rgba, output, 'srgb' if channel == 'baseColor' else 'linear'))
    return result


def micro_recipe(preparation):
    if not isinstance(preparation, dict) or preparation.get('algorithm') != MICRO_ALGORITHM or preparation.get('encoding') != MICRO_ENCODING:
        raise ValueError(f'Micro detail requires {MICRO_ALGORITHM} with {MICRO_ENCODING}')
    radius, percentiles = preparation.get('radiusPixels'), preparation.get('luminanceRangePercentiles')
    if not isinstance(radius, int) or isinstance(radius, bool) or radius < 2 or radius > 128:
        raise ValueError('Micro detail radiusPixels must be an integer in 2..128')
    if not (isinstance(percentiles, list) and len(percentiles) == 2 and all(isinstance(p, (int, float)) and not isinstance(p, bool) for p in percentiles)
            and 0 <= percentiles[0] < 50 < percentiles[1] <= 100):
        raise ValueError('Micro detail luminanceRangePercentiles must be [low < 50 < high] within 0..100')
    return radius, [float(p) for p in percentiles]


def micro_luminance(file, radius, percentiles, dimensions):
    rgb = read_rgb(file, dimensions).astype(np.float32) / 255
    low = rgb <= .04045
    rgb[low] /= 12.92
    rgb[~low] = ((rgb[~low] + .055) / 1.055) ** 2.4
    del low
    luminance = rgb[:, :, 0] * np.float32(.2126) + rgb[:, :, 1] * np.float32(.7152) + rgb[:, :, 2] * np.float32(.0722)
    del rgb
    logarithm = np.log(np.maximum(luminance, np.float32(1e-5)))
    del luminance
    ratio = np.exp(logarithm - periodic_lowpass(logarithm, radius))
    del logarithm
    ratio /= np.float32(ratio.mean(dtype=np.float64))
    lo, hi = (float(v) for v in np.percentile(ratio, percentiles))
    needed = max(1 - lo, hi - 1)
    luminance_range = min(1.0, math.ceil(needed * 64) / 64)
    if luminance_range <= 0:
        raise ValueError('Micro luminance source is constant after scale separation')
    return ratio, luminance_range, {'ratioPercentiles': percentiles, 'ratioAtPercentiles': [lo, hi], 'requiredRange': needed, 'rangeQuantum': 1 / 64}


def micro_normals(file, radius, dimensions):
    normal = read_rgb(file, dimensions).astype(np.float32) / 255
    normal *= 2
    normal -= 1
    normalize(normal)
    lean = normal.reshape(-1, 3).mean(axis=0, dtype=np.float64)
    z = np.maximum(normal[:, :, 2], np.float32(1 / 128))
    slopes = []
    for axis in range(2):
        slope = -normal[:, :, axis] / z
        slope -= periodic_lowpass(slope, radius)
        slopes.append(slope)
    del z
    normal[:, :, 0] = -slopes[0]
    normal[:, :, 1] = -slopes[1]
    normal[:, :, 2] = 1
    del slopes
    source_lean = math.degrees(math.acos(max(-1.0, min(1.0, float(lean[2] / np.linalg.norm(lean))))))
    return normalize(normal), {'sourceMeanLeanDegrees': source_lean}


def micro_height(file, radius, dimensions):
    values = read_height(file, dimensions)
    values -= periodic_lowpass(values, radius)
    values, center, lo, hi = normalize_relief(values)
    return values, {'algorithm': 'highpass-height-median-p01-p99-v1', 'highpassMin': lo, 'highpassMax': hi, 'highpassMedian': center}


def prepare_micro(micro, output, dimensions):
    radius, percentiles = micro_recipe(micro['preparation'])
    ratio, luminance_range, luminance_report = micro_luminance(micro['mapFiles']['baseColor'], radius, percentiles, dimensions)
    normal, normal_report = micro_normals(micro['mapFiles']['normal'], radius, dimensions)
    height, height_report = micro_height(micro['mapFiles']['displacement'], radius, dimensions)
    if not (ratio.shape == height.shape == normal.shape[:2]):
        raise ValueError('Micro color, normal and displacement sources must have identical dimensions')
    tiers, statistics = [], []
    for size in MICRO_SIZES:
        tier = reduce_box(normal, size)
        normalize(tier)
        modulation = .5 + .5 * (reduce_box(ratio, size) - 1) / luminance_range
        rgba = np.empty((size, size, 4), dtype=np.uint8)
        rgba[:, :, 0] = np.rint(np.clip(tier[:, :, 0] * .5 + .5, 0, 1) * 255).astype(np.uint8)
        rgba[:, :, 1] = np.rint(np.clip(tier[:, :, 1] * .5 + .5, 0, 1) * 255).astype(np.uint8)
        rgba[:, :, 2] = np.rint(np.clip(reduce_box(height, size), 0, 1) * 255).astype(np.uint8)
        rgba[:, :, 3] = np.rint(np.clip(modulation, 0, 1) * 255).astype(np.uint8)
        statistics.append({'resolution': size, 'luminanceClampedFraction': float(np.mean((modulation < 0) | (modulation > 1))),
                           'meanModulationByte': float(rgba[:, :, 3].mean(dtype=np.float64)), 'meanNormalXY': [float(tier[:, :, 0].mean(dtype=np.float64)), float(tier[:, :, 1].mean(dtype=np.float64))],
                           'minNormalZ': float(tier[:, :, 2].min())})
        tiers.append({'id': str(size), 'resolution': size, 'channels': {'micro': write_page(rgba, output, 'linear')}})
        del tier, modulation, rgba
    print(f"Prepared micro {micro['materialId']}: 32/128/512/1024 normal-height-luminance pages", flush=True)
    return {'materialId': micro['materialId'], 'luminanceRange': luminance_range, 'tiers': tiers,
            'recipe': {'algorithm': MICRO_ALGORITHM, 'encoding': MICRO_ENCODING, 'radiusPixels': radius, 'passes': 3, 'sourcePixels': int(ratio.shape[0]),
                       'luminance': luminance_report, 'normal': normal_report, 'height': height_report},
            'statistics': statistics}


def multiscale_request(request):
    multiscale = request.get('multiscale')
    if multiscale is None:
        return None, ()
    extra = tuple(multiscale.get('extraSizes') or ())
    if extra != EXTRA_SIZES:
        raise ValueError(f'Multiscale preparation supports exactly the extra tiers {list(EXTRA_SIZES)}')
    return multiscale, extra


def main(request):
    output = Path(request['outputDirectory'])
    multiscale, extra = multiscale_request(request)
    if multiscale:
        tracemalloc.start()
    dimensions, materials, material_preparation, extended = [], [], [], []
    for material in request['materials']:
        channels = {}
        for channel in ('baseColor', 'normal'):
            source = read_rgb(material['mapFiles'][channel], dimensions)
            channels[channel] = prepare_channel(source, channel, output, preparation=material.get('preparation'), sizes=SIZES + extra)
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
        channels['orm'] = prepare_channel(source, 'orm', output, height=height, sizes=SIZES + extra)
        del source
        tiers = [{'id': str(size), 'resolution': size, 'channels': {channel: pages[i] for channel, pages in channels.items()}} for i, size in enumerate(SIZES)]
        entry = {'soilId': material['soilId'], 'roughnessInputRange': {'min': float(lo), 'max': float(hi)}, 'tiers': tiers}
        if height is not None:
            entry['height'] = {'encoding': 'orm-alpha-unorm8', 'interpretation': 'relative-relief', 'neutral': .5}
        materials.append(entry)
        material_preparation.append({'soilId': material['soilId'], 'materialId': material['materialId'],
                                     'baseColor': (material.get('preparation') or {}).get('baseColor'), 'height': height_report})
        if multiscale:
            extended.append({'soilId': material['soilId'], 'tiers': [{'id': str(size), 'resolution': size,
                             'channels': {channel: pages[len(SIZES) + i] for channel, pages in channels.items()}} for i, size in enumerate(extra)]})
        del height
        print(f"Prepared {material['soilId']}: 32/128/512 RGB-normal-ORM pages", flush=True)
    report = {'materials': materials, 'sourceDimensions': dimensions, 'materialPreparation': material_preparation, 'maximumSourcePixels': MAX_PIXELS, 'workingByteLimit': WORKING_BYTES,
              'converter': {'python': platform.python_version(), 'pillow': PIL.__version__, 'numpy': np.__version__, 'filter': 'linear-light-box/normalized-vector-box/linear-orm-height-box'}}
    if multiscale:
        base_peak = tracemalloc.get_traced_memory()[1]
        tracemalloc.reset_peak()
        micro_dimensions, micro = [], []
        for entry in multiscale['micro']:
            micro.append(prepare_micro(entry, output, micro_dimensions))
        micro_peak = tracemalloc.get_traced_memory()[1]
        tracemalloc.stop()
        report['multiscale'] = {'extraSizes': list(extra), 'microSizes': list(MICRO_SIZES), 'materials': extended, 'micro': micro, 'sourceDimensions': micro_dimensions,
                                'converter': {'python': platform.python_version(), 'pillow': PIL.__version__, 'numpy': np.__version__,
                                              'filter': 'linear-light-box/normalized-vector-box/linear-orm-height-box',
                                              'micro': 'periodic-3x-box-highpass(log-luminance,tangent-slope,height)/normalized-vector-box/linear-box'},
                                'measurements': {'baseTracedPeakBytes': base_peak, 'microTracedPeakBytes': micro_peak, 'method': 'Python tracemalloc peak of converter allocations, not process RSS'}}
    (output / 'conversion.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main(json.loads(Path(sys.argv[1]).read_text(encoding='utf-8')))
