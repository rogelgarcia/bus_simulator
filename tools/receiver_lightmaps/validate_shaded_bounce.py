"""Proves that a downward-facing receiver gets ground bounce without direct sunlight."""
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent / 'blender'))
from bake import lighting

destination = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
destination.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 1024
scene.cycles.seed = 554
scene.cycles.use_adaptive_sampling = False
scene.cycles.use_denoising = False
scene.cycles.diffuse_bounces = 4
scene.cycles.glossy_bounces = 0
scene.render.threads_mode = 'FIXED'
scene.render.threads = 2
scene.render.bake.use_pass_color = False
scene.render.bake.use_clear = True
scene.render.bake.margin = 0

package = SimpleNamespace(manifest={'lightingProfiles': [
    {'id': 'sun.default', 'intensity': 7, 'colorLinearSrgb': [1, 1, 1],
     'angularDiameterDegrees': .53, 'directionThree': [.5792279653, .5735764364, .5792279653]},
    {'id': 'hemisphere.current', 'intensity': 0, 'groundColorLinearSrgb': [0, 0, 0], 'skyColorLinearSrgb': [0, 0, 0]},
    {'id': 'environment.default', 'enabled': False, 'intensity': 0}
]})
lighting(package, destination)


def diffuse_plane(name, vertices, color):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], [[0, 1, 2, 3]])
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    diffuse = nodes.new('ShaderNodeBsdfDiffuse')
    diffuse.inputs['Color'].default_value = (*color, 1)
    material.node_tree.links.new(diffuse.outputs[0], nodes.get('Material Output').inputs['Surface'])
    mesh.materials.append(material)
    return obj, material


ground, _ = diffuse_plane('green ground', [(-50, -50, 0), (50, -50, 0), (50, 50, 0), (-50, 50, 0)], [.1, .6, .1])
ceiling, material = diffuse_plane('white underside', [(-1, 1, 2), (1, 1, 2), (1, -1, 2), (-1, -1, 2)], [1, 1, 1])
assert ceiling.data.polygons[0].normal.z < -.99
uv = ceiling.data.uv_layers.new(name='Bake')
for loop, value in zip(uv.data, [(0, 0), (1, 0), (1, 1), (0, 1)]):
    loop.uv = value
image = bpy.data.images.new('underside irradiance', 32, 32, float_buffer=True)
image.colorspace_settings.name = 'Non-Color'
target = material.node_tree.nodes.new('ShaderNodeTexImage')
target.image = image
material.node_tree.nodes.active = target
bpy.context.view_layer.objects.active = ceiling
ceiling.select_set(True)
results = {}
for name, direct, indirect, ground_visible in [
    ('direct', True, False, True), ('indirect', False, True, True), ('no_ground', False, True, False)
]:
    scene.render.bake.use_pass_direct = direct
    scene.render.bake.use_pass_indirect = indirect
    ground.hide_render = not ground_visible
    bpy.ops.object.bake(type='DIFFUSE', uv_layer='Bake')
    data = np.array(image.pixels[:]).reshape(32, 32, 4)[8:24, 8:24, :3]
    results[name] = data.mean(axis=(0, 1)).tolist()
assert max(results['direct']) < 1e-6, results
assert max(results['no_ground']) < 1e-5, results
assert results['indirect'][1] > .1, results
assert results['indirect'][1] > 4 * results['indirect'][0], results
(destination / 'shaded-bounce.json').write_text(json.dumps(results, indent=2))
print('SHADED_BOUNCE_PASS ' + json.dumps(results), flush=True)
