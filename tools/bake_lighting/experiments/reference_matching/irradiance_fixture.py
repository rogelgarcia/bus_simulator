"""Small quantitative bake/render parity fixture with the native primary receiver adapter."""
import json,sys,math
from pathlib import Path
from types import SimpleNamespace
import bpy,numpy as np
from mathutils import Vector

root=Path(sys.argv[sys.argv.index('--')+1]);request=json.loads((root/'request.json').read_text())
sys.path.insert(0,str(Path(__file__).resolve().parents[4]/'tools/receiver_lightmaps/blender'))
from bake_surface import install_surface_targets,configure_surface_device,configure_surface_irradiance

keys=['diffuse_bounces','glossy_bounces','transmission_bounces','transparent_max_bounces','max_bounces',
      'sample_clamp_direct','sample_clamp_indirect','blur_glossy','caustics_reflective','caustics_refractive',
      'use_light_tree','use_fast_gi']
bpy.ops.wm.open_mainfile(filepath=str(Path(request['input'])/'source_scene/calibrated_city.blend'),load_ui=False)
settings={'sourceRender':{key:getattr(bpy.context.scene.cycles,key) for key in keys}}
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.render.engine='CYCLES'
settings['factory']={key:getattr(scene.cycles,key) for key in keys}
configure_surface_device(scene,{'device':request['device']})
scene.cycles.samples=2048;scene.cycles.seed=553;scene.cycles.use_adaptive_sampling=False;scene.cycles.use_denoising=False
scene.cycles.diffuse_bounces=4;scene.cycles.max_bounces=8;scene.cycles.glossy_bounces=0
scene.cycles.transmission_bounces=4;scene.cycles.transparent_max_bounces=16
configure_surface_irradiance(scene)
if request['sampleClamp']!='native':scene.cycles.sample_clamp_indirect=float(request['sampleClamp'])
scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.bake.use_pass_color=False;scene.render.bake.margin=0;scene.render.bake.use_clear=True
scene.world=bpy.data.worlds.new('world');scene.world.use_nodes=True
scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(1,1,1,1)
settings['fixture']={key:getattr(scene.cycles,key) for key in keys}
(root/'settings.json').write_text(json.dumps(settings,indent=2))

def plane(name,vertices,color):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],[(0,1,2),(0,2,3)])
    obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj)
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*color,1)
    mat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.8
    mesh.materials.append(mat);return obj

floor=plane('receiver',[(-1,-1,0),(1,-1,0),(1,1,0),(-1,1,0)],[.12,.24,.48])
floor['bus_sim_stable_id']='receiver'
plane('wall',[(1.3,-8,0),(1.3,-8,8),(1.3,8,8),(1.3,8,0)],[.5,.4,.3])
plane('ground',[(-15,-15,-.01),(15,-15,-.01),(15,15,-.01),(-15,15,-.01)],[.3,.4,.2])
sun_data=bpy.data.lights.new('sun','SUN');sun_data.energy=160;sun_data.angle=math.radians(.53)
sun=bpy.data.objects.new('sun',sun_data);scene.collection.objects.link(sun)
sun.rotation_euler=Vector((1,-1,-2)).to_track_quat('-Z','Y').to_euler()
package=SimpleNamespace(manifest={'meshInstances':[{'id':'receiver','geometryId':'plane'}],
    'geometries':[{'id':'plane'}], 'participantMappings':[], 'casterMappings':[],
    'receiverMappings':[{'meshInstanceId':'receiver','start':0,'count':6,'materialIndex':0,'channelRelevance':{'indirect_irradiance':True}}]})
image=bpy.data.images.new('bake',64,64,float_buffer=True);image.colorspace_settings.name='Non-Color'
chart={'instanceId':'receiver','page':0,'x':0,'y':0,'min':[-1,-1],'pixelOffset':[0,0],'texelsPerMeter':[32,32],
       'triangles':[{'offset':0,'uv':[[-1,-1],[1,-1],[1,1]]},{'offset':3,'uv':[[-1,-1],[1,1],[-1,1]]}]}
install_surface_targets(package,{'charts':[chart],'profile':{'pageSize':64,'padding':0,'texelSizeMeters':1/32}},[image])
camera_data=bpy.data.cameras.new('camera');camera_data.type='ORTHO';camera_data.ortho_scale=2
camera=bpy.data.objects.new('camera',camera_data);scene.collection.objects.link(camera);camera.location=(0,0,10);scene.camera=camera
scene.render.resolution_x=64;scene.render.resolution_y=64;scene.render.resolution_percentage=100
scene.render.image_settings.media_type='MULTI_LAYER_IMAGE';scene.render.image_settings.file_format='OPEN_EXR_MULTILAYER';scene.render.image_settings.color_depth='32'
scene.render.image_settings.use_exr_interleave=True
layer=scene.view_layers[0];layer.name='fixture';layer.use_pass_diffuse_direct=True;layer.use_pass_diffuse_indirect=True;layer.use_pass_diffuse_color=True
for name,direct,indirect,sun_visible in [('sky',True,False,False),('bounce',False,True,True)]:
    primary=next(node for node in floor.data.materials[0].node_tree.nodes if node.type=='BSDF_DIFFUSE')
    primary.inputs['Color'].default_value=(1,1,1,1)
    sun.hide_render=not sun_visible;scene.render.bake.use_pass_direct=direct;scene.render.bake.use_pass_indirect=indirect
    bpy.ops.object.bake(type='DIFFUSE',uv_layer='AI533_Bake')
    values=np.empty(64*64*4,np.float32);image.pixels.foreach_get(values);np.save(root/(name+'.npy'),values.reshape(64,64,4))
    primary.inputs['Color'].default_value=(.12,.24,.48,1)
    scene.render.filepath=str(root/(name+'.exr'));bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(root/'fixture.blend'),compress=True)
