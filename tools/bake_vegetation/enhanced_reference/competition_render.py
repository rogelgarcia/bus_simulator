# Renders matched species-wide pruning reviews with visible-wood masks and actual branchlet close-ups.
import hashlib
import json
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from common import write_json
from render import load,setup
from foliage_study import isolate
from canopy_review import mask_mode
from mesh_audit import audit_objects
import canopy_visibility


def render(o):
    summary=json.loads(Path(o['previous']).read_text())
    for model in o['models']:
        directory=Path(o['output'])/model;meta=json.loads((directory/'model.json').read_text());prior=next(r for r in o['previousSources'] if r['id']==model)
        if hashlib.sha256((directory/'enhanced.blend').read_bytes()).hexdigest()!=meta['sha256']:raise RuntimeError('Competition render identity differs')
        full=next(r['camera'] for r in summary['renders'] if r['id']==model and r['state']=='enhanced' and r['view']=='full');poses={'front':full}
        for view,angle in [('side',np.pi/2),('rear',np.pi)]:
            x,y,z=full['offset'];poses[view]={**full,'offset':[x*np.cos(angle)-y*np.sin(angle),x*np.sin(angle)+y*np.cos(angle),z]}
        records=[];detail=None
        for state in ['previous','enhanced']:
            bpy.ops.wm.read_factory_settings(use_empty=True);source=Path(prior['file']) if state=='previous' else directory/'enhanced.blend'
            objects=load(source,[model+' / enhanced '+r for r in ['leaves','wood','branchlets']])
            if state=='enhanced' and not audit_objects(model,meta)['passed']:raise RuntimeError('Saved species mesh failed audit')
            scene,camera=setup(o);study=[]
            jobs=[('full',full)]+([(f'volume_{v}',poses[v]) for v in ['side','rear']] if state=='enhanced' else [])
            if model.endswith('mature_01'):
                root=meta['shootCompetitionReview']['studyRootPrevious' if state=='previous' else 'studyRootEnhanced']
                study,pose=isolate(source.parent,objects,outer=True,root_override=root)
                if detail is None:detail={**pose,'span':pose['span']*1.12}
                jobs.extend([('shoot',detail),('leaves',detail)])
            if state=='previous':jobs.extend([('coverage_'+v,poses[v]) for v in poses])
            jobs.extend([('visibility_'+v,poses[v]) for v in poses])
            light=bpy.data.lights.new('Competition leaf softbox','AREA');light.energy=220;light.shape='DISK';light.size=3
            softbox=bpy.data.objects.new(light.name,light);scene.collection.objects.link(softbox)
            for view,pose in jobs:
                mask=view.startswith('coverage_');semantic=view.startswith('visibility_');close=view in ['shoot','leaves'];isolated=view=='shoot'
                width=640 if mask or semantic else o['detail-width'] if close else o['width'];scene.render.resolution_x=scene.render.resolution_y=width
                camera.location=Vector(pose['target'])+Vector(pose['offset']);camera.rotation_euler=(Vector(pose['target'])-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type=pose.get('projection','ORTHO')
                if camera.data.type=='ORTHO':camera.data.ortho_scale=pose['span']
                else:camera.data.sensor_width=36;camera.data.lens=36*np.linalg.norm(pose['offset'])/pose['span']
                for obj in objects:obj.hide_render=isolated
                if mask:
                    for obj in objects[1:]:obj.hide_render=True
                for obj in study:obj.hide_render=not isolated
                scene.view_layers[0].material_override=None;mask_mode(scene,mask,o['samples']);scene.eevee.taa_render_samples=o['samples']
                visibility=canopy_visibility.begin(scene,objects) if semantic else None
                softbox.hide_render=not close;softbox.location=camera.location+Vector((1,0,1));softbox.rotation_euler=camera.rotation_euler
                image=directory/(state+'_'+view+'.png');scene.render.filepath=str(image);bpy.ops.render.render(write_still=True)
                if visibility:canopy_visibility.end(scene,visibility)
                records.append({'id':model,'state':state,'view':view,'file':str(image.relative_to(o['output'])).replace('\\','/'),'sha256':hashlib.sha256(image.read_bytes()).hexdigest(),
                                'sourceSha256':prior['sha256'] if state=='previous' else meta['sha256'],'camera':pose,'width':width,'samples':o['samples'],'engine':scene.render.engine,'lightingRevision':'competition-review-v1'})
                write_json(directory/'renders.json',{'id':model,'renders':records})
        canopy_visibility.finish(directory,records);print('[Competition render] '+model+' '+str(len(records))+' verified-source frames',flush=True)
