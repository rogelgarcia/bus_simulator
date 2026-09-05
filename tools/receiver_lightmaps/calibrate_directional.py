"""Checks actual Cycles primary shading directions against an analytic unoccluded sun."""
import json
import math
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent / 'blender'))
from bake_directional import install_directional_targets, set_direction, NORMALS, coefficients
import bpy
import numpy as np
from mathutils import Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene; scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'
scene.render.threads_mode = 'FIXED'; scene.render.threads = 4; scene.cycles.samples = 32
scene.cycles.use_denoising = False; scene.cycles.use_adaptive_sampling = False
scene.render.bake.use_pass_color = False; scene.render.bake.use_pass_direct = True; scene.render.bake.use_pass_indirect = False
scene.render.bake.margin = 4; scene.render.bake.use_clear = True
mesh = bpy.data.meshes.new('lab'); mesh.from_pydata([(-1,-1,0),(1,-1,0),(1,1,0),(-1,1,0)], [], [(0,1,2),(0,2,3)])
obj = bpy.data.objects.new('lab', mesh); scene.collection.objects.link(obj); obj['bus_sim_stable_id'] = 'plane'
material = bpy.data.materials.new('lab'); material.use_nodes = True; mesh.materials.append(material)
material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (1,1,1,1)
data = bpy.data.lights.new('sun', 'SUN'); data.energy = 3; data.angle = 0
sun = bpy.data.objects.new('sun', data); scene.collection.objects.link(sun)
light_direction = Vector((.4, 0, math.sqrt(.84))); sun.rotation_euler = (-light_direction).to_track_quat('-Z','Y').to_euler()
image = bpy.data.images.new('lab', 64,64, float_buffer=True); image.colorspace_settings.name = 'Non-Color'
chart = {'id':'plane', 'instanceId':'plane','page':0,'x':0,'y':0,'min':[-1,-1],
         'right':[1,0,0],'up':[0,0,-1],'normal':[0,1,0],
         'triangles':[{'offset':0,'uv':[[-1,-1],[1,-1],[1,1]]},{'offset':3,'uv':[[-1,-1],[1,1],[-1,1]]}]}
profile = {'pageSize':64,'padding':4,'texelSizeMeters':2/55}
mapping = {'start':0,'count':6,'materialIndex':0,'meshInstanceId':'plane','channelRelevance':{'indirect_irradiance':True}}
package = SimpleNamespace(manifest={'receiverMappings':[mapping],'participantMappings':[],'casterMappings':[]})
controls = install_directional_targets(package, {'charts':[chart],'profile':profile}, [image])
samples=[]
for normal in NORMALS:
    set_direction(controls, normal)
    bpy.ops.object.bake(type='DIFFUSE',uv_layer='AI548_Bake')
    pixels=np.array(image.pixels[:]).reshape(64,64,4)
    measured=float(pixels[16:48,16:48,0].mean()*math.pi)
    expected=3*max(0,float(np.dot(normal,light_direction)))
    samples.append({'normal':normal,'measured':measured,'expected':expected,'error':abs(measured-expected)})
report={'samples':samples,'passed':max(v['error'] for v in samples)<.005}
destination=Path(sys.argv[sys.argv.index('--')+1]); destination.parent.mkdir(parents=True,exist_ok=True)
destination.write_text(json.dumps(report,indent=2)); print(json.dumps(report),flush=True)
if not report['passed']:
    raise RuntimeError('Directional Cycles calibration failed')
