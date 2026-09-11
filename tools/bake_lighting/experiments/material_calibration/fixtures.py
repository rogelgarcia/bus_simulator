"""Shared metre-scale neutral receiver/sphere geometry, independent of city appearance."""
import math
import bpy,bmesh
from mathutils import Vector

def configure(scene,job):
    d=job['defaults'];scene.render.engine='CYCLES';scene.cycles.samples=d['fixtureSamples'];scene.cycles.seed=d['seed']
    scene.cycles.use_denoising=False;scene.cycles.use_adaptive_sampling=False;scene.cycles.max_bounces=6
    scene.render.threads_mode='FIXED';scene.render.threads=d['threads'];scene.render.resolution_x=len(job['materials'])*128;scene.render.resolution_y=160;scene.render.resolution_percentage=100
    scene.render.image_settings.media_type='MULTI_LAYER_IMAGE';scene.render.image_settings.file_format='OPEN_EXR_MULTILAYER';scene.render.image_settings.color_depth='32';scene.render.image_settings.use_exr_interleave=True
    scene.render.filter_size=.01;scene.view_settings.view_transform='AgX';scene.view_settings.look='None'
    layer=scene.view_layers[0];layer.name='Material'
    for flag in ['diffuse_direct','diffuse_indirect','diffuse_color','glossy_direct','glossy_indirect','glossy_color','material_index']:setattr(layer,'use_pass_'+flag,True)

def plane(scene,name,width,height,location):
    mesh=bpy.data.meshes.new(name);w,h=width/2,height/2;mesh.from_pydata([(-w,-h,0),(w,-h,0),(w,h,0),(-w,h,0)],[],[(0,1,2,3)])
    obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj);obj.location=location;return obj

def physical(name,params):
    m=bpy.data.materials.new(name);m.use_nodes=True;s=m.node_tree.nodes.get('Principled BSDF')
    s.inputs['Base Color'].default_value=(*params['color'],1);s.inputs['Roughness'].default_value=params['roughness'];s.inputs['Metallic'].default_value=params['metalness']
    s.inputs['IOR'].default_value=params['ior'];s.inputs['Specular IOR Level'].default_value=params['specularIntensity']*.5
    s.inputs['Specular Tint'].default_value=(*params.get('specularColor',[1,1,1]),1)
    if 'Diffuse Roughness' in s.inputs:s.inputs['Diffuse Roughness'].default_value=0
    return m

def make_fixtures(job):
    scenes=[];count=len(job['materials'])
    for kind in ['plane','sphere']:
        for angle in job['defaults']['angles']:
            for mode in (['sun','sky','combined','sun_shadow'] if kind=='plane' else ['combined']):
                scene=bpy.data.scenes.new(f'{kind}_{angle}_{mode}');configure(scene,job);scenes.append(scene)
                world=bpy.data.worlds.new(scene.name);world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(1,1,1,1);world.node_tree.nodes.get('Background').inputs[1].default_value=1 if mode in ['sky','combined'] else 0;scene.world=world
                camera=bpy.data.objects.new(scene.name+'_camera',bpy.data.cameras.new(scene.name+'_camera'));scene.collection.objects.link(camera);scene.camera=camera
                camera.data.type='ORTHO';camera.data.ortho_scale=count*2.2;theta=math.radians(angle);camera.location=(0,-30*math.sin(theta),30*math.cos(theta));camera.rotation_euler=(-camera.location).to_track_quat('-Z','Y').to_euler()
                if mode!='sky':
                    lamp=bpy.data.lights.new('neutral_sun','SUN');lamp.energy=math.pi;lamp.angle=0
                    obj=bpy.data.objects.new('neutral_sun',lamp);scene.collection.objects.link(obj);obj.rotation_euler=(-Vector((0,math.sin(math.radians(35)),math.cos(math.radians(35))))).to_track_quat('-Z','Y').to_euler()
                for i,item in enumerate(job['materials']):
                    x=(i-(count-1)/2)*2.2
                    if kind=='plane':obj=plane(scene,item['id'],1.7,1.7,(x,0,0))
                    else:
                        mesh=bpy.data.meshes.new(item['id']);bm=bmesh.new();bmesh.ops.create_uvsphere(bm,u_segments=64,v_segments=32,radius=.72);bm.to_mesh(mesh);bm.free()
                        obj=bpy.data.objects.new(item['id'],mesh);scene.collection.objects.link(obj);obj.location=(x,0,0)
                        for polygon in mesh.polygons:polygon.use_smooth=True
                    m=physical(item['id'],item['fixture']);m.pass_index=i+1;obj.data.materials.append(m)
                if mode=='sun_shadow':
                    obj=plane(scene,'black_blocker',count*2.2+2,3,(0,1.5,1));m=bpy.data.materials.new('black');m.use_nodes=True
                    tree=m.node_tree;tree.nodes.clear();shader=tree.nodes.new('ShaderNodeBsdfDiffuse');shader.inputs[0].default_value=(0,0,0,1);out=tree.nodes.new('ShaderNodeOutputMaterial');tree.links.new(shader.outputs[0],out.inputs['Surface']);obj.data.materials.append(m)
    return scenes
