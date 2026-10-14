# Builds a neutral studio and labeled orbit around authenticated reference or LOD0 specimens.
import math
from itertools import product
from pathlib import Path
import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
from comparison import cutout_for_cycles
from common import load_reference,triangles

NAMES={'london_plane':'London plane','silver_linden':'Silver linden','northern_red_oak':'Northern red oak',
       'american_elm':'American elm','arrowwood_viburnum':'Arrowwood viburnum'}


def material(name,color,roughness=1,emission=False):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    nodes,links=mat.node_tree.nodes,mat.node_tree.links
    bsdf=nodes.get('Principled BSDF')
    if emission:
        node=nodes.new('ShaderNodeEmission');node.inputs['Color'].default_value=(*color,1)
        links.new(node.outputs[0],nodes.get('Material Output').inputs['Surface'])
    else:
        bsdf.inputs['Base Color'].default_value=(*color,1);bsdf.inputs['Roughness'].default_value=roughness
    return mat


def title(camera,text,position,size,mat):
    curve=bpy.data.curves.new(text,'FONT');curve.body=text;curve.size=size;curve.align_y='TOP_BASELINE'
    obj=bpy.data.objects.new(text,curve);bpy.context.collection.objects.link(obj)
    obj.parent=camera;obj.location=position;curve.materials.append(mat);obj.visible_shadow=False
    return obj


def reference_specimen(options,model):
    if model.get('natural') or model.get('enhanced'):
        suffixes=['enhanced wood','enhanced leaves','enhanced branchlets'] if model.get('enhanced') else ['original wood','natural leaves','curved branchlets']
        names=[model['id']+' / '+suffix for suffix in suffixes]
        with bpy.data.libraries.load(model['file'],link=False) as (source,target):
            if any(name not in source.objects for name in names):raise RuntimeError('Incomplete revised reference: '+model['id'])
            target.objects=names
        trees=target.objects
        for obj in trees:bpy.context.scene.collection.objects.link(obj)
        if len(trees[1].data.vertices)!=model['leafCount']:raise RuntimeError('Revised leaf count differs from its receipt')
    else:
        names=[model['id']+' / original wood',model['id']+' / solid leaves']
        trees=load_reference({'source':options['reference']},names)
    for obj in trees:
        obj.hide_render=False;obj.hide_viewport=False;obj.hide_set(False)
    bpy.context.view_layer.update()
    low=Vector((math.inf,)*3);high=Vector((-math.inf,)*3);instances=0
    for item in bpy.context.evaluated_depsgraph_get().object_instances:
        if item.object.type!='MESH':continue
        if item.is_instance:instances+=1
        for corner in item.object.bound_box:
            point=item.matrix_world@Vector(corner)
            for axis in range(3):
                low[axis]=min(low[axis],point[axis]);high[axis]=max(high[axis],point[axis])
    if instances!=len(trees[1].data.vertices):raise RuntimeError('Reference foliage instance count changed')
    for image in bpy.data.images:
        if image.source=='FILE' and not image.packed_file and not Path(bpy.path.abspath(image.filepath)).is_file():
            raise RuntimeError('Missing reference texture: '+image.name)
    points=[Vector(corner) for corner in product(*[(low[i],high[i]) for i in range(3)])]
    print(f'[Turntable] Full-detail reference {model["id"]}: {triangles(trees[0].data)} wood triangles; {instances} foliage instances',flush=True)
    return trees,points,{'woodTriangles':sum(triangles(obj.data) for obj in trees if obj!=trees[1]),'foliageInstances':instances,'foliageRevision':model.get('revision','original')}


