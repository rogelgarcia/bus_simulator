"""Measures the affine angular approximation against independent 256-sample Cycles bakes."""
import json
import math
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent / 'blender'))
from bake_directional import install_directional_targets, set_direction, NORMALS, coefficients
import bpy
import numpy as np

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene; scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'
scene.render.threads_mode = 'FIXED'; scene.render.threads = 4; scene.cycles.samples = 256; scene.cycles.seed = 548
scene.cycles.use_denoising = False; scene.cycles.use_adaptive_sampling = False
scene.cycles.diffuse_bounces = 4; scene.cycles.glossy_bounces = 0
scene.render.bake.use_pass_color = False; scene.render.bake.use_pass_direct = True; scene.render.bake.use_pass_indirect = True
scene.render.bake.margin = 4; scene.render.bake.use_clear = True
scene.world = bpy.data.worlds.new('lab'); scene.world.use_nodes = True
scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value = (.4, .5, .6, 1)
mesh = bpy.data.meshes.new('lab'); mesh.from_pydata([(-1,-1,0),(1,-1,0),(1,1,0),(-1,1,0)], [], [(0,1,2),(0,2,3)])
obj = bpy.data.objects.new('lab', mesh); scene.collection.objects.link(obj); obj['bus_sim_stable_id'] = 'plane'
material = bpy.data.materials.new('lab'); material.use_nodes = True; mesh.materials.append(material)
material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (1,1,1,1)
for name, location, scale, color in [('wall',(-.8,0,.7),(.1,2,.7),(.8,.05,.02,1)), ('overhang',(.3,0,1),(.7,2,.05),(.65,.65,.65,1))]:
    bpy.ops.mesh.primitive_cube_add(size=2, location=location)
    cube = bpy.context.object; cube.name = name; cube.scale = scale
    mat = bpy.data.materials.new(name); mat.use_nodes = True; mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = color
    cube.data.materials.append(mat)
image = bpy.data.images.new('lab',64,64,float_buffer=True); image.colorspace_settings.name = 'Non-Color'
chart = {'id':'plane','instanceId':'plane','page':0,'x':0,'y':0,'min':[-1,-1],
    'right':[1,0,0],'up':[0,0,-1],'normal':[0,1,0],
    'triangles':[{'offset':0,'uv':[[-1,-1],[1,-1],[1,1]]},{'offset':3,'uv':[[-1,-1],[1,1],[-1,1]]}]}
profile = {'pageSize':64,'padding':4,'texelSizeMeters':2/55}
mapping = {'start':0,'count':6,'materialIndex':0,'meshInstanceId':'plane','channelRelevance':{'indirect_irradiance':True}}
package = SimpleNamespace(manifest={'receiverMappings':[mapping],'participantMappings':[],'casterMappings':[]})
controls = install_directional_targets(package,{'charts':[chart],'profile':profile},[image])

def bake(normal):
    set_direction(controls,normal)
    bpy.ops.object.bake(type='DIFFUSE',uv_layer='AI548_Bake')
    return np.array(image.pixels[:]).reshape(64,64,4)[16:48,24:48,:3]*math.pi

samples = [bake(n) for n in NORMALS]
fit = coefficients(samples)
cases = []
for angle in [0,20,40]:
    for phi in ([0] if angle == 0 else [0,90,180,270]):
        theta, azimuth = math.radians(angle), math.radians(phi)
        normal = [math.sin(theta)*math.cos(azimuth),math.sin(theta)*math.sin(azimuth),math.cos(theta)]
        reference = bake(normal)
        prediction = np.maximum(0,np.sum(fit*np.array([1,*normal]),axis=-1))
        difference = prediction-reference
        cases.append({'angle':angle,'azimuth':phi,'referenceMean':reference.mean(axis=(0,1)).tolist(),
            'predictionMean':prediction.mean(axis=(0,1)).tolist(),'rms':float(np.sqrt(np.mean(difference**2))),
            'normalizedRms':float(np.sqrt(np.mean(difference**2))/np.sqrt(np.mean(reference**2))),
            'maxAbsolute':float(np.abs(difference).max())})
report = {'samples':256,'fixture':'colored wall and overhang under a uniform sky','cases':cases,
          'flatSampleMaxError':float(np.max(np.abs(fit[:,:,:,0]+fit[:,:,:,3]-samples[0])))}
destination = Path(sys.argv[sys.argv.index('--')+1]); destination.parent.mkdir(parents=True,exist_ok=True)
destination.write_text(json.dumps(report,indent=2)); print(json.dumps(report),flush=True)
