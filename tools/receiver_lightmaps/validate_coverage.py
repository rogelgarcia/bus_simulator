"""Checks enhanced overlay transmission using the installed Cycles renderer."""

import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / 'blender'))
import bpy
import numpy as np
from directional_coverage import install_coverage
from bake_directional import coefficients, flat_first_coefficients

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 64
scene.render.threads_mode = 'FIXED'; scene.render.threads = 4
scene.render.resolution_x = 32; scene.render.resolution_y = 32; scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'OPEN_EXR'; scene.render.image_settings.color_depth = '32'
scene.view_settings.view_transform = 'Raw'
world = bpy.data.worlds.new('Black'); world.use_nodes = True; world.node_tree.nodes['Background'].inputs[0].default_value = (0, 0, 0, 1); scene.world = world
bpy.ops.object.camera_add(location=(0, 0, 3)); scene.camera = bpy.context.object
scene.camera.data.type = 'ORTHO'; scene.camera.data.ortho_scale = 1
bpy.ops.mesh.primitive_plane_add(size=4)
back = bpy.context.object
white = bpy.data.materials.new('White'); white.use_nodes = True
nodes, links = white.node_tree.nodes, white.node_tree.links
emission = nodes.new('ShaderNodeEmission'); emission.inputs[0].default_value = (1, 1, 1, 1)
links.new(emission.outputs[0], nodes['Material Output'].inputs['Surface']); back.data.materials.append(white)
bpy.ops.mesh.primitive_plane_add(size=4, location=(0, 0, .02))
overlay = bpy.context.object; overlay.data.uv_layers.active.name = 'uv'
black = bpy.data.materials.new('Overlay'); black.use_nodes = True
black.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0, 0, 0, 1)
black.node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value = 0
overlay.data.materials.append(black)
output = Path(sys.argv[sys.argv.index('--') + 1]).resolve(); output.mkdir(parents=True, exist_ok=True)

def render(name):
    scene.render.filepath = str(output / (name + '.exr')); bpy.ops.render.render(write_still=True)
    image = bpy.data.images.load(scene.render.filepath)
    pixels = np.array(image.pixels[:]).reshape(32, 32, 4)
    result = float(pixels[8:24, 8:24, :3].mean()); bpy.data.images.remove(image)
    return result

results = {'opaque': render('opaque')}
assert results['opaque'] < .001
install_coverage(black, {'mode': 'procedural_coverage', 'opacity': .45, 'inputs': [], 'alphaTest': 0,
    'proceduralCoverage': [{'adapterId': 'sidewalk-edge-dirt-strip-v1', 'semantics': {'fadePower': 1.6}}]})
for v in [0, .5, 1]:
    for uv in overlay.data.uv_layers.active.data: uv.uv = (0, v)
    value = render('dirt-' + str(v)); expected = 1 - .45 * (1 - v) ** 1.6
    results[str(v)] = {'actual': value, 'expected': expected}
    assert abs(value - expected) < .035, results[str(v)]
links = black.node_tree.links
links.new(black.node_tree.nodes['Principled BSDF'].outputs[0], black.node_tree.nodes['Material Output'].inputs['Surface'])
install_coverage(black, {'mode': 'procedural_coverage', 'opacity': 1, 'inputs': [], 'alphaTest': 0,
    'proceduralCoverage': [{'adapterId': 'asphalt-edge-wear-v1', 'semantics': {
        'width': .65, 'maxWidth': 2.5, 'strength': .18, 'scale': .55, 'seed': [161.057145, 484.601144]}}]})
for v in [0, .5, 1]:
    for uv in overlay.data.uv_layers.active.data: uv.uv = (0, v)
    value = render('asphalt-' + str(v)); results['asphalt-' + str(v)] = value
    assert .80 < value < .91 if v == 0 else abs(value - 1) < .005
samples = np.random.default_rng(548).random((4, 7, 3))
original, packed = coefficients(samples), flat_first_coefficients(samples)
for n in np.random.default_rng(533).normal(size=(50, 3)):
    n /= np.linalg.norm(n)
    expected = original @ np.array([1, *n])
    actual = packed[:, 0, :3] + packed[:, 1, :3] * n[0] + packed[:, 2, :3] * n[1] + packed[:, :, 3] * (n[2] - 1)
    assert np.max(np.abs(actual - expected)) < 1e-12
results['flatFirstPacking'] = '50 normals agree within 1e-12'
(output / 'coverage.json').write_text(json.dumps(results, indent=2))
print('COVERAGE_PASS ' + json.dumps(results), flush=True)
