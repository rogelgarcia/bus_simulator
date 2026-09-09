"""Fixed calibration and image-region measurements; no pose-specific exposure fitting."""
import math
import numpy as np

Y = np.array([.2126, .7152, .0722], dtype=np.float32)


def exposure_offsets(cards, reference):
    levels = {r['light']: r['measurements']['gray18']['meanLuminance'] for r in cards}
    if reference not in levels or any(not math.isfinite(v) or v <= 0 for v in levels.values()):
        raise ValueError('Missing/nonpositive calibration card luminance')
    return {key: math.log2(levels[reference] / value) for key, value in levels.items()}


def display_metrics(rgb, regions):
    luminance = rgb @ Y
    result = {'meanEncodedLuminance': float(luminance.mean()),
              'p01EncodedLuminance': float(np.quantile(luminance, .01)),
              'p99EncodedLuminance': float(np.quantile(luminance, .99)),
              'nearWhiteFraction': float(np.mean(np.all(rgb >= .99, axis=2))),
              'nearBlackFraction': float(np.mean(np.all(rgb <= .01, axis=2))), 'regions': {}}
    h, w = luminance.shape
    for region in regions:
        x0, y0, x1, y1 = region['box']
        patch = luminance[int(y0*h):int(y1*h), int(x0*w):int(x1*w)]
        if not patch.size:
            raise ValueError('Empty image region: ' + region['id'])
        result['regions'][region['id']] = {'box': region['box'], 'meanEncodedLuminance': float(patch.mean()),
                                         'p10': float(np.quantile(patch, .1)), 'p90': float(np.quantile(patch, .9))}
    return result


def compare_uniform(reference, control):
    if reference.shape != control.shape:
        raise ValueError('Control image dimensions differ')
    error = np.abs(reference.astype(np.float32) - control.astype(np.float32))
    return {'rmseEncodedRgb': float(np.sqrt(np.mean(error**2))), 'p99AbsoluteError': float(np.quantile(error, .99))}
