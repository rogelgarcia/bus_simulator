# Shows one connected growth experiment from fixed full-tree and actual-branch inspection cameras.
import hashlib
import json
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from common import write_json,array
from render import load,setup
from foliage_study import isolate
from growth_v2.audit import inspect
from mesh_audit import audit_objects


def render(o):
    model=o['models'][0];directory=Path(o['output'])/model;meta=json.loads((directory/'model.json').read_text())
    if len(o['models'])!=1 or not meta.get('growthCore'):raise RuntimeError('Expected one growth-core study')
    prior=next(r for r in o['previousSources'] if r['id']==model);file=directory/'enhanced.blend'
    if hashlib.sha256(file.read_bytes()).hexdigest()!=meta['sha256']:raise RuntimeError('Growth study changed')
    previous=json.loads((Path(prior['file']).parent/'model.json').read_text());low=np.minimum(meta['bounds']['min'],previous['bounds']['min']);high=np.maximum(meta['bounds']['max'],previous['bounds']['max'])
    low[2]=0.;target=(low+high)*.5;span=float(max(high-low)*1.18)
    full={'target':target.tolist(),'offset':[6.,-32.,3.2],'span':span}
    poses={'full':full,'volume_side':{**full,'offset':[32.,6.,3.2]},'volume_rear':{**full,'offset':[-6.,32.,3.2]},
           'volume_above':{**full,'offset':[11.,-19.,25.]},'bare':full,
           'crown':{'target':(target+[0,0,high[2]*.19]).tolist(),'offset':[8.,-21.,20.],'span':span*.60},
           'wood_crown':{'target':(target+[0,0,high[2]*.14]).tolist(),'offset':full['offset'],'span':span*.73}}
    records=[]
    for state in ['previous','enhanced']:
        bpy.ops.wm.read_factory_settings(use_empty=True);source=Path(prior['file']) if state=='previous' else file
        objects=load(source,[model+' / enhanced '+r for r in ['leaves','wood','branchlets']]);scene,camera=setup(o)
        if state=='enhanced':
            if not audit_objects(model,meta)['passed'] or not inspect(model,meta,directory)['passed']:raise RuntimeError('Saved growth mesh failed audit')
        jobs=list(poses.items()) if state=='enhanced' else [(v,poses[v]) for v in ['full','volume_side','volume_above','crown','bare','wood_crown']]
        study=[]
        if state=='enhanced':
            study,branch_pose=isolate(directory,objects,outer=True)
            points=np.vstack([array(study[1].data.vertices,'co',3),array(study[0].data.attributes['blade_center'].data,'vector',3)])
            normal=np.array(branch_pose['offset']);normal/=np.linalg.norm(normal)
            basis=np.array((-Vector(normal)).to_track_quat('-Z','Y').to_matrix());right=basis[:,0];up=basis[:,1]
            margin=float(np.max(array(study[0].data.attributes['leaf_scale'].data,'vector',3)))*.65
            for name,offset in [('front',normal*8),('side',right*8+normal*2),('above',up*6+normal*5),('under',right*2-normal*6)]:
                camera_basis=np.array((-Vector(offset)).to_track_quat('-Z','Y').to_matrix());projected=points@camera_basis
                low=projected.min(axis=0);high=projected.max(axis=0)
                detail={'target':(camera_basis@((low+high)*.5)).tolist(),'offset':offset.tolist(),'span':float(max((high-low)[:2])+margin*2)*1.12}
                jobs.extend([('shoot_'+name,detail),('twig_'+name,detail)])
            center=np.array(branch_pose['target']);detail_span=branch_pose['span']
            jobs.append(('attached',{'target':center.tolist(),'offset':[1,-8,3],'span':detail_span*2.0}))
        for view,pose in jobs:
            isolated=view.startswith(('shoot_','twig_'));bare=view in ['bare','wood_crown'] or view.startswith('twig_');close=isolated or view in ['crown','attached','wood_crown']
            for obj in objects:obj.hide_render=isolated
            if bare:objects[0].hide_render=True
            for obj in study:obj.hide_render=not isolated
            if bare and study:study[0].hide_render=True
            width=o['detail-width'] if close else o['width'];scene.render.resolution_x=scene.render.resolution_y=width
            camera.location=Vector(pose['target'])+Vector(pose['offset']);camera.rotation_euler=(Vector(pose['target'])-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=pose['span']
            floor=bpy.data.objects['Neutral showroom floor'];floor.hide_render=isolated
            image=directory/(state+'_'+view+'.png');scene.render.filepath=str(image);bpy.ops.render.render(write_still=True)
            records.append({'id':model,'state':state,'view':view,'file':str(image.relative_to(o['output'])).replace('\\','/'),'sha256':hashlib.sha256(image.read_bytes()).hexdigest(),
                            'sourceSha256':prior['sha256'] if state=='previous' else meta['sha256'],'camera':pose,'width':width,'samples':o['samples'],'engine':scene.render.engine,'lightingRevision':'growth-core-study-1'})
            write_json(directory/'renders.json',{'id':model,'renders':records})
