"""Measures visible changes between fixed-camera captures, not lighting accuracy."""
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image

root = Path(sys.argv[1]).resolve()


def pixels(name):
    return np.asarray(Image.open(root / name).convert('RGB'), dtype=np.float32)


baseline = pixels('cached-sun-roofs.png')
coverage = pixels('debug-unmapped-roofs.png')
mapped = ((coverage[:, :, 1] > 180) & (coverage[:, :, 1] - coverage[:, :, 0] > 65)
          & (coverage[:, :, 1] - coverage[:, :, 2] > 100))
results = {'comparison': 'fixed rooftop camera; cached sun plus live diffuse baseline',
           'interpretation': 'Display RGB differences establish visible change, not accuracy or convergence.',
           'mappedPixels': int(mapped.sum()), 'mappedScreenFraction': float(mapped.mean()), 'modes': {}}
if not mapped.any():
    raise RuntimeError('The coverage capture contains no mapped pixels.')
for name in ['baked-indirect', 'baked-both', 'baked-direct']:
    difference = np.abs(pixels(f'{name}-roofs.png') - baseline)
    results['modes'][name] = {
        'wholeImageMeanAbsoluteRgb8Difference': float(difference.mean()),
        'mappedMeanAbsoluteRgb8Difference': float(difference[mapped].mean()),
        'mappedPixelsChangedOver2': float((difference.max(axis=2)[mapped] > 2).mean()),
        'mapped95thPercentileMaximumRgb8Difference': float(np.percentile(difference.max(axis=2)[mapped], 95))
    }
(root / 'capture-differences.json').write_text(json.dumps(results, indent=2))
print(json.dumps(results))
