# Calibrates additive reference foliage against exact four-view geometry silhouettes.
import hashlib
import json
import math
import os
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from common import write_json,foliage_data
from build import leaf_object,fingerprint,crowding
from coverage_layout import records_from_object,leaf_data,additions


class Probe:
    def __init__(self,options,stats,location):
        self.scene=bpy.context.scene;scene=self.scene;scene.render.engine='BLENDER_WORKBENCH'
        scene.render.resolution_x=768;scene.render.resolution_y=576;scene.render.resolution_percentage=100
        scene.render.film_transparent=True;scene.render.use_compositing=False;scene.render.use_sequencer=False
        scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
        scene.display.shading.light='FLAT';scene.display.shading.color_type='SINGLE';scene.display.shading.single_color=(1,1,1)
        scene.display.shading.show_shadows=False;scene.display.shading.show_cavity=False;scene.display.render_aa='8'
        scene.render.threads_mode='FIXED';scene.render.threads=2
        self.camera=bpy.data.objects.new('Coverage camera',bpy.data.cameras.new('Coverage camera'));scene.collection.objects.link(self.camera);scene.camera=self.camera
        self.camera.data.type='ORTHO';self.camera.data.clip_end=500;self.camera.data.clip_start=.01
        low=np.array(stats['proxyBoundsAfter'][0])+location-.5;high=np.array(stats['proxyBoundsAfter'][1])+location+.5;low[2]=location[2]
        target=(low+high)/2;span=max((high[2]-low[2])*4/3*1.18,max(high[:2]-low[:2])*1.45)
        self.camera.data.ortho_scale=span;self.location=location;self.poses=[];self.frames=[];self.masks=[]
        for angle in [-72,18,108,198]:
            theta=math.radians(angle);eye=target+np.array([math.cos(theta)*30,math.sin(theta)*30,2.5])
            self.poses.append({'angle':angle,'position':eye.tolist(),'target':target.tolist(),'horizontalSpanMetres':span})
            self.pose(self.poses[-1]);matrix=np.array(self.camera.matrix_world.to_quaternion().to_matrix())
            self.frames.append((eye,matrix[:,0],matrix[:,1],span))
    def pose(self,pose):
        self.camera.location=pose['position'];self.camera.rotation_euler=(Vector(pose['target'])-self.camera.location).to_track_quat('-Z','Y').to_euler();bpy.context.view_layer.update()
    def render(self,directory,label):
        masks=[]
        for i,pose in enumerate(self.poses):
            self.pose(pose);file=directory/f'{label}_{i}.png';self.scene.render.filepath=str(file);bpy.ops.render.render(write_still=True)
            image=bpy.data.images.load(str(file),check_existing=False);pixels=np.empty(768*576*4,np.float32);image.pixels.foreach_get(pixels);bpy.data.images.remove(image)
            masks.append(pixels.reshape(576,768,4)[:,:,3]>.5)
        self.masks=masks;return np.array([np.count_nonzero(mask) for mask in masks])
    def exposure(self,record):
        matrix=record['matrix'];center=record['center']+self.location
        points=np.array([center,center+matrix[:,0]*.32,center-matrix[:,0]*.32,center+matrix[:,1]*.34,center-matrix[:,1]*.34])
        score=0.
        for mask,(eye,right,up,span) in zip(self.masks,self.frames):
            x=((points-eye)@right/span+.5)*768;y=((points-eye)@up/(span*.75)+.5)*576
            ix=np.clip(x.astype(int),0,767);iy=np.clip(y.astype(int),0,575)
            score+=float(np.mean(~mask[iy,ix]))
        return score/4


