# Rebuilds marked London plane limbs while retaining the accepted leaves and the first specimen.
import hashlib
import json
import shutil
from pathlib import Path
import bpy
import numpy as np
from mathutils import Euler,Matrix
from common import array,write_json,triangles
from plane_posture import lift_scaffold
from wood import build_wood


def posture(o):
    for model in o['models']:
        species,variant=model.split('/');p=o['profiles'][species];source=Path(o['candidate'])/model;target=Path(o['output'])/model
        meta=json.loads((source/'model.json').read_text());file=source/'enhanced.blend';identity=hashlib.sha256(file.read_bytes()).hexdigest()
        if species!='london_plane' or meta['revision']!='enhanced-plane-foliage-v9' or identity!=meta['sha256']:raise RuntimeError('Posture phase requires authenticated v9 London plane')
        if identity!=next(r['sha256'] for r in o['previousSources'] if r['id']==model):raise RuntimeError('Posture source differs from previous collection')
        if (target/'enhanced.blend').exists():raise RuntimeError('Preserve existing posture candidate')
        target.mkdir(parents=True,exist_ok=True)
        if variant=='mature_01':
            for name in ['enhanced.blend','architecture.json','model.json']:shutil.copyfile(source/name,target/name)
            print('[Enhanced] Preserved accepted first specimen byte-for-byte',flush=True);continue
        bpy.ops.wm.open_mainfile(filepath=str(file));data=json.loads((source/'architecture.json').read_text());paths=data['paths']
        for path in paths:path['points']=np.asarray(path['points']);path['radii']=np.asarray(path['radii'])
        changed=lift_scaffold(paths,meta['dimensions']['growth']['scaffoldLaunchPaths'][0]);matrix=changed['rotation'];pivot=changed['pivot']
        foliage=bpy.data.objects[model+' / enhanced leaves'];mesh=foliage.data;shoots=array(mesh.attributes['shoot_id'].data,'value',dtype=np.int32)
        selected=np.isin(shoots,changed['paths']);origins=array(mesh.vertices,'co',3);centers=array(mesh.attributes['blade_center'].data,'vector',3)
        rotations=array(mesh.attributes['leaf_rotation'].data,'vector',3)
        origins[selected]=pivot+(origins[selected]-pivot)@matrix.T;centers[selected]=pivot+(centers[selected]-pivot)@matrix.T
        for i in np.flatnonzero(selected):rotations[i]=Matrix((matrix@np.array(Euler(tuple(rotations[i])).to_matrix())).tolist()).to_euler()
        mesh.vertices.foreach_set('co',origins.ravel());mesh.attributes['blade_center'].data.foreach_set('vector',centers.ravel());mesh.attributes['leaf_rotation'].data.foreach_set('vector',rotations.ravel());mesh.update()
        old=bpy.data.objects[model+' / enhanced wood'];bark=old.data.materials[0]
        barkmeta=json.loads((Path(o['root'])/'assets/public/pbr/tree_ai_london_plane_bark/material.json').read_text())
        for role in ['wood','branchlets']:bpy.data.objects.remove(bpy.data.objects[model+' / enhanced '+role],do_unlink=True)
        wood,twigs=build_wood(model,paths,p,bark,barkmeta,np.random.default_rng(p['seed']+int(variant[-1])*191))
        revision='enhanced-plane-posture-v10'
        for obj in [wood,twigs,foliage]:obj['species']=species;obj['variant']=variant;obj['referenceRevision']=revision
        output=target/'enhanced.blend';bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(output),compress=True)
        meta.pop('preservedWoodMeshDigests',None)
        meta.update(revision=revision,previousSha256=identity,codeIdentity=o['codeIdentity'],woodTriangles=triangles(wood.data),branchletTriangles=triangles(twigs.data),
                    bounds={'min':np.minimum(centers.min(axis=0)-p['leafLength'],[0,0,0]).tolist(),'max':(centers.max(axis=0)+p['leafLength']).tolist()},
                    postureCorrection={k:(v.tolist() if isinstance(v,np.ndarray) else v) for k,v in changed.items()},movedLeaves=int(selected.sum()),
                    boleMinimumRadiusRatios=list(wood['boleMinimumRadiusRatios']),sha256=hashlib.sha256(output.read_bytes()).hexdigest())
        meta['barkProjection']={'method':wood['barkProjectionMethod'],'maximumDistance':wood['barkProjectionMaximumDistance']}
        write_json(target/'model.json',meta);write_json(target/'architecture.json',{'paths':[{**path,'points':path['points'].tolist(),'radii':path['radii'].tolist()} for path in paths],'shoots':data['shoots']})
        print('[Enhanced] Lifted '+model+' scaffold to 38 degrees; retained all '+str(meta['leafCount'])+' leaves',flush=True)
