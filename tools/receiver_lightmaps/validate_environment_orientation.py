"""Compare actual Cycles world lookup with Three's equirectangular direction convention."""
import json
import math
import sys
from pathlib import Path
from types import SimpleNamespace
import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent / 'blender'))
from bake import lighting

destination = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
destination.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 256
scene.render.threads_mode = 'FIXED'
scene.render.threads = 2
scene.render.resolution_x = scene.render.resolution_y = 16
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = 'Raw'
scene.render.image_settings.file_format = 'OPEN_EXR'
scene.render.image_settings.color_depth = '32'
width, height = 1024, 512
data = np.ones((height, width, 4), dtype=np.float32)
data[:, :, 0] = (np.arange(width)[None, :] + .5) / width
data[:, :, 1] = (np.arange(height)[:, None] + .5) / height
data[:, :, 2] = .25
image = bpy.data.images.new('direction_reference', width, height, float_buffer=True)
image.colorspace_settings.name = 'Non-Color'
image.pixels.foreach_set(data.ravel())
image.filepath_raw = str(destination / 'directions.exr')
image.file_format = 'OPEN_EXR'
image.save()
package = SimpleNamespace(manifest={'lightingProfiles': [
    {'id': 'sun.default', 'intensity': 0, 'colorLinearSrgb': [1, 1, 1], 'angularDiameterDegrees': 0, 'directionThree': [0, 1, 0]},
    {'id': 'hemisphere.current', 'intensity': 0, 'groundColorLinearSrgb': [0, 0, 0], 'skyColorLinearSrgb': [0, 0, 0]},
    {'id': 'environment.default', 'enabled': True, 'intensity': 1, 'sourceReference': {'bufferId': 'reference'}}
]}, get_buffer_bytes=lambda _: (destination / 'directions.exr').read_bytes())
lighting(package, destination)
camera = bpy.data.objects.new('direction_camera', bpy.data.cameras.new('direction_camera'))
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.angle = .0001
nodes = scene.world.node_tree.nodes
texture = next(node for node in nodes if node.type == 'TEX_ENVIRONMENT')
texture.image.colorspace_settings.name = 'Non-Color'
coordinate = next(node for node in nodes if node.type == 'TEX_COORD')
report = []
for mode in ['production_environment', 'production_hemisphere', 'reversed_hemisphere_control']:
    if mode == 'production_hemisphere':
        package.manifest['lightingProfiles'][2]['enabled'] = False
        hemi = package.manifest['lightingProfiles'][1]
        hemi.update(intensity=math.pi, groundColorLinearSrgb=[0, 0, 1], skyColorLinearSrgb=[1, 0, 0])
        lighting(package, destination)
    if mode == 'reversed_hemisphere_control':
        nodes = scene.world.node_tree.nodes
        coordinate = next(node for node in nodes if node.type == 'TEX_COORD')
        separate = next(node for node in nodes if node.type == 'SEPXYZ')
        scene.world.node_tree.links.new(coordinate.outputs['Normal'], separate.inputs[0])
    for direction in [[1, .4, .3], [-1, .4, .3], [.3, 1, .4], [.3, -1, .4], [.3, .4, 1], [.3, .4, -1]]:
        d = Vector(direction).normalized()
        camera.rotation_euler = Vector((d.x, -d.z, d.y)).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(destination / 'sample.exr')
        bpy.ops.render.render(write_still=True)
        rendered = bpy.data.images.load(scene.render.filepath, check_existing=False)
        rendered.colorspace_settings.name = 'Non-Color'
        measured = np.array(rendered.pixels[:]).reshape(16, 16, 4)[:, :, :3].mean(axis=(0, 1))
        bpy.data.images.remove(rendered)
        expected = ([math.atan2(d.z, d.x) / (2 * math.pi) + .5, math.asin(d.y) / math.pi + .5, .25]
                    if mode == 'production_environment' else [(d.y + 1) / 2, 0, (1 - d.y) / 2])
        report.append({'mode': mode, 'directionThree': list(d), 'expected': expected, 'measured': measured.tolist(), 'maxError': float(np.max(np.abs(measured - expected)))})
(destination / 'orientation.json').write_text(json.dumps(report, indent=2))
print('ENVIRONMENT_ORIENTATION ' + json.dumps(report), flush=True)
assert max(entry['maxError'] for entry in report if entry['mode'].startswith('production_')) < .012, 'Cycles world directions differ from the Three reference'
assert max(entry['maxError'] for entry in report if entry['mode'] == 'reversed_hemisphere_control') > .8, 'Reference failed to detect an inverted sky'

# The sun is tested through the same production constructor, independently of
# any city atlas or cached depth map. A reversed sun must fail these faces.
sun_profile = package.manifest['lightingProfiles'][0]
sun_profile.update(intensity=7, directionThree=[.5792279653395692, .573576436351046, .5792279653395691])
package.manifest['lightingProfiles'][1]['intensity'] = 0
lighting(package, destination)
mesh = bpy.data.meshes.new('reference_receiver')
mesh.from_pydata([(-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0)], [], [(0, 1, 2), (0, 2, 3)])
obj = bpy.data.objects.new('reference_receiver', mesh); scene.collection.objects.link(obj)
uv = mesh.uv_layers.new(name='reference_uv')
for loop in mesh.loops:
    position = mesh.vertices[loop.vertex_index].co
    uv.data[loop.index].uv = ((position.x + 1) / 2, (position.y + 1) / 2)
material = bpy.data.materials.new('reference_diffuse'); material.use_nodes = True
nodes, links = material.node_tree.nodes, material.node_tree.links
diffuse = nodes.new('ShaderNodeBsdfDiffuse'); diffuse.inputs['Color'].default_value = (1, 1, 1, 1)
links.new(diffuse.outputs[0], nodes.get('Material Output').inputs['Surface'])
target = bpy.data.images.new('reference_bake', 32, 32, float_buffer=True)
target.colorspace_settings.name = 'Non-Color'
texture = nodes.new('ShaderNodeTexImage'); texture.image = target; nodes.active = texture
mesh.materials.append(material); obj.select_set(True); bpy.context.view_layer.objects.active = obj
scene.render.bake.use_pass_color = False
scene.render.bake.use_pass_direct = True
scene.render.bake.use_pass_indirect = False
scene.render.bake.margin = 0
sun_report = []
for normal in [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]:
    obj.rotation_euler = Vector((normal[0], -normal[2], normal[1])).to_track_quat('Z', 'Y').to_euler()
    bpy.ops.object.bake(type='DIFFUSE', uv_layer='reference_uv')
    measured = np.array(target.pixels[:]).reshape(32, 32, 4)[4:28, 4:28, :3].mean(axis=(0, 1)) * math.pi
    expected = 7 * max(0, float(np.dot(normal, sun_profile['directionThree'])))
    sun_report.append({'normalThree': normal, 'expectedIrradiance': expected, 'measuredIrradiance': measured.tolist(), 'maxError': float(np.max(np.abs(measured - expected)))})
(destination / 'sun-orientation.json').write_text(json.dumps(sun_report, indent=2))
assert max(entry['maxError'] for entry in sun_report) < .025, 'Production sun direction differs from analytic face illumination'
print('SUN_ORIENTATION ' + json.dumps(sun_report), flush=True)
