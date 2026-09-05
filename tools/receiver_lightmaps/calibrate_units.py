"""Measures the Cycles diffuse-light pass against a unit irradiance Lambert plane."""
import bpy
import json
import math
import sys
from pathlib import Path

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 32
scene.render.threads_mode = 'FIXED'; scene.render.threads = 4
scene.cycles.use_adaptive_sampling = False; scene.cycles.use_denoising = False
bpy.ops.mesh.primitive_plane_add(size=2)
plane = bpy.context.object
material = bpy.data.materials.new('UnitWhite'); material.use_nodes = True
nodes = material.node_tree.nodes; nodes.clear()
diffuse = nodes.new('ShaderNodeBsdfDiffuse'); diffuse.inputs['Color'].default_value = (1, 1, 1, 1)
output = nodes.new('ShaderNodeOutputMaterial'); material.node_tree.links.new(diffuse.outputs[0], output.inputs[0])
image = bpy.data.images.new('UnitProbe', 32, 32, float_buffer=True)
target = nodes.new('ShaderNodeTexImage'); target.image = image; nodes.active = target
plane.data.materials.append(material)
data = bpy.data.lights.new('UnitSun', 'SUN'); data.energy = 1; data.angle = 0
sun = bpy.data.objects.new('UnitSun', data); scene.collection.objects.link(sun)
scene.world = bpy.data.worlds.new('Black'); scene.world.use_nodes = True
scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value = 0
scene.render.bake.use_pass_direct = True; scene.render.bake.use_pass_indirect = False; scene.render.bake.use_pass_color = False
bpy.ops.object.bake(type='DIFFUSE')
light_only = image.pixels[(16 * 32 + 16) * 4]
scene.render.bake.use_pass_color = True
bpy.ops.object.bake(type='DIFFUSE')
colored = image.pixels[(16 * 32 + 16) * 4]
result = {'blender': bpy.app.version_string, 'sunIrradiance': 1, 'lightOnly': light_only,
          'withColor': colored, 'expectedLambertRadiance': 1 / math.pi, 'irradianceScale': 1 / light_only}
Path(sys.argv[sys.argv.index('--') + 1]).write_text(json.dumps(result, indent=2))
print(json.dumps(result))
