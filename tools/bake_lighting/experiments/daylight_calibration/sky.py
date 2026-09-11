"""One atmospheric source for every ray; sampling tools preserve its native scale."""
import math
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from daylight_math import sun_direction,directions,overcast

def image(name,data):
    h,w=data.shape[:2]; rgba=np.ones((h,w,4),np.float32);rgba[:,:,:data.shape[2]]=data
    result=bpy.data.images.new(name,width=w,height=h,float_buffer=True)
    result.colorspace_settings.name='Non-Color';result.pixels.foreach_set(np.flipud(rgba).copy().ravel());result.update()
    return result

def sky_node(tree,defaults,profile,disc):
    sky=tree.nodes.new('ShaderNodeTexSky');sky.sky_type=defaults['skyModel'];sky.sun_disc=disc
    sun=sun_direction(defaults)
    sky.sun_elevation=math.asin(sun[2]);sky.sun_rotation=math.atan2(sun[0],sun[1])
    sky.sun_size=math.radians(defaults['sun']['angularDiameterDeg']);sky.sun_intensity=1
    sky.altitude=defaults['altitudeMeters']
    sky.air_density=defaults['airDensity'];sky.aerosol_density=profile['aerosolDensity'];sky.ozone_density=defaults['ozoneDensity']
    return sky

def color_source(tree,defaults,profile,mode,vector=None):
    if profile['model']=='cie_overcast':
        if mode=='sun':
            node=tree.nodes.new('ShaderNodeRGB');node.outputs[0].default_value=(0,0,0,1);return node.outputs[0]
        # Analytic direction-dependent overcast for all ray types, without a separate background.
        tex=tree.nodes.new('ShaderNodeTexCoord')
        separate=tree.nodes.new('ShaderNodeSeparateXYZ')
        if vector:
            tree.links.new(vector,separate.inputs[0])
        else:
            # World texture Normal points toward the observer; sky direction points away.
            outward=tree.nodes.new('ShaderNodeVectorMath');outward.operation='SCALE';outward.inputs['Scale'].default_value=-1
            tree.links.new(tex.outputs['Normal'],outward.inputs[0]);tree.links.new(outward.outputs[0],separate.inputs[0])
        positive=tree.nodes.new('ShaderNodeMath');positive.operation='GREATER_THAN';tree.links.new(separate.outputs['Z'],positive.inputs[0])
        positive.inputs[1].default_value=0
        scale=tree.nodes.new('ShaderNodeMath');scale.operation='MULTIPLY_ADD';tree.links.new(separate.outputs['Z'],scale.inputs[0]);scale.inputs[1].default_value=2;scale.inputs[2].default_value=1
        multiply=tree.nodes.new('ShaderNodeMath');multiply.operation='MULTIPLY';tree.links.new(scale.outputs[0],multiply.inputs[0]);tree.links.new(positive.outputs[0],multiply.inputs[1])
        value=tree.nodes.new('ShaderNodeMath');value.operation='MULTIPLY';tree.links.new(multiply.outputs[0],value.inputs[0]);value.inputs[1].default_value=(profile['horizontalIlluminanceLux']/683)*3/(7*math.pi)
        return value.outputs[0]
    node=sky_node(tree,defaults,profile,mode!='sky')
    if vector:tree.links.new(vector,node.inputs['Vector'])
    if mode!='sun':return node.outputs['Color']
    off=sky_node(tree,defaults,profile,False)
    if vector:tree.links.new(vector,off.inputs['Vector'])
    subtract=tree.nodes.new('ShaderNodeVectorMath');subtract.operation='SUBTRACT'
    tree.links.new(node.outputs['Color'],subtract.inputs[0]);tree.links.new(off.outputs['Color'],subtract.inputs[1])
    return subtract.outputs[0]

