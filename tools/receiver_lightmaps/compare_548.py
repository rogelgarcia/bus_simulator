"""Measures fixed-camera display differences and mapped coverage, not GI accuracy."""
import json
from pathlib import Path
import numpy as np
from PIL import Image

root = Path('tests/artifacts/screens/illumination_548').resolve()
results = {}
for pose in ['ground', 'threshold', 'overhang']:
    def pixels(mode):
        return np.asarray(Image.open(root / f'{pose}-{mode}.png').convert('RGB'), dtype=np.float32)

    coverage = pixels('coverage')
    mask = ((coverage[:, :, 1] > 180) & (coverage[:, :, 1] - coverage[:, :, 0] > 65)
            & (coverage[:, :, 1] - coverage[:, :, 2] > 100))
    unmapped = ((coverage[:, :, 0] > 180) & (coverage[:, :, 2] > 180) & (coverage[:, :, 1] < 80))
    result = {'mappedPixels': int(mask.sum()), 'mappedScreenFraction': float(mask.mean()), 'comparisons': {}}
    fallback_delta = np.abs(pixels('enhanced') - pixels('live'))
    result['unmappedMeanRgb8DifferenceFromLive'] = float(fallback_delta[unmapped].mean()) if unmapped.any() else None
    for before, after in [('legacy', 'enhanced'), ('live', 'indirect'), ('indirect', 'enhanced')]:
        delta = np.abs(pixels(after) - pixels(before))
        result['comparisons'][f'{before}_to_{after}'] = {
            'imageMeanRgb8Difference': float(delta.mean()),
            'mappedMeanRgb8Difference': float(delta[mask].mean()) if mask.any() else None,
            'mappedP95MaximumRgb8Difference': float(np.percentile(delta.max(axis=2)[mask], 95)) if mask.any() else None
        }
    results[pose] = result

output = {'interpretation': 'Display-space changes measure visibility, not ray-traced accuracy or convergence.', 'poses': results}
(root / 'capture-differences.json').write_text(json.dumps(output, indent=2), encoding='utf-8')
print(json.dumps(output, indent=2))
