"""Checks durable page output and mip assembly without allocating every bake page at once."""
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent / 'blender'))
import bake_surface

destination = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
destination.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
size = 8
images = [bpy.data.images.new('page_' + str(page), size, size, float_buffer=True) for page in range(2)]
expected = []
original_pixels = bake_surface.pixels
reads = []


def one_page(targets):
    assert len(targets) == 1, 'Page writer retains multiple image copies'
    reads.append(targets[0].name)
    return original_pixels(targets)


bake_surface.pixels = one_page
for name, factor in [('bounce', 1), ('sky', 2)]:
    values = []
    for page, image in enumerate(images):
        data = np.arange(size * size * 4, dtype=np.float32).reshape(size, size, 4) / 256
        data[:, :, :3] *= factor * (page + 1)
        data[:, :, 3] = 1
        image.pixels.foreach_set(data.ravel())
        values.append(data)
    bake_surface.save_surface_pass(destination, name, images)
    for page, data in enumerate(values):
        np.testing.assert_array_equal(np.load(destination / f'{name}.{page}.npy'), data)
    expected.append(values)
bpy.ops.wm.read_factory_settings(use_empty=True)
outputs = bake_surface.assemble_surface_outputs(destination, {'mipLevels': 2}, len(images))
for page in range(2):
    data = expected[0][page] + expected[1][page]
    data[:, :, :3] *= math.pi
    data[:, :, 3] = 1
    for mip in range(2):
        actual = np.fromfile(destination / f'indirect_irradiance.{page}.mip{mip}.f32', dtype='<f4').reshape(data.shape)
        np.testing.assert_array_equal(actual, data)
        data = data.reshape(data.shape[0] // 2, 2, data.shape[1] // 2, 2, 4).mean(axis=(1, 3))
assert len(reads) == 4
assert len(outputs) == 5
assert not list(destination.glob('*.partial'))
target = destination / 'preserved.bin'
target.write_bytes(b'previous')


def interrupted(output):
    output.write(b'incomplete')
    raise OSError('simulated write interruption')


try:
    bake_surface.write_durable(target, interrupted)
    raise AssertionError('Interrupted write was accepted')
except OSError:
    assert target.read_bytes() == b'previous'
    target.with_suffix('.bin.partial').unlink()
(destination / 'validation.json').write_text(json.dumps({'singlePageReads': len(reads), 'outputs': len(outputs), 'exactPixels': True}))
print('SURFACE_OUTPUTS_PASS', flush=True)
