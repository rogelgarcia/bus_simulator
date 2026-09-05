"""Checks linear HDR energy, chart isolation, and noise reduction in installed Blender."""
import json
import sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent / 'blender'))
from denoise import ChartDenoiser

stage = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
stage.mkdir(parents=True, exist_ok=True)
samples = np.zeros((64, 128, 3), dtype=np.float32)
samples[:, :64] = (1, .2, .1)
samples[:, 64:] = (.1, 2, 10)
charts = [{'x': 0, 'y': 0, 'width': 64, 'height': 64}, {'x': 64, 'y': 0, 'width': 64, 'height': 64}]
denoiser = ChartDenoiser(stage, 4)
constant = denoiser.apply(samples, charts)
assert np.max(np.abs(constant / samples - 1)) < .01, 'HDR constants changed or adjacent charts bled'
random = np.random.default_rng(548)
noise = samples * random.normal(1, .1, samples.shape).astype(np.float32)
clean = denoiser.apply(noise, charts)
before = float(np.mean(np.square(noise - samples)))
after = float(np.mean(np.square(clean - samples)))
assert after < before * .25, (before, after)
for chart in charts:
    x, width = chart['x'], chart['width']
    expected = samples[:, x:x + width].mean(axis=(0, 1))
    measured = clean[:, x:x + width].mean(axis=(0, 1))
    assert np.max(np.abs(measured / expected - 1)) < .03, (expected, measured)
result = {'beforeMse': before, 'afterMse': after, 'constantMaximumError': float(np.max(np.abs(constant - samples)))}
(stage / 'validation.json').write_text(json.dumps(result, indent=2))
print('CHART_DENOISE_PASS ' + json.dumps(result), flush=True)
