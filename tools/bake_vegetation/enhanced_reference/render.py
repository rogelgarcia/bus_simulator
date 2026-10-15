# CPU studio comparisons keep model identity, species framing and source-image distinctions explicit.
import hashlib
import json
import math
import shutil
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector,Euler
from common import configure,array,foliage_data,write_json
from mesh_audit import audit_objects
from branchlets import branchlet_pose
from foliage_study import isolate
from render_cache import reuse
from canopy_review import add_poses,mask_mode,coverage
from presentation_poses import add_presentation_poses
from spatial_poses import add_spatial_poses,isolate_blade
from volume_poses import add_volume_poses


def load(file,names):
    with bpy.data.libraries.load(str(file),link=False) as (available,data):
        if any(n not in available.objects for n in names):raise RuntimeError('Missing reviewed model role')
        data.objects=names
    for obj in data.objects:bpy.context.scene.collection.objects.link(obj);obj.hide_render=False;obj.hide_viewport=False;obj.hide_set(False)
    return data.objects


def setup(o):
    scene=configure(o);scene.cycles.use_denoising=True;scene.cycles.max_bounces=5;scene.cycles.diffuse_bounces=3;scene.cycles.transmission_bounces=3
    scene.cycles.transparent_max_bounces=64;scene.render.threads=o.get('threads',4)
    scene.render.resolution_x=scene.render.resolution_y=o['width'];scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=False
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.65
    world=bpy.data.worlds.new('Neutral photographic studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.53,.54,.52,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.85;scene.world=world
    bpy.ops.mesh.primitive_plane_add(size=10000,location=(0,0,-.015));ground=bpy.context.object;ground.name='Neutral showroom floor';mat=bpy.data.materials.new('Matte neutral floor');mat.use_nodes=True;mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.38,.39,.37,1);mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.92;ground.data.materials.append(mat)
    for name,power,color,angles in [('Daylight key',2.8,(1,.96,.89),(28,-22,-38)),('Soft fill',.85,(.84,.91,1),(50,30,115))]:
        light=bpy.data.lights.new(name,'SUN');light.energy=power;light.color=color;light.angle=math.radians(16)
        obj=bpy.data.objects.new(name,light);scene.collection.objects.link(obj);obj.rotation_euler=[math.radians(v) for v in angles]
    camera=bpy.data.objects.new('Species study camera',bpy.data.cameras.new('Species study camera'));scene.collection.objects.link(camera);scene.camera=camera;camera.data.type='ORTHO';camera.data.clip_start=.01;camera.data.clip_end=1000
    return scene,camera


