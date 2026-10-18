# Applies shared shoot competition to authenticated species references while preserving surviving geometry.
import hashlib
import json
from pathlib import Path
import bpy
import numpy as np
from mathutils import Euler
from common import array,foliage_data,triangles,write_json
from shoot_competition import redundant_shoots,compact_graph,prepare_planes,DEFAULT_POLICY,COVERAGE_POLICY
from competition_coverage import select_removals
from competition_mesh import leaf_subset,wood_subset,subset_digest
from spatial_poses import leaf_prototypes
from releaf import wood_digest


def rebuild(o):
    for model in o['models']:
        species=model.split('/')[0];p=o['profiles'][species];source=Path(o['candidate'])/model;target=Path(o['output'])/model
        meta=json.loads((source/'model.json').read_text());file=source/'enhanced.blend';identity=hashlib.sha256(file.read_bytes()).hexdigest()
        if identity!=meta['sha256'] or identity!=next(r['sha256'] for r in o['previousSources'] if r['id']==model):raise RuntimeError('Competition source identity differs')
        if (target/'enhanced.blend').exists():raise RuntimeError('Preserve existing competition result')
        target.mkdir(parents=True,exist_ok=True);bpy.ops.wm.open_mainfile(filepath=str(file))
        graph=json.loads((source/'architecture.json').read_text());paths=graph['paths']
        for r in paths:r['points']=np.asarray(r['points']);r['radii']=np.asarray(r['radii'])
        foliage=bpy.data.objects[model+' / enhanced leaves'];twigs=bpy.data.objects[model+' / enhanced branchlets'];wood=bpy.data.objects[model+' / enhanced wood']
        original_count=meta['leafCount'];data=foliage_data(foliage);shoots=array(foliage.data.attributes['shoot_id'].data,'value',dtype=np.int32)
        centers=array(foliage.data.attributes['blade_center'].data,'vector',3);matrices=np.array([np.array(Euler(tuple(r)).to_matrix()) for r in data['rotations']])*data['scales'][:,None,:]
        already=bool(meta.get('shootCompetitionReview') or (meta.get('foliageBalance') or {}).get('shootCompetition'))
        prepare_planes(paths,graph['shoots']);_,decisions=redundant_shoots(paths,graph['shoots'],p['leafLength'],p.get('shootCompetition',DEFAULT_POLICY)) if not already else (set(),[])
        removed,accepted,coverage=select_removals(decisions,shoots,centers,matrices,p['leafLength'],COVERAGE_POLICY) if decisions else (set(),[],{'projectedRetention':[1.]*5,'policy':COVERAGE_POLICY})
        ids=np.flatnonzero(~np.isin(shoots,list(removed)));mapping={old:new for new,old in enumerate(i for i in range(len(paths)) if i not in removed)}
        if graph.get('studyRoot') in removed:raise RuntimeError('Diagnostic fan root would be removed')
        roots={}
        for row in accepted:
            root=paths[row['path']]['parent']
            while paths[root].get('shootDepth',0)>0:root=paths[root]['parent']
            roots[root]=roots.get(root,0)+1
        subtree_leaves=np.bincount(shoots[ids],minlength=len(paths))
        for i in range(len(paths)-1,-1,-1):
            if paths[i]['parent']>=0:subtree_leaves[paths[i]['parent']]+=subtree_leaves[i]
        study_root=max((r for r in roots if subtree_leaves[r]>=4),key=roots.get,default=graph.get('studyRoot'))
        twigs.data=wood_subset(twigs.data,paths,removed,mapping,p['habit']=='shrub');foliage.data=leaf_subset(foliage.data,ids,mapping)
        graph=compact_graph(graph,removed);centers=centers[ids]
        for key in ['preservedWoodMeshDigests','preservedLeafPlacementDigest','retainedFoliageDigest']:meta.pop(key,None)
        meta['preservedTrunkMeshDigest']=wood_digest(wood.data);meta['preservedLeafTemplateDigests']=[wood_digest(obj.data) for obj in leaf_prototypes(foliage)]
        if species=='silver_linden':
            from linden_growth import crown_profile
            meta['crownProfile']=crown_profile(data['origins'][ids],meta['dimensions'])
        elif species in ['american_elm','northern_red_oak']:
            from oak_growth import crown_profile
            meta['crownProfile']=crown_profile(centers)
        elif species=='london_plane':
            from crown_spread import crown_metrics
            metrics=crown_metrics(centers,p['crownSpreadRule']['azimuthSamples']);meta['crownSpread']['foliage']['after']={k:v.tolist() if isinstance(v,np.ndarray) else v for k,v in metrics.items()}
        proof={'version':1,'sourceSha256':identity,'sourceRevision':meta['revision'],'alreadyApplied':already,'candidateShoots':len(decisions),'removedShoots':len(removed),
               'removedLeaves':original_count-len(ids),'decisions':accepted,'coverageGuard':coverage,'retainedLeafDigest':subset_digest(foliage.data,True),'retainedTwigDigest':subset_digest(twigs.data),
               'survivingGeometryPreserved':True,'policy':p.get('shootCompetition',DEFAULT_POLICY),
               'studyRootPrevious':study_root,'studyRootEnhanced':mapping[study_root] if study_root is not None else None}
        meta.update(shootCompetitionReview=proof,previousSha256=identity,previousLeafCount=original_count,leafCount=len(ids),branchPaths=len(graph['paths']),
                    branchletTriangles=triangles(twigs.data),instancedLeafTriangles=int(np.sum(np.asarray(meta['leafTemplateTriangles'])[data['forms'][ids]])),codeIdentity=o['codeIdentity'])
        output=target/'enhanced.blend';bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(output),compress=True);meta['sha256']=hashlib.sha256(output.read_bytes()).hexdigest()
        write_json(target/'model.json',meta);write_json(target/'architecture.json',{**graph,'paths':[{**r,'points':r['points'].tolist(),'radii':r['radii'].tolist()} for r in graph['paths']]})
        print('[Competition] '+model+' removed '+str(len(removed))+' shoots / '+str(proof['removedLeaves'])+' leaves; preserved remaining geometry',flush=True)


