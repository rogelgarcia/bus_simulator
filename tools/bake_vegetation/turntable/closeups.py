# Camera-matched foliage studies of immutable solid leaves and installed alpha cards.
import hashlib
import json
import math
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from common import load_reference,foliage_data,write_json
from comparison import cutout_for_cycles
from scene import NAMES


def render_closeups(options):
    output=Path(options['output']);report={'engine':'BLENDER_EEVEE','samples':options['samples'],'renders':[]}
    for model in options['models']:
        if model['species'] not in options['species']:continue
        bpy.ops.wm.read_factory_settings(use_empty=True)
        scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE'
        scene.eevee.taa_render_samples=options['samples'];scene.eevee.use_raytracing=False
        scene.render.threads_mode='FIXED';scene.render.threads=2
        scene.render.resolution_x=options['width'];scene.render.resolution_y=options['width']*3//4
        scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
        scene.render.image_settings.color_mode='RGB';scene.render.use_compositing=False
        scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.6
        world=bpy.data.worlds.new('Neutral leaf study');world.use_nodes=True;scene.world=world
        world.node_tree.nodes['Background'].inputs['Color'].default_value=(.24,.28,.26,1)
        world.node_tree.nodes['Background'].inputs['Strength'].default_value=.6
        for name,energy,color,rotation in [('Key',2.4,(1,.89,.74),(24,-28,-35)),('Fill',1.2,(.77,.86,1),(48,22,120)),('Rim',1.5,(1,.96,.83),(35,-20,205))]:
            data=bpy.data.lights.new(name,'SUN');data.energy=energy;data.color=color;data.angle=math.radians(10)
            obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.rotation_euler=[math.radians(v) for v in rotation]
        reference=load_reference({'source':options['reference']},[model['id']+' / original wood',model['id']+' / solid leaves'])
        for obj in reference:obj.hide_render=False;obj.hide_viewport=False;obj.hide_set(False)
        wood,foliage=reference;bpy.context.view_layer.update()
        data=foliage_data(foliage)
        recipe=json.loads((Path(options['root'])/'tools/bake_vegetation'/model['species']/'recipe.json').read_text())
        stride=recipe['texture']['leafCount']+2
        local=data['origins'].reshape((-1,stride,3))[:,2:,:].mean(axis=1)
        matrix=np.array(foliage.matrix_world);centers=local@matrix[:3,:3].T+matrix[:3,3]
        before=set(scene.objects);bpy.ops.import_scene.gltf(filepath=model['lod0']['file'])
        lod=list(set(scene.objects)-before)
        placement=bpy.data.objects.new('LOD0 original reference placement',None);scene.collection.objects.link(placement)
        placement.location=wood.location
        for obj in lod:
            if obj.parent not in lod:obj.parent=placement
            if obj.type=='MESH':
                for mat in obj.data.materials:
                    if ('spray cards' in mat.name or 'leaves' in mat.name.lower()) and not mat.get('closeupCutoutReady'):
                        cutout_for_cycles(mat,.17,True);mat.surface_render_method='DITHERED';mat.use_backface_culling=False;mat['closeupCutoutReady']=True
        lod.append(placement)
        camera=bpy.data.objects.new('Matched leaf close-up',bpy.data.cameras.new('Matched leaf close-up'));scene.collection.objects.link(camera);scene.camera=camera
        camera.data.type='ORTHO';camera.data.clip_end=500;camera.data.clip_start=.01
        widths={'london_plane':2.0,'silver_linden':1.3,'northern_red_oak':1.6,'american_elm':1.2,'arrowwood_viburnum':1.0}
        z0,z1=np.quantile(centers[:,2],[.05,.95]);z=z0+(z1-z0)*.48
        band=centers[np.abs(centers[:,2]-z)<max(.25,(z1-z0)*.13)]
        direction=Vector((.309,-.951,0));projected=band@np.array(direction)
        # Select an actual outer shoot, avoiding the sparse single furthest outlier.
        desired=np.quantile(projected,.97)
        index=np.argmin((projected-desired)**2+(band[:,2]-z)**2)
        target=Vector(band[index]);width=widths[model['species']]
        for view,elevation,scale in [('branchlets',.20,1.5),('underside',-.65,1.0)]:
            eye_direction=Vector((direction.x,direction.y,elevation)).normalized()
            camera.location=target+eye_direction*25;camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
            camera.data.ortho_scale=width*scale;bpy.context.view_layer.update()
            pose={'position':list(camera.location),'target':list(target),'rotation':list(camera.rotation_euler),'horizontalSpanMetres':camera.data.ortho_scale,'projection':'orthographic'}
            for representation,objects in [('reference',reference),('lod0',lod)]:
                for obj in reference:obj.hide_render=representation!='reference'
                for obj in lod:obj.hide_render=representation!='lod0'
                file=f'{model["species"]}_{view}_{representation}.png';scene.render.filepath=str(output/file)
                bpy.ops.render.render(write_still=True)
                report['renders'].append({'species':model['species'],'name':NAMES[model['species']],'scientific':model['scientific'],'variant':options['variant'],'view':view,'representation':representation,'file':file,'camera':pose,'width':scene.render.resolution_x,'height':scene.render.resolution_y,'sourceSha256':model['sha256'] if representation=='reference' else model['lod0']['sha256'],'sha256':hashlib.sha256((output/file).read_bytes()).hexdigest()})
                write_json(output/'closeups.json',report)
                print(f'[Leaf closeups] {model["species"]} {view} {representation}',flush=True)