def render(o):
    for model in o['models']:
        species,variant=model.split('/');directory=Path(o['output'])/model;meta=json.loads((directory/'model.json').read_text());file=directory/'enhanced.blend'
        if hashlib.sha256(file.read_bytes()).hexdigest()!=meta['sha256']:raise RuntimeError('Enhanced model identity changed')
        previous=json.loads((directory/'renders.json').read_text())['renders'] if (directory/'renders.json').exists() else []
        current_identity=next(r['sha256'] for r in o['sources'] if r['id']==model)
        prior=next((r for r in o['previousSources'] if r['id']==model),None)
        identities={'current':current_identity,'enhanced':meta['sha256'],'previous':prior['sha256'] if prior else None}
        previous=[r for r in previous if r['sourceSha256']==identities[r['state']]]
        for record in previous:
            if hashlib.sha256((Path(o['output'])/record['file']).read_bytes()).hexdigest()!=record['sha256']:raise RuntimeError('Previous render changed: '+record['file'])
        records=[r for r in previous if o['views']!='all' and r['view']!=o['views'] and not (o['views']=='canopy' and (r['view'].startswith(('road_','coverage_')) or r['view'] in ['shoot','shoot_edge'])) and not (o['views']=='poses' and r['view'].startswith('pose_')) and not (o['views']=='blade' and r['view']=='blade_edge')]
        posture=meta['revision']=='enhanced-plane-posture-v10'
        volume=meta['revision'] in ['enhanced-oak-volumetric-forks-v5','enhanced-oak-spaced-shoots-v6','enhanced-oak-ascending-fill-v7','enhanced-oak-fork-shoulders-v8'];volume_full=None
        crown=meta['revision']=='enhanced-plane-balanced-crown-v16'
        spatial=meta['revision'] in ['enhanced-plane-spatial-growth-v14','enhanced-plane-open-leaves-v15','enhanced-plane-balanced-crown-v16']
        dome=meta['revision'] in ['enhanced-plane-dome-foliage-v12','enhanced-plane-organic-foliage-v13','enhanced-plane-spatial-growth-v14','enhanced-plane-open-leaves-v15','enhanced-plane-balanced-crown-v16']
        spaced=meta['revision'] in ['enhanced-plane-spaced-foliage-v11','enhanced-plane-dome-foliage-v12','enhanced-plane-organic-foliage-v13','enhanced-plane-spatial-growth-v14','enhanced-plane-open-leaves-v15','enhanced-plane-balanced-crown-v16']
        for state in (['enhanced','previous','current'] if prior else ['enhanced','current']) if variant=='mature_01' else ['enhanced','previous'] if (posture or spatial) and prior else ['enhanced']:
            if o['views']=='poses' and state!='enhanced':continue
            if o['views']=='blade' and (not spatial or variant!='mature_01' or state=='current'):continue
            bpy.ops.wm.read_factory_settings(use_empty=True)
            if state=='current':
                source=next(r for r in o['sources'] if r['id']==model);objects=load(source['file'],[model+' / natural leaves',model+' / original wood',model+' / curved branchlets']);identity=source['sha256']
            else:objects=load(prior['file'] if state=='previous' else file,[model+' / enhanced leaves',model+' / enhanced wood',model+' / enhanced branchlets']);identity=identities[state]
            if state=='enhanced' and not audit_objects(model,meta)['passed']:raise RuntimeError('Saved mesh bounds failed before rendering '+model)
            offset=objects[0].location.copy()
            for obj in objects:obj.location-=offset
            data=foliage_data(objects[0]);matrices=np.array([np.array(Euler(tuple(r)).to_matrix()) for r in data['rotations']])*data['scales'][:,None,:]
            centers=array(objects[0].data.attributes['blade_center'].data,'vector',3) if 'blade_center' in objects[0].data.attributes else data['origins']+matrices[:,:,1]*.52
            low=centers.min(axis=0)-.2;low[2]=0;high=centers.max(axis=0)+.3;target=(low+high)*.5
            span=float(max(high-low)*1.22);h=float(high[2]);clear=o['profiles'][species]['clear']*h
            front=centers[:,1]<np.quantile(centers[:,1],.03);score=np.abs(centers[:,2]-h*.64)+np.abs(centers[:,0])*0.18;score[~front]=np.inf;hero=centers[np.argmin(score)]
            full_offset=(np.array([6.,-30.,2.5])*max(1.,(span*.5-float(target[2])+1.)/2.5)).tolist()
            poses={'full':{'target':target.tolist(),'offset':full_offset,'span':span},
                'trunk':{'target':[0,0,max(.65,clear*.95)],'offset':[1.5,-8,1.0],'span':max(1.2,clear*1.5)},
                'leaves':{'target':hero.tolist(),'offset':[.6,-3,.30],'span':1.55 if species!='arrowwood_viburnum' else 1.05}}
            if volume and state=='enhanced':volume_full=poses['full'].copy()
            if volume and state=='previous':poses['full']=volume_full.copy()
            if (posture or spaced) and prior and state!='current':
                proof=Path(o['previous']);proof=proof if proof.is_absolute() else Path(o['root'])/proof
                poses['full']=next(r['camera'] for r in json.loads(proof.read_text())['renders'] if r['id']==model and r['state']=='enhanced' and r['view']=='full')
            if 'growth' in meta['dimensions'] and state!='current':
                fork=np.array(meta['dimensions']['growth']['firstFork'])+[0,0,1.6 if species=='silver_linden' else 1.0]
                poses['trunk']={'target':fork.tolist(),'offset':[1.5,-10,float(1.6-fork[2])],'span':max(5.5,meta['dimensions']['growth']['rootRadius']*8),'projection':'PERSP'}
            if meta['dimensions'].get('growth',{}).get('architecture')=='distributed-plane':
                height=meta['dimensions']['heightTarget'];focus=height*.34
                poses['trunk']={'target':[0,0,focus],'offset':[2.0,-17,1.6-focus],'span':height*.59,'projection':'PERSP'}
            if prior and state=='enhanced' and variant=='mature_01' and o['views']=='all':poses.update(wood_full=poses['full'].copy(),wood_fork=poses['trunk'].copy())
            hierarchy=meta['revision'] in ['enhanced-plane-hierarchical-v6','enhanced-plane-apical-v7','enhanced-plane-branchlets-v8','enhanced-plane-foliage-v9','enhanced-plane-spaced-foliage-v11','enhanced-plane-dome-foliage-v12','enhanced-plane-organic-foliage-v13','enhanced-plane-spatial-growth-v14','enhanced-plane-open-leaves-v15','enhanced-plane-balanced-crown-v16']
            if meta['dimensions'].get('growth',{}).get('architecture')=='distributed-plane' and (state=='enhanced' or state=='previous' and hierarchy) and variant=='mature_01' and o['views']=='all':
                poses.update(bare=poses['full'].copy(),roots={'target':[0,0,.85],'offset':[3,-9,1.4],'span':8.0 if hierarchy else meta['dimensions']['growth']['rootRadius']*10})
                if meta['revision'] in ['enhanced-plane-branchlets-v8','enhanced-plane-foliage-v9','enhanced-plane-spaced-foliage-v11','enhanced-plane-dome-foliage-v12','enhanced-plane-organic-foliage-v13','enhanced-plane-spatial-growth-v14','enhanced-plane-open-leaves-v15','enhanced-plane-balanced-crown-v16']:
                    poses['wood_branchlets']=branchlet_pose(json.loads((directory/'architecture.json').read_text())['paths'])
            study=[]
            if (meta['revision']=='enhanced-plane-foliage-v9' and state=='enhanced' or spaced and state in ['enhanced','previous']) and variant=='mature_01':
                study,detail=isolate(Path(prior['file']).parent if state=='previous' else directory,objects)
                if spaced and prior:
                    proof=Path(o['previous']);proof=proof if proof.is_absolute() else Path(o['root'])/proof
                    detail=next(r['camera'] for r in json.loads(proof.read_text())['renders'] if r['id']==model and r['state']=='enhanced' and r['view']=='shoot')
                if dome:detail=meta['sprayStudyPose']
                if crown and state=='previous':detail=json.loads((Path(prior['file']).parent/'model.json').read_text())['sprayStudyPose']
                poses['shoot']=detail;poses['leaves']=detail.copy()
                for obj in study:obj.hide_render=True
                if dome:add_poses(poses,{**meta,'sprayStudyPose':detail})
            if variant!='mature_01':poses={'full':poses['full'],**({'bare':poses['full'].copy()} if posture else {})}
            if volume and state!='current':add_volume_poses(poses,variant=='mature_01')
            if meta['revision'] in ['enhanced-plane-organic-foliage-v13','enhanced-plane-spatial-growth-v14','enhanced-plane-open-leaves-v15','enhanced-plane-balanced-crown-v16'] and state=='enhanced':add_presentation_poses(poses,meta,variant=='mature_01')
            blade=None
            if spatial and state!='current':
                add_spatial_poses(poses,state,variant=='mature_01')
                if variant=='mature_01':blade=isolate_blade(objects[0])
            if o['views']!='all':poses={k:v for k,v in poses.items() if k==o['views'] or o['views']=='blade' and k=='blade_edge' or o['views']=='canopy' and (k.startswith(('road_','coverage_')) or k in ['shoot','shoot_edge']) or o['views']=='poses' and k.startswith('pose_')}
            if not poses:
                if o['views'] in ['shoot','canopy']:continue
                raise RuntimeError('Selected view is unavailable for '+model)
            scene,camera=setup(o)
            clay=bpy.data.materials.new('Neutral structural clay');clay.use_nodes=True;clay.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.34,.30,.25,1);clay.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.8
            light=bpy.data.lights.new('Leaf detail softbox','AREA');light.energy=220;light.shape='DISK';light.size=3
            softbox=bpy.data.objects.new('Leaf detail softbox',light);scene.collection.objects.link(softbox)
            for view,pose in poses.items():
                revision='presentation-leaf-softbox-v1' if view.startswith('pose_branch_') else 'shared-forks-street-view-v4' if view=='trunk' else 'shared-forks-street-view-v3' if view in ['wood_fork','wood_full'] and prior else 'outer-leaf-softbox-v2' if view=='leaves' else 'studio-v1'
                if view in ['blade','blade_edge']:revision='isolated-blade-neutral-tint-v2'
                cached=next((r for r in previous if r['state']==state and r['view']==view and r['width']==o['width'] and r['samples']==o['samples'] and r['camera']==pose and r.get('lightingRevision','studio-v1')==revision),None)
                if cached is None:cached=reuse(prior,model,state,view,pose,revision,identity,o)
                if cached:
                    records.append(cached);print('[Enhanced] Reused verified '+model+'/'+state+'/'+view,flush=True);continue
                camera.location=Vector(pose['target'])+Vector(pose['offset']);camera.rotation_euler=(Vector(pose['target'])-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type=pose.get('projection','ORTHO')
                if camera.data.type=='PERSP':camera.data.sensor_width=36;camera.data.lens=36*float(np.linalg.norm(pose['offset']))/pose['span']
                else:camera.data.ortho_scale=pose['span']
                blade_detail=view in ['blade','blade_edge'];isolated=view in ['shoot','shoot_edge','pose_branch_out'] or blade_detail;mask=view.startswith('coverage_')
                objects[0].hide_render=view.startswith('wood_') or view=='bare' or isolated;scene.view_layers[0].material_override=clay if view.startswith('wood_') else None
                for obj in objects[1:]:obj.hide_render=isolated or mask
                for obj in study:obj.hide_render=not isolated or blade_detail
                if blade:blade.hide_render=not blade_detail
                mask_mode(scene,mask,o['samples'])
                leaf_detail=view in ['leaves','shoot','shoot_edge','pose_branch_in','pose_branch_out'] or blade_detail
                softbox.hide_render=not leaf_detail and view not in ['trunk','wood_fork'];light.energy=220 if leaf_detail else 500 if view=='trunk' else 1800;light.size=3 if leaf_detail else 4.5
                softbox.location=camera.location+Vector((1,0,1));softbox.rotation_euler=(Vector(pose['target'])-softbox.location).to_track_quat('-Z','Y').to_euler()
                image=directory/f'{state}_{view}.png'
                if image.exists():
                    old_hash=hashlib.sha256(image.read_bytes()).hexdigest();history=directory/'render_history';history.mkdir(exist_ok=True);backup=history/f'{state}_{view}_{old_hash[:16]}.png'
                    if not backup.exists():shutil.copyfile(image,backup)
                    write_json(backup.with_suffix('.json'),{'preservedSha256':old_hash,'previousRender':next((r for r in previous if r['state']==state and r['view']==view),None)})
                scene.render.filepath=str(image);bpy.ops.render.render(write_still=True)
                records.append({'state':state,'view':view,'file':str(image.relative_to(o['output'])).replace('\\','/'),'sha256':hashlib.sha256(image.read_bytes()).hexdigest(),'sourceSha256':identity,'camera':pose,'width':o['width'],'samples':o['samples'],'lightingRevision':revision,
                    'canopyHeightQuantiles':np.quantile(centers[:,2],[.01,.5,.99]).tolist(),'treeHeight':h})
                if mask:records[-1].update(foliageCoverage=coverage(image),renderSamples=1)
                write_json(directory/'renders.json',{'id':model,'engine':'CYCLES','device':'CPU','renders':records})
                print('[Enhanced] Rendered '+model+'/'+state+'/'+view,flush=True)
        write_json(directory/'renders.json',{'id':model,'engine':'CYCLES','device':'CPU','renders':records})