def audit(model,meta,folder,previous):
    proof=meta['shootCompetitionReview'];foliage=bpy.data.objects[model+' / enhanced leaves'];twig=bpy.data.objects[model+' / enhanced branchlets']
    graph=json.loads((folder/'architecture.json').read_text());shoots=array(foliage.data.attributes['shoot_id'].data,'value',dtype=np.int32)
    valid=proof['sourceSha256']==previous['sha256'] and proof['survivingGeometryPreserved']
    valid&=subset_digest(foliage.data,True)==proof['retainedLeafDigest'] and subset_digest(twig.data)==proof['retainedTwigDigest']
    valid&=len(foliage.data.vertices)==meta['leafCount'] and all(int(i) in {s['id'] for s in graph['shoots']} for i in np.unique(shoots))
    valid&=min(proof['coverageGuard']['projectedRetention'])>=COVERAGE_POLICY['minimumProjectedRetention']
    source=Path(previous['file']);original_graph=json.loads((source.parent/'architecture.json').read_text())
    for r in original_graph['paths']:r['points']=np.asarray(r['points']);r['radii']=np.asarray(r['radii'])
    removed={r['path'] for r in proof['decisions']};mapping={old:new for new,old in enumerate(i for i in range(len(original_graph['paths'])) if i not in removed)}
    with bpy.data.libraries.load(str(source),link=False) as (_,loaded):loaded.objects=[model+' / enhanced '+r for r in ['leaves','branchlets','wood']]
    original=loaded.objects;old_ids=array(original[0].data.attributes['shoot_id'].data,'value',dtype=np.int32);kept=np.flatnonzero(~np.isin(old_ids,list(removed)))
    guard=proof['coverageGuard']
    if 'removedLeafAreaFraction' in guard:
        scales=foliage_data(original[0])['scales'];areas=scales[:,0]*scales[:,1]
        removed_area=float(areas[np.isin(old_ids,list(removed))].sum()/areas.sum())
        valid&=abs(removed_area-guard['removedLeafAreaFraction'])<1e-7 and removed_area<=guard['policy']['maximumRemovedAreaFraction']+1e-8
    expected_leaf=leaf_subset(original[0].data,kept,mapping);expected_twig=wood_subset(original[1].data,original_graph['paths'],removed,mapping,meta['dimensions']['habit']=='shrub')
    valid&=subset_digest(expected_leaf,True)==subset_digest(foliage.data,True) and subset_digest(expected_twig)==subset_digest(twig.data)
    valid&=wood_digest(original[2].data)==wood_digest(bpy.data.objects[model+' / enhanced wood'].data)
    valid&=[wood_digest(obj.data) for obj in leaf_prototypes(original[0])]==[wood_digest(obj.data) for obj in leaf_prototypes(foliage)]
    valid&=all(np.array_equal(original_graph['paths'][old]['points'],graph['paths'][new]['points']) and np.array_equal(original_graph['paths'][old]['radii'],graph['paths'][new]['radii']) for old,new in mapping.items())
    for obj in original:bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.meshes.remove(expected_leaf);bpy.data.meshes.remove(expected_twig)
    return {'role':'competition pruning with surviving geometry preserved','removedShoots':proof['removedShoots'],'removedLeaves':proof['removedLeaves'],'passed':bool(valid)}