def run(options):
    output=Path(options['output']);baseline=Path(options['baseline']);report=json.loads((baseline/'summary.json').read_text())
    summary={'revision':'natural-shoots-coverage-v1','sourceSha256':report['sourceSha256'],'models':[],'renders':[],'coverage':[]}
    for model in options['models']:
        source=next(row for row in report['models'] if row['id']==model);source_file=(baseline/source['file']).resolve()
        if hashlib.sha256(source_file.read_bytes()).hexdigest()!=source['sha256']:raise RuntimeError('Coverage baseline changed: '+model)
        if model.startswith('arrowwood_viburnum/'):
            summary['models'].append({**source,'file':os.path.relpath(source_file,output),'shoots':os.path.relpath(source_file.parent/'shoots.json',output)})
            summary['coverage'].append({'id':model,'unchanged':True,'ratios':[1.,1.,1.,1.]});write_json(output/'summary.json',summary);continue
        directory=output/model;directory.mkdir(parents=True,exist_ok=True);file=directory/'reference.blend'
        if file.exists():
            saved=json.loads((directory/'model.json').read_text())
            if saved['coverage']['baselineSha256']!=source['sha256'] or saved['coverage']['codeIdentity']!=options['coverageCodeIdentity'] or hashlib.sha256(file.read_bytes()).hexdigest()!=saved['sha256']:raise RuntimeError('Preserve existing coverage candidate; choose a fresh output')
            summary['models'].append(saved);summary['coverage'].append(saved['coverage']);write_json(output/'summary.json',summary);continue
        bpy.ops.wm.open_mainfile(filepath=str(source_file));wood=bpy.data.objects[model+' / original wood'];original=bpy.data.objects[model+' / natural leaves'];twigs=bpy.data.objects[model+' / curved branchlets']
        bpy.data.objects[model+' / solid leaves'].hide_render=True
        for obj in [wood,original,twigs]:obj.hide_render=False;obj.hide_set(False)
        wood_hash=fingerprint(wood.data);twig_hash=fingerprint(twigs.data);original_data=foliage_data(original)
        records=records_from_object(original);n=len(records);data=json.loads((source_file.parent/'shoots.json').read_text());shoots=data['shoots']
        species,variant=model.split('/');recipe=json.loads((Path(options['root'])/'tools/bake_vegetation'/species/'recipe.json').read_text());seed=next(v['seed'] for v in recipe['variants'] if v['id']==variant)+710000
        probe=Probe(options,source,np.array(original.location));before=probe.render(directory,'before');history=[];current=None;pool=[]
        original.name=model+' / previous natural leaves'
        def measure(count,label):
            nonlocal current
            if current is not None:bpy.data.objects.remove(current,do_unlink=True)
            current=leaf_object(original,records+pool[:count]);current.name=model+' / natural leaves';original.hide_render=True;original.hide_set(True)
            pixels=probe.render(directory,label);ratios=pixels/before
            history.append({'added':count,'ratios':ratios.tolist()});print(f'[Coverage] {model}: {count} added; mean gain {(float(ratios.mean())-1)*100:.2f}%',flush=True)
            return ratios
        for attempt in range(4):
            extra=additions(records+pool,shoots,recipe,seed+attempt,probe.exposure)
            if not extra:raise RuntimeError('No uncrowded growth space remains: '+model)
            pool.extend(extra);ratios=measure(len(pool),f'upper_{attempt}')
            if ratios.mean()>=options['gain']:break
        else:raise RuntimeError('Coverage target is unreachable within four candidate passes')
        low=0;high=len(pool);best=(abs(float(ratios.mean())-options['gain']),high,ratios)
        for iteration in range(6):
            count=(low+high)//2;ratios=measure(count,f'search_{iteration}');error=abs(float(ratios.mean())-options['gain'])
            if error<best[0]:best=(error,count,ratios)
            if error<.0075:break
            if ratios.mean()<options['gain']:low=count+1
            else:high=count-1
        if best[0]>.02 or min(best[2])<options['gain']-.04:raise RuntimeError('Coverage tuning missed the requested range')
        selected=records+pool[:best[1]]
        if history[-1]['added']!=best[1]:measure(best[1],'selected')
        final_data=foliage_data(current)
        if not np.array_equal(final_data['origins'][:n],original_data['origins']) or not np.allclose(final_data['scales'][:n],original_data['scales'],atol=1e-6) or not np.array_equal(final_data['forms'][:n],original_data['forms']):raise RuntimeError('Existing leaf geometry moved')
        from mathutils import Euler
        old_rotations=np.array([np.array(Euler(tuple(row)).to_matrix()) for row in original_data['rotations']])
        new_rotations=np.array([np.array(Euler(tuple(row)).to_matrix()) for row in final_data['rotations'][:n]])
        if not np.allclose(old_rotations,new_rotations,atol=1e-6):raise RuntimeError('Existing leaf orientation changed')
        if fingerprint(wood.data)!=wood_hash or fingerprint(twigs.data)!=twig_hash:raise RuntimeError('Existing wood or branchlets changed')
        indices=[[] for _ in shoots]
        for i,record in enumerate(selected):indices[record['shoot']].append(i)
        for i,shoot in enumerate(shoots):shoot.pop('leafStart',None);shoot.pop('leafEnd',None);shoot['leafIndices']=indices[i]
        coverage={'id':model,'baselineSha256':source['sha256'],'codeIdentity':options['coverageCodeIdentity'],'target':options['gain'],'baselineLeaves':n,'leaves':len(selected),'addedLeaves':best[1],
            'ratios':best[2].tolist(),'history':history,'cameras':probe.poses,'measurement':'768x576 Workbench solid-geometry alpha silhouette; four fixed views; unchanged wood included',
            'existingLeavesPreserved':True,'branchletsPreserved':True}
        stats={**source,'revision':'natural-shoots-coverage-v1','leafCount':len(selected),'reductionPercent':100*(1-len(selected)/source['oldLeafCount']),
            'proxyBoundsAfter':[leaf_data(selected)['centers'].min(axis=0).tolist(),leaf_data(selected)['centers'].max(axis=0).tolist()],
            'crowdingAfter':crowding(leaf_data(selected)),'coverage':coverage,'file':str(file.relative_to(output))}
        stats.pop('candidate',None);stats['shoots']=str((directory/'shoots.json').relative_to(output))
        current['foliageRevision']='natural-shoots-coverage-v1';bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(file),compress=True)
        stats['sha256']=hashlib.sha256(file.read_bytes()).hexdigest();write_json(directory/'shoots.json',data);write_json(directory/'model.json',stats)
        summary['models'].append(stats);summary['coverage'].append(coverage);write_json(output/'summary.json',summary)
