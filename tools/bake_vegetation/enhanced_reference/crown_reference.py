# Rebuilds crown architecture through species-wide growth rules while keeping the accepted leaf prototypes.
import hashlib
import json
from pathlib import Path
import bpy
import numpy as np
from mathutils import Euler,Matrix
from common import array,triangles,write_json,foliage_data
from crown_spread import broaden_crown,crown_metrics
from spatial_poses import leaf_prototypes
from releaf import wood_digest
from wood import build_wood


def crown_reference(o):
    for model in o['models']:
        species,variant=model.split('/');p=o['profiles'][species];source=Path(o['candidate'])/model;target=Path(o['output'])/model
        meta=json.loads((source/'model.json').read_text());file=source/'enhanced.blend';identity=hashlib.sha256(file.read_bytes()).hexdigest()
        if species!='london_plane' or meta['revision']!='enhanced-plane-open-leaves-v15' or identity!=meta['sha256']:raise RuntimeError('Crown phase requires authenticated v15 London plane')
        if identity!=next(r['sha256'] for r in o['previousSources'] if r['id']==model):raise RuntimeError('Crown source differs from previous collection')
        if (target/'enhanced.blend').exists():raise RuntimeError('Preserve existing crown candidate')
        target.mkdir(parents=True,exist_ok=True);bpy.ops.wm.open_mainfile(filepath=str(file))
        graph=json.loads((source/'architecture.json').read_text());paths=graph['paths']
        for path in paths:path['points']=np.asarray(path['points']);path['radii']=np.asarray(path['radii'])
        retained={i:r['points'].copy() for i,r in enumerate(paths) if i==0 or r.get('root')};radii=[r['radii'].copy() for r in paths]
        transforms,proof=broaden_crown(paths,p['crownSpreadRule'])
        for i,points in retained.items():np.testing.assert_array_equal(paths[i]['points'],points)
        for old,r in zip(radii,paths):np.testing.assert_array_equal(old,r['radii'])
        anchor_error=max(np.linalg.norm(r['points'][0]-paths[r['parent']]['points'][r['parentNode']]) for r in paths if r['parent']>=0 and 'parentNode' in r)
        if anchor_error>1e-8:raise RuntimeError('Crown growth detached a branch')
        foliage=bpy.data.objects[model+' / enhanced leaves'];mesh=foliage.data;data=foliage_data(foliage)
        templates=leaf_prototypes(foliage);template_digests=[wood_digest(obj.data) for obj in templates]
        shoots=array(mesh.attributes['shoot_id'].data,'value',dtype=np.int32);centers=array(mesh.attributes['blade_center'].data,'vector',3)
        before_foliage=crown_metrics(centers,p['crownSpreadRule']['azimuthSamples'])
        origins=data['origins'].copy();rotations=data['rotations'].copy()
        for i,shoot in enumerate(shoots):
            if int(shoot) not in transforms:continue
            turn,shift=transforms[int(shoot)];origins[i]=turn@origins[i]+shift;centers[i]=turn@centers[i]+shift
            rotations[i]=Matrix((turn@np.array(Euler(tuple(rotations[i])).to_matrix())).tolist()).to_euler()
        mesh.vertices.foreach_set('co',origins.ravel());mesh.attributes['leaf_rotation'].data.foreach_set('vector',rotations.ravel());mesh.attributes['blade_center'].data.foreach_set('vector',centers.ravel());mesh.update()
        after_foliage=crown_metrics(centers,p['crownSpreadRule']['azimuthSamples'])
        if after_foliage['minimumWidth']<proof['targetMinimumWidth']*.94:raise RuntimeError('Actual leaf crown does not fill the widened branch envelope')
        proof['foliage']={state:{k:(v.tolist() if isinstance(v,np.ndarray) else v) for k,v in measure.items()} for state,measure in [('before',before_foliage),('after',after_foliage)]}
        if template_digests!=[wood_digest(obj.data) for obj in templates]:raise RuntimeError('Crown growth changed leaf shape')
        bark=bpy.data.objects[model+' / enhanced wood'].data.materials[0];barkmeta=json.loads((Path(o['root'])/'assets/public/pbr/tree_ai_london_plane_bark/material.json').read_text())
        for role in ['wood','branchlets']:bpy.data.objects.remove(bpy.data.objects[model+' / enhanced '+role],do_unlink=True)
        wood,twigs=build_wood(model,paths,p,bark,barkmeta,np.random.default_rng(p['seed']+int(variant[-1])*191))
        revision='enhanced-plane-balanced-crown-v16'
        for obj in [wood,twigs,foliage]:obj['referenceRevision']=revision;obj['species']=species;obj['variant']=variant
        root=graph['studyRoot'];study=meta['sprayStudyPose'].copy()
        if root in transforms:
            turn,shift=transforms[root];study['target']=(turn@study['target']+shift).tolist();study['offset']=(turn@study['offset']).tolist()
        for key in ['preservedWoodMeshDigests','preservedTrunkMeshDigest','preservedLeafPlacementDigest']:meta.pop(key,None)
        output=target/'enhanced.blend';bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(output),compress=True)
        meta.update(revision=revision,previousSha256=identity,codeIdentity=o['codeIdentity'],crownSpread=proof,
                    preservedLeafTemplateDigests=template_digests,preservedRootPaths=len(retained),maximumBranchAnchorDistance=float(anchor_error),
                    sprayStudyPose=study,previousLeafCount=meta['leafCount'],woodTriangles=triangles(wood.data),branchletTriangles=triangles(twigs.data),
                    bounds={'min':np.minimum(centers.min(axis=0)-p['leafLength'],[0,0,0]).tolist(),'max':(centers.max(axis=0)+p['leafLength']).tolist()},
                    boleMinimumRadiusRatios=list(wood['boleMinimumRadiusRatios']),sha256=hashlib.sha256(output.read_bytes()).hexdigest())
        meta['barkProjection']={'method':wood['barkProjectionMethod'],'maximumDistance':wood['barkProjectionMaximumDistance']}
        write_json(target/'model.json',meta);write_json(target/'architecture.json',{**graph,'paths':[{**r,'points':r['points'].tolist(),'radii':r['radii'].tolist()} for r in paths]})
        print('[Enhanced] Balanced crown '+model+'; width '+str(proof['before']['minimumWidth'])+' to '+str(proof['after']['minimumWidth']),flush=True)