def studio(options,model,labels=True):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE'
    scene.eevee.taa_render_samples=options['samples'];scene.eevee.use_raytracing=False
    scene.render.threads_mode='FIXED';scene.render.threads=options['threads']
    scene.render.resolution_x=options['width'];scene.render.resolution_y=options['width']*9//16;scene.render.resolution_percentage=100
    scene.render.fps=options['fps'];scene.frame_start=1;scene.frame_end=options['fps']*options['seconds']
    scene.render.film_transparent=False;scene.render.use_compositing=False;scene.render.use_sequencer=False
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.6
    world=bpy.data.worlds.new('Soft neutral showroom');world.use_nodes=True
    world.node_tree.nodes['Background'].inputs['Color'].default_value=(.24,.28,.26,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.6;scene.world=world
    reference=options['representation']=='reference';detail={}
    if reference:
        trees,points,detail=reference_specimen(options,model)
    else:
        bpy.ops.import_scene.gltf(filepath=model['file'])
        bpy.context.view_layer.update()
        trees=[obj for obj in scene.objects if obj.type=='MESH']
        for obj in trees:
            for mat in obj.data.materials:
                if 'spray cards' in mat.name or 'leaves' in mat.name.lower():
                    cutout_for_cycles(mat,.17,True);mat.surface_render_method='DITHERED';mat.use_backface_culling=False
        points=[obj.matrix_world@Vector(corner) for obj in trees for corner in obj.bound_box]
    low=Vector([min(p[i] for p in points) for i in range(3)]);high=Vector([max(p[i] for p in points) for i in range(3)])
    center=Vector(((low.x+high.x)/2,(low.y+high.y)/2,low.z))
    root=bpy.data.objects.new('Mature specimen',None);scene.collection.objects.link(root)
    for obj in list(scene.objects):
        if obj!=root and obj.parent is None:obj.parent=root
    root.location=-center;root.location.z+=.025
    points=[point+root.location for point in points]
    height=high.z-low.z;radius=max((high.x-low.x)/2,(high.y-low.y)/2)
    stage_radius=max(radius*1.10,height*.20)
    bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=stage_radius,depth=.12,location=(0,0,-.06))
    base=bpy.context.object;base.name='Circular specimen stage';base.data.materials.append(material('Stage · warm charcoal',(.13,.15,.14),.64))
    bevel=base.modifiers.new('Soft edge','BEVEL');bevel.width=.045;bevel.segments=3
    base.modifiers.new('Weighted stage normals','WEIGHTED_NORMAL')
    bpy.ops.mesh.primitive_plane_add(size=2000,location=(0,0,-.13));bpy.context.object.name='Infinite neutral floor'
    bpy.context.object.data.materials.append(material('Matte showroom floor',(.21,.235,.22),.88))
    for name,energy,color,rotation,angle in [
        ('Warm key',2.4,(1,.89,.74),(24,-28,-35),10),
        ('Cool fill',1.2,(.77,.86,1),(48,22,120),18),
        ('Canopy rim',1.5,(1,.96,.83),(35,-20,205),8)]:
        data=bpy.data.lights.new(name,'SUN');data.energy=energy;data.color=color;data.angle=math.radians(angle);data.use_shadow=name=='Warm key'
        light=bpy.data.objects.new(name,data);scene.collection.objects.link(light);light.rotation_euler=[math.radians(v) for v in rotation]
    camera=bpy.data.objects.new('Orbit camera',bpy.data.cameras.new('Orbit camera'));scene.collection.objects.link(camera);scene.camera=camera
    bpy.context.view_layer.update();elevation=math.radians(10)
    bottom=min(math.cos(elevation)*p.z-math.sin(elevation)*math.hypot(p.x,p.y) for p in points)
    top=max(math.cos(elevation)*p.z+math.sin(elevation)*math.hypot(p.x,p.y) for p in points)
    vertical=max((top-bottom)/.70,stage_radius*2*1.16/(16/9))
    camera.data.type='ORTHO';camera.data.ortho_scale=vertical*(16/9);camera.data.clip_end=2000
    target=Vector((0,0,((top+bottom)/2+vertical*.055)/math.cos(elevation)));distance=max(15,height*2)
    projected=[]
    for frame in range(1,scene.frame_end+2):
        theta=math.radians(-72)+math.tau*(frame-1)/scene.frame_end
        camera.location=target+Vector((math.cos(theta)*distance,math.sin(theta)*distance,distance*math.tan(elevation)))
        camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
        camera.keyframe_insert(data_path='location',frame=frame);camera.keyframe_insert(data_path='rotation_euler',frame=frame)
        if (frame-1)%max(1,scene.frame_end//16)==0:
            bpy.context.view_layer.update()
            projected.extend(world_to_camera_view(scene,camera,point) for point in points)
    if any(p.x<.04 or p.x>.96 or p.y<.055 or p.y>.83 for p in projected):
        raise RuntimeError('Full orbit does not fit the showroom frame: '+str([[min(p[i] for p in projected),max(p[i] for p in projected)] for i in range(2)]))
    vertical=camera.data.ortho_scale/(16/9);horizontal=camera.data.ortho_scale
    white=material('Typography · forest ink',(.008,.018,.012),emission=True);muted=material('Typography · dark sage',(.025,.045,.032),emission=True)
    if labels:
        title(camera,NAMES[model['species']],(-horizontal*.45,vertical*.435,-1),vertical*.057,white)
        title(camera,model['scientific'],(-horizontal*.45,vertical*.36,-1),vertical*.032,muted)
        title(camera,'HIGH-DETAIL REFERENCE' if reference else 'MATURE COLLECTION',(-horizontal*.45,-vertical*.435,-1),vertical*.020,muted)
        index=list(NAMES).index(model['species'])+1
        title(camera,f'{index:02d} / 05',(horizontal*.375,vertical*.435,-1),vertical*.034,white)
    scene.frame_set(1)
    return scene,{'species':model['species'],'name':NAMES[model['species']],'scientific':model['scientific'],
        'heightMetres':height,'variant':options['variant'],'representation':options['representation'],**detail,'engine':'BLENDER_EEVEE','orbitDegrees':360,
        'width':options['width'],'height':options['width']*9//16,'fps':options['fps'],'frames':scene.frame_end,
        'seconds':options['seconds'],'renderIdentity':options['renderIdentity'],'sourceSha256':model['sha256']}