def world(defaults,profile,mode='combined'):
    result=bpy.data.worlds.new(profile['id']+'_'+mode);result.use_nodes=True;result.use_fake_user=True
    tree=result.node_tree;tree.nodes.clear();background=tree.nodes.new('ShaderNodeBackground');output=tree.nodes.new('ShaderNodeOutputWorld')
    tree.links.new(color_source(tree,defaults,profile,mode),background.inputs['Color']);background.inputs['Strength'].default_value=1
    tree.links.new(background.outputs[0],output.inputs['Surface']);return result

def configure(scene,defaults,width,height,samples):
    scene.render.engine='CYCLES';scene.cycles.samples=samples;scene.cycles.use_denoising=False;scene.cycles.use_adaptive_sampling=False
    scene.cycles.seed=defaults['seed'];scene.cycles.max_bounces=8
    scene.render.threads_mode='FIXED';scene.render.threads=defaults['threads']
    scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.resolution_percentage=100
    scene.render.image_settings.media_type='MULTI_LAYER_IMAGE';scene.render.image_settings.file_format='OPEN_EXR_MULTILAYER';scene.render.image_settings.color_depth='32'
    scene.render.filter_size=.01;scene.view_settings.view_transform='AgX';scene.view_settings.look='None';scene.view_settings.exposure=0
    scene.view_layers[0].name='Daylight'

def sample_scene(defaults,profile,mode,vector_data):
    h,w=vector_data.shape[:2];scene=bpy.data.scenes.new('sample_'+profile['id']+'_'+mode);configure(scene,defaults,w,h,1)
    if mode=='sun':
        # With its disc enabled Blender intentionally removes the Sky Vector input.
        # Measure actual world rays through a narrow perspective camera instead.
        scene.world=world(defaults,profile,mode)
        camera=bpy.data.objects.new('disc_sensor',bpy.data.cameras.new('disc_sensor'));scene.collection.objects.link(camera);scene.camera=camera
        camera.rotation_euler=Vector(sun_direction(defaults)).to_track_quat('-Z','Y').to_euler()
        camera.data.type='PERSP';camera.data.sensor_fit='HORIZONTAL';camera.data.angle=math.radians(defaults['sun']['angularDiameterDeg'])*1.3
        return scene
    mesh=bpy.data.meshes.new('directions');mesh.from_pydata([(-1,-1,0),(1,-1,0),(1,1,0),(-1,1,0)],[],[(0,1,2,3)]);mesh.uv_layers.new()
    for loop,uv in zip(mesh.uv_layers[0].data,[(0,0),(1,0),(1,1),(0,1)]):loop.uv=uv
    obj=bpy.data.objects.new('directions',mesh);scene.collection.objects.link(obj)
    material=bpy.data.materials.new('sample');material.use_nodes=True;tree=material.node_tree;tree.nodes.clear()
    tex=tree.nodes.new('ShaderNodeTexImage');tex.image=image('direction_vectors',vector_data);tex.interpolation='Closest'
    emission=tree.nodes.new('ShaderNodeEmission');tree.links.new(color_source(tree,defaults,profile,mode,tex.outputs['Color']),emission.inputs['Color'])
    output=tree.nodes.new('ShaderNodeOutputMaterial');tree.links.new(emission.outputs[0],output.inputs['Surface']);mesh.materials.append(material)
    camera=bpy.data.objects.new('sample_camera',bpy.data.cameras.new('sample_camera'));scene.collection.objects.link(camera);scene.camera=camera
    camera.location=(0,0,3);camera.data.type='ORTHO';camera.data.ortho_scale=2;obj.scale.y=h/w
    return scene

def solar_vectors(defaults,width=256):
    sun=sun_direction(defaults);right=np.cross(sun,[0,0,1]);right/=np.linalg.norm(right);up=np.cross(right,sun)
    extent=math.tan(math.radians(defaults['sun']['angularDiameterDeg'])*.65)
    x=((np.arange(width)+.5)/width*2-1)*extent;y=-x
    vectors=sun[None,None,:]+x[None,:,None]*right+y[:,None,None]*up
    lengths=np.linalg.norm(vectors,axis=-1);vectors/=lengths[:,:,None]
    weights=(2*extent/width)**2/lengths**3
    return vectors,weights
