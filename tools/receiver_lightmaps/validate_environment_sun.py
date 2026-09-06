"""Proves solar separation leaves background radiance and the input image intact."""
import json
import sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent / 'blender'))
from environment_sun import separate_environment_sun

destination = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
destination.mkdir(parents=True, exist_ok=True)
source = np.ones((512, 1024, 4), dtype=np.float32)
source[:, :, :3] = [.4, .6, .8]
source[330:333, 610:613, :3] += [50000, 40000, 30000]
original = source.copy()
result, report = separate_environment_sun(source, 4)
assert np.array_equal(source, original)
assert np.allclose(result[:, :, :3], [.4, .6, .8], atol=1e-6)
assert np.array_equal(source[:, :, 3], result[:, :, 3])
assert min(report['removedRadianceIntegral']) > 0
uniform = np.ones((128, 256, 4), dtype=np.float32)
unchanged, _ = separate_environment_sun(uniform, 4)
assert np.array_equal(uniform, unchanged)
(destination / 'solar-separation.json').write_text(json.dumps(report, indent=2))
print('SOLAR_SEPARATION_PASS ' + json.dumps(report), flush=True)
