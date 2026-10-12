# Renders exported hybrids beside their immutable references with matched CPU Cycles cameras.
import math
import hashlib
import json
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from common import clear_scene,configure,write_json
from source import load
from comparison import cutout_for_cycles


def render_scene(options):
    scene=configure(options);scene.render.threads=4;scene.cycles.samples=options['samples'];scene.cycles.use_denoising=True
    scene.cycles.transparent_max_bounces=64;scene.cycles.max_bounces=4;scene.cycles.diffuse_bounces=2;scene.cycles.glossy_bounces=1
    scene.render.resolution_x=options['width'];scene.render.resolution_y=options['width']*3//4;scene.render.resolution_percentage=100
    scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
    scene.render.use_compositing=False;scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.6
    world=bpy.data.worlds.new('Neutral review');world.use_nodes=True;scene.world=world
    world.node_tree.nodes['Background'].inputs['Color'].default_value=(.24,.28,.26,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.6
    for name,power,color,rotation in [('Key',2.4,(1,.89,.74),(24,-28,-35)),('Fill',1.0,(.77,.86,1),(48,22,120))]:
        data=bpy.data.lights.new(name,'SUN');data.energy=power;data.color=color;data.angle=math.radians(10)
        obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.rotation_euler=[math.radians(v) for v in rotation]
    camera=bpy.data.objects.new('Matched camera',bpy.data.cameras.new('Matched camera'));scene.collection.objects.link(camera);scene.camera=camera
    camera.data.type='ORTHO';camera.data.clip_start=.01;camera.data.clip_end=1000
    return scene,camera


def pose(camera,value):
    camera.location=value['position'];camera.rotation_euler=(Vector(value['target'])-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type=value.get('type','ORTHO')
    if camera.data.type=='ORTHO':camera.data.ortho_scale=value['span']
    else:camera.data.lens=19.21;camera.data.sensor_fit='VERTICAL';camera.data.sensor_height=20


def render(options,row):
    model=row['id'];species=model.split('/')[0];directory=Path(options['output'])/model
    clear_scene();reference,data=load(row,True)
    position=reference[0].location.copy()
    for obj in reference:obj.location-=position
    center=(np.min(data['centers'],axis=0)+np.max(data['centers'],axis=0))*.5
    high=np.max(data['centers'],axis=0)+.4;low=np.min(data['centers'],axis=0)-.4;low[2]=0;target=(low+high)*.5
    span=max((high[2]-low[2])*4/3*1.18,max(high[:2]-low[:2])*1.48)
    layout=json.loads((directory/'layout.json').read_text());leafids=layout['detailedLeafIndices']
    hero=min(leafids,key=lambda i:data['centers'][i,1]+abs(data['centers'][i,2]-center[2])*.7)
    hero_target=data['centers'][hero]
    poses={}
    for name,angle in [('full',-72),('reverse',108)]:
        theta=math.radians(angle);poses[name]={'position':(target+[math.cos(theta)*30,math.sin(theta)*30,2.5]).tolist(),'target':target.tolist(),'span':float(span)}
    poses['leaves']={'position':(hero_target+[.7,-4,.4]).tolist(),'target':hero_target.tolist(),'span':1.8 if species!='arrowwood_viburnum' else 1.1}
    radius=float(max(np.ptp(data['centers'][:,:2],axis=0))*.5)
    bus_target=np.array([0,0,max(2.,center[2]*.80)])
    poses['bus']={'position':[0,-max(radius*1.5,4.),2.4],'target':bus_target.tolist(),'type':'PERSP'}
    if options['phase']=='variants':poses={'full':poses['full']}
    for obj in reference:obj.hide_render=True
    before=set(bpy.data.objects)
    variant=model.split('/')[1];file=directory/(variant+'_lod0_review.glb')
    if not file.exists():file=directory/(variant+'_lod0.glb')
    rendered_hash=hashlib.sha256(file.read_bytes()).hexdigest()
    bpy.ops.import_scene.gltf(filepath=str(file))
    hybrid=[o for o in bpy.data.objects if o not in before and o.type=='MESH']
    if len(hybrid)!=5:raise RuntimeError('Expected all five exported mesh roles')
    for obj in hybrid:
        for mat in obj.data.materials:
            if 'spray cards' in mat.name:cutout_for_cycles(mat,.17,True)
            if 'opaque leaves' in mat.name and not mat.get('reviewTransmission'):
                nodes,links=mat.node_tree.nodes,mat.node_tree.links;bsdf=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
                tissue=nodes.new('ShaderNodeBsdfTranslucent');links.new(bsdf.inputs['Base Color'].links[0].from_socket,tissue.inputs['Color'])
                mix=nodes.new('ShaderNodeMixShader');mix.inputs[0].default_value=.17;links.new(bsdf.outputs[0],mix.inputs[1]);links.new(tissue.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],nodes.get('Material Output').inputs['Surface']);mat['reviewTransmission']=True
    scene,camera=render_scene(options);renders=[]
    for view,value in poses.items():
        pose(camera,value)
        for state in (['hybrid'] if options['phase']=='variants' else ['reference','hybrid']):
            for obj in reference:obj.hide_render=state!='reference'
            for obj in hybrid:obj.hide_render=state!='hybrid'
            file=directory/f'{view}_{state}.png';scene.render.filepath=str(file);bpy.ops.render.render(write_still=True)
            image=bpy.data.images.load(str(file),check_existing=False);pixels=np.empty(options['width']*(options['width']*3//4)*4,np.float32);image.pixels.foreach_get(pixels);bpy.data.images.remove(image)
            occupied=int(np.count_nonzero(pixels.reshape(-1,4)[:,3]>.5))
            renders.append({'id':model,'view':view,'state':state,'file':str(file.relative_to(options['output'])),'camera':value,'occupiedPixels':occupied})
            print(f'[Hybrid] Rendered {model}/{view}/{state}',flush=True)
    write_json(directory/'renders.json',{'id':model,'referenceSha256':row['sha256'],'renderedGlbSha256':rendered_hash,'width':options['width'],'samples':options['samples'],'engine':'CYCLES','device':'CPU','renders':renders})


def run(options):
    for row in options['sources']:
        primary=row['id'].endswith('mature_01')
        if (options['phase']=='variants')!=primary:render(options,row)
