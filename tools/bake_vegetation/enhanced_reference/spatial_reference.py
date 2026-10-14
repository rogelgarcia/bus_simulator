# Rebuilds the three London plane references with rising spatial forks and genuinely curved leaf blades.
import hashlib
import json
from pathlib import Path
import bpy
import numpy as np
from mathutils import Euler
from common import array,triangles,write_json,foliage_data
from spatial_growth import spatial_scaffolds
from plane_foliage import form_parameters
from leaf_curvature import blade_height
from foliage import templates,instances
from surface import material
from wood import build_wood


def spatial_reference(o):
    for model in o['models']:
        species,variant=model.split('/');p=o['profiles'][species];source=Path(o['candidate'])/model;target=Path(o['output'])/model
        meta=json.loads((source/'model.json').read_text());file=source/'enhanced.blend';identity=hashlib.sha256(file.read_bytes()).hexdigest()
        if species!='london_plane' or meta['revision']!='enhanced-plane-organic-foliage-v13' or identity!=meta['sha256']:raise RuntimeError('Shape phase requires authenticated v13 London plane')
        if identity!=next(r['sha256'] for r in o['previousSources'] if r['id']==model):raise RuntimeError('Shape source differs from previous collection')
        if (target/'enhanced.blend').exists():raise RuntimeError('Preserve existing spatial candidate')
        target.mkdir(parents=True,exist_ok=True);bpy.ops.wm.open_mainfile(filepath=str(file))
        graph=json.loads((source/'architecture.json').read_text());paths=graph['paths']
        for path in paths:path['points']=np.asarray(path['points']);path['radii']=np.asarray(path['radii'])
        preserved={i:r['points'].copy() for i,r in enumerate(paths) if i==0 or r.get('root',False)}
        transforms,proof=spatial_scaffolds(paths,meta['dimensions']['growth']['scaffoldLaunchPaths'],int(variant[-1]))
        for i,points in preserved.items():np.testing.assert_array_equal(paths[i]['points'],points)
        old=bpy.data.objects[model+' / enhanced leaves'];data=foliage_data(old);mesh=old.data
        shoots=array(mesh.attributes['shoot_id'].data,'value',dtype=np.int32);nodes=array(mesh.attributes['node_id'].data,'value',dtype=np.int32)
        groups=array(mesh.attributes['spray_id'].data,'value',dtype=np.int32);tints=array(mesh.attributes['leaf_tint'].data,'color',4)
        matrices=np.array([np.array(Euler(tuple(r)).to_matrix()) for r in data['rotations']])*data['scales'][:,None,:]
        leaves=[]
        for i,shoot in enumerate(shoots):
            origin=data['origins'][i];matrix=matrices[i];form=int(data['forms'][i])
            if int(shoot) in transforms:
                turn,shift=transforms[int(shoot)];origin=turn@origin+shift;matrix=turn@matrix
            shape=form_parameters(form,True);center=np.array([0,shape['petiole']+.48,float(blade_height([[0,.48]],form)[0])])
            leaves.append({'shoot':int(shoot),'node':int(nodes[i]),'group':int(groups[i]),'form':form,'tint':tints[i,:3],
                           'origin':origin,'matrix':matrix,'bladeCenter':origin+matrix@center})
        front,leafmeta=material(o,species,'leaf_front');back,_=material(o,species,'leaf_back')
        forms=templates(o,species,[front,back],leafmeta,detailed_petioles=True,spread_petioles=True,sculpted_blades=True)
        bpy.data.objects.remove(old,do_unlink=True);foliage=instances(model,leaves,forms)
        bark=bpy.data.objects[model+' / enhanced wood'].data.materials[0]
        barkmeta=json.loads((Path(o['root'])/'assets/public/pbr/tree_ai_london_plane_bark/material.json').read_text())
        for role in ['wood','branchlets']:bpy.data.objects.remove(bpy.data.objects[model+' / enhanced '+role],do_unlink=True)
        wood,twigs=build_wood(model,paths,p,bark,barkmeta,np.random.default_rng(p['seed']+int(variant[-1])*191))
        revision='enhanced-plane-spatial-growth-v14'
        for obj in [wood,twigs,foliage]:obj['species']=species;obj['variant']=variant;obj['referenceRevision']=revision
        centers=np.array([leaf['bladeCenter'] for leaf in leaves]);counts=[triangles(m) for m in forms]
        root=graph['studyRoot'];study=meta['sprayStudyPose'].copy()
        if root in transforms:
            turn,shift=transforms[root];study['target']=(turn@study['target']+shift).tolist();study['offset']=(turn@study['offset']).tolist()
        study['span']*=1.08
        meta.pop('preservedWoodMeshDigests',None);meta.pop('preservedTrunkMeshDigest',None)
        output=target/'enhanced.blend';bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(output),compress=True)
        meta.update(revision=revision,previousSha256=identity,codeIdentity=o['codeIdentity'],spatialGrowth=proof,
                    preservedRootPaths=len(preserved),movedLeaves=sum(int(s) in transforms for s in shoots),sprayStudyPose=study,
                    leafCount=len(leaves),previousLeafCount=len(leaves),leafTemplateTriangles=counts,instancedLeafTriangles=sum(counts[l['form']] for l in leaves),
                    bladeShape=[json.loads(m['bladeShape']) for m in forms],woodTriangles=triangles(wood.data),branchletTriangles=triangles(twigs.data),
                    bounds={'min':np.minimum(centers.min(axis=0)-p['leafLength'],[0,0,0]).tolist(),'max':(centers.max(axis=0)+p['leafLength']).tolist()},
                    boleMinimumRadiusRatios=list(wood['boleMinimumRadiusRatios']),sha256=hashlib.sha256(output.read_bytes()).hexdigest())
        meta['barkProjection']={'method':wood['barkProjectionMethod'],'maximumDistance':wood['barkProjectionMaximumDistance']}
        write_json(target/'model.json',meta)
        write_json(target/'architecture.json',{**graph,'paths':[{**r,'points':r['points'].tolist(),'radii':r['radii'].tolist()} for r in paths]})
        print('[Enhanced] Spatial growth '+model+'; six rising scaffold families, '+str(len(leaves))+' curved leaves',flush=True)
