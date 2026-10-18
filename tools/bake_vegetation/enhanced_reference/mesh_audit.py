# Audits saved final mesh coordinates independently from their source growth curves.
import hashlib
import json
from pathlib import Path
import bpy
import numpy as np
from common import array,write_json


def audit_objects(model,meta):
    roles=[]
    for role in ['wood','branchlets']:
        obj=bpy.data.objects[model+' / enhanced '+role];co=array(obj.data.vertices,'co',3)
        edges=array(obj.data.edges,'vertices',2,np.int32);length=np.linalg.norm(co[edges[:,0]]-co[edges[:,1]],axis=1)
        outside=np.flatnonzero((np.abs(co[:,:2])>meta['dimensions']['radiusTarget']*3).any(axis=1)|(co[:,2]<-3)|(co[:,2]>meta['dimensions']['heightTarget']*1.7)|~np.isfinite(co).all(axis=1))
        maximum=float(length.max());limit=.25 if role=='wood' else max(1,meta['dimensions']['radiusTarget']*.5)
        roles.append({'role':role,'min':co.min(axis=0).tolist(),'max':co.max(axis=0).tolist(),'maximumEdge':maximum,'edgeLimit':limit,'outlierCount':len(outside),'outlierSample':[{'index':int(i),'co':co[i].tolist()} for i in outside[:8]],'passed':bool(len(outside)==0 and np.isfinite(maximum) and maximum<limit)})
        if 'preservedWoodMeshDigests' in meta:
            from releaf import wood_digest
            matches=wood_digest(obj.data)==meta['preservedWoodMeshDigests'][len(roles)-1]
            roles[-1]['preservedSourceMeshMatches']=matches;roles[-1]['passed']&=matches
        if role=='wood' and 'preservedTrunkMeshDigest' in meta:
            from releaf import wood_digest
            matches=wood_digest(obj.data)==meta['preservedTrunkMeshDigest']
            roles[-1]['preservedSourceMeshMatches']=matches;roles[-1]['passed']&=matches
    if meta['revision']=='enhanced-arrowwood-spaced-pairs-v2':
        mesh=bpy.data.objects[model+' / enhanced leaves'].data
        origins=array(mesh.vertices,'co',3);centers=array(mesh.attributes['blade_center'].data,'vector',3)
        shoots=array(mesh.attributes['shoot_id'].data,'value',dtype=np.int32);nodes=array(mesh.attributes['node_id'].data,'value',dtype=np.int32)
        keys=np.column_stack([shoots,nodes]);_,counts=np.unique(keys,axis=0,return_counts=True)
        paired=len(origins)%2==0 and np.array_equal(keys[::2],keys[1::2]) and np.allclose(origins[::2],origins[1::2],atol=1e-7)
        roles.append({'role':'opposite leaf pairs','pairs':len(counts),'passed':bool(paired and np.all(counts==2) and len(origins)==meta['leafCount'] and np.isfinite(centers).all())})
    if meta['revision'] in ['enhanced-oak-open-crown-v4','enhanced-oak-volumetric-forks-v5','enhanced-oak-spaced-shoots-v6','enhanced-oak-ascending-fill-v7','enhanced-oak-fork-shoulders-v8','enhanced-elm-arching-growth-v2','enhanced-elm-spreading-v3','enhanced-elm-rounded-v4','enhanced-elm-clustered-v5','enhanced-elm-clean-foliage-v6','enhanced-elm-balanced-foliage-v7','enhanced-elm-spaced-fans-v8','enhanced-elm-branch-domes-v9','enhanced-elm-filled-fans-v10']:
        from oak_growth import crown_profile
        foliage=bpy.data.objects[model+' / enhanced leaves']
        proof=crown_profile(array(foliage.data.attributes['blade_center'].data,'vector',3))
        matches=all(abs(proof[k]-meta['crownProfile'][k])<1e-5 for k in proof)
        roles.append({'role':'spatial crown',**proof,'passed':matches and proof['widthAspect']>=.70 and proof['widthToHeight']>=(.65 if meta['revision'] in ['enhanced-elm-arching-growth-v2','enhanced-elm-spreading-v3','enhanced-elm-rounded-v4','enhanced-elm-clustered-v5','enhanced-elm-clean-foliage-v6','enhanced-elm-balanced-foliage-v7','enhanced-elm-spaced-fans-v8','enhanced-elm-branch-domes-v9','enhanced-elm-filled-fans-v10'] else .85) and len(foliage.data.vertices)==meta['leafCount']})
        co=array(bpy.data.objects[model+' / enhanced wood'].data.vertices,'co',3);ratios=[]
        for section in meta['boleSections']:
            ring=co[abs(co[:,2]-section['height'])<section['slab']]
            ratios.append(float(np.quantile(np.linalg.norm(ring[:,:2]-section['center'],axis=1),.05)/section['radius']) if len(ring)>12 else 0.)
        roles.append({'role':'continuous bole','minimumRadiusRatio':min(ratios),'passed':min(ratios)>=.88})
        if meta.get('forkSurface'):
            mesh=bpy.data.objects[model+' / enhanced wood'].data;weights=array(mesh.attributes['fork_chart_blend'].data,'value',1)
            uv=array(mesh.uv_layers['ForkAlternate'].data,'uv',2)
            roles.append({'role':'local fork bark charts','blendedFaces':int(np.count_nonzero(weights)),
                          'passed':bool(np.isfinite(uv).all() and weights.min()>=0 and weights.max()<=.501 and np.count_nonzero(weights)==meta['forkSurface']['blendedFaces'])})
    if meta['revision'] in ['enhanced-linden-conical-v4','enhanced-linden-spaced-sprays-v5']:
        from linden_growth import crown_profile
        from wood_continuity import inspect_leader
        roles.append({'role':'solid central leader',**inspect_leader(bpy.data.objects[model+' / enhanced wood'],meta['leaderSections'])})
        co=array(bpy.data.objects[model+' / enhanced wood'].data.vertices,'co',3);ratios=[]
        for section in meta['boleSections']:
            ring=co[abs(co[:,2]-section['height'])<section['slab']]
            ratios.append(float(np.quantile(np.linalg.norm(ring[:,:2]-section['center'],axis=1),.05)/section['radius']) if len(ring)>12 else 0.)
        roles.append({'role':'continuous bole','minimumRadiusRatio':min(ratios),'sections':len(ratios),'passed':min(ratios)>=.88})
        foliage=bpy.data.objects[model+' / enhanced leaves'];proof=crown_profile(array(foliage.data.vertices,'co',3),meta['dimensions'])
        matches=all(abs(proof[k]-meta['crownProfile'][k])<1e-5 for k in proof)
        roles.append({'role':'tapered linden crown',**proof,'passed':matches and proof['upperToLowerRadius']<.80 and proof['middleToLowerRadius']<1.10 and len(foliage.data.vertices)==meta['leafCount']})
        if meta['revision']=='enhanced-linden-spaced-sprays-v5':
            centers=array(foliage.data.attributes['blade_center'].data,'vector',3)
            shoots=array(foliage.data.attributes['shoot_id'].data,'value',dtype=np.int32)
            nodes=array(foliage.data.attributes['node_id'].data,'value',dtype=np.int32)
            unique=len(np.unique(np.column_stack([shoots,nodes]),axis=0))==len(centers)
            spacing=meta['crowding'];twigs=spacing['branchletSpacing']
            roles.append({'role':'spaced alternate foliage','uniqueNodes':unique,'leafCount':len(centers),
                          'passed':bool(unique and np.isfinite(centers).all() and spacing['minimumAcceptedProxyClearance']>=spacing['minimumRequiredProxyClearance'] and twigs['minimumSampleClearance']>=twigs['requiredSampleClearance'])})
        if 'retainedFoliageDigest' in meta:
            from refine import digest
            from releaf import wood_digest
            from spatial_poses import leaf_prototypes
            roles.append({'role':'preserved foliage','passed':digest(foliage.data)==meta['retainedFoliageDigest'] and [wood_digest(obj.data) for obj in leaf_prototypes(foliage)]==meta['retainedLeafPrototypeDigests']})
    if meta['revision']=='enhanced-elm-clean-foliage-v6':
        from spatial_poses import leaf_prototypes
        from releaf import wood_digest
        proof=meta['foliageCleanup'];policy=proof['policy']
        passed=proof['withinSprayCrowdingAfter']<proof['withinSprayCrowdingBefore'] and proof['retainedOccupiedVolumeFraction']==1
        passed&=all(r['retainedFraction']>=policy['minimumProjectedRetention'] for r in proof['projectedCoverage'])
        if 'preservedLeafTemplateDigests' in meta:passed&=[wood_digest(obj.data) for obj in leaf_prototypes(bpy.data.objects[model+' / enhanced leaves'])]==meta['preservedLeafTemplateDigests']
        roles.append({'role':'conservative foliage cleanup','passed':bool(passed),'leafCount':meta['leafCount']})
    if meta['revision'] in ['enhanced-elm-balanced-foliage-v7','enhanced-elm-spaced-fans-v8','enhanced-elm-branch-domes-v9','enhanced-elm-filled-fans-v10']:
        from spatial_poses import leaf_prototypes
        from releaf import wood_digest
        foliage=bpy.data.objects[model+' / enhanced leaves'];proof=meta['foliageBalance']
        shoots=array(foliage.data.attributes['shoot_id'].data,'value',dtype=np.int32);nodes=array(foliage.data.attributes['node_id'].data,'value',dtype=np.int32)
        passed=len(np.unique(np.column_stack([shoots,nodes]),axis=0))==meta['leafCount']
        passed&=meta['crowding']['minimumAcceptedProxyClearance']>=meta['crowding']['minimumRequiredProxyClearance'] and proof['clusters']==15
        if 'preservedLeafTemplateDigests' in meta:passed&=[wood_digest(obj.data) for obj in leaf_prototypes(foliage)]==meta['preservedLeafTemplateDigests']
        roles.append({'role':'balanced cluster foliage','passed':bool(passed),'leafCount':meta['leafCount']})
        if meta['revision'] in ['enhanced-elm-spaced-fans-v8','enhanced-elm-branch-domes-v9','enhanced-elm-filled-fans-v10']:
            from mathutils import Euler
            from common import foliage_data
            from spray_space import measure_sprays
            data=foliage_data(foliage);spacing=meta['crowding']
            matrices=np.array([np.array(Euler(tuple(r)).to_matrix()) for r in data['rotations']])*data['scales'][:,None,:]
            groups=array(foliage.data.attributes['spray_id'].data,'value',dtype=np.int32)
            centers=array(foliage.data.attributes['blade_center'].data,'vector',3)
            proof=measure_sprays(centers,matrices,groups,{int(k):v for k,v in spacing['sprayPlanes'].items()},spacing['exclusionHalfAxes'][:2],spacing['minimumRequiredSprayClearance'])
            roles.append({'role':'projected fan spacing',**proof,'passed':proof['pairsBelowMinimum']==0})
    crown=meta['revision']=='enhanced-plane-balanced-crown-v16'
    opened=meta['revision']=='enhanced-plane-open-leaves-v15' or crown
    if meta['revision']=='enhanced-plane-spatial-growth-v14' or opened:
        from spatial_poses import leaf_prototypes
        from leaf_curvature import blade_shape_metrics
        for i,obj in enumerate(leaf_prototypes(bpy.data.objects[model+' / enhanced leaves'])):
            proof=blade_shape_metrics(array(obj.data.vertices,'co',3)[:1281])
            matches=all(abs(proof[k]-meta['bladeShape'][i][k])<1e-6 for k in proof)
            passed=matches and proof['bestPlaneRmsRatio']>(.008 if opened else .02)
            if opened:
                from open_leaf_reference import retained_blade_digest,placement_digest,upper_face_metrics
                surface=upper_face_metrics(obj.data)
                passed&=retained_blade_digest(obj.data)==meta['preservedBladeDigests'][i]
                passed&=proof['depthRatio']<meta['previousBladeShape'][i]['depthRatio']*.40 and surface['minimumUpperNormalZ']>0 and surface['areaWeightedUpperNormalZ']>.94
                proof.update(surface)
            if crown:
                from releaf import wood_digest
                passed&=wood_digest(obj.data)==meta['preservedLeafTemplateDigests'][i]
            roles.append({'role':'leaf '+str(i),**proof,'passed':bool(passed)})
        if opened and not crown:roles.append({'role':'leaf placements','passed':placement_digest(bpy.data.objects[model+' / enhanced leaves'].data)==meta['preservedLeafPlacementDigest']})
        if crown:
            from crown_spread import crown_metrics
            foliage=bpy.data.objects[model+' / enhanced leaves'];actual=crown_metrics(array(foliage.data.attributes['blade_center'].data,'vector',3),meta['crownSpread']['policy']['azimuthSamples'])
            matches=abs(actual['minimumWidth']-meta['crownSpread']['foliage']['after']['minimumWidth'])<1e-5
            roles.append({'role':'crown breadth','minimumWidth':actual['minimumWidth'],'passed':matches and actual['minimumWidth']>=meta['crownSpread']['targetMinimumWidth']*.94 and len(foliage.data.vertices)==meta['leafCount']})
    return {'id':model,'sha256':meta['sha256'],'roles':roles,'passed':all(r['passed'] for r in roles)}


def inspect(o):
    rows=[]
    for model in o['models']:
        folder=Path(o['candidate'])/model;meta=json.loads((folder/'model.json').read_text());file=folder/'enhanced.blend'
        if hashlib.sha256(file.read_bytes()).hexdigest()!=meta['sha256']:raise RuntimeError('Candidate identity differs')
        bpy.ops.wm.open_mainfile(filepath=str(file));rows.append(audit_objects(model,meta))
        if meta['revision'].startswith('enhanced-elm-growth-core-v2-study-'):
            from growth_v2.audit import inspect as inspect_growth
            proof=inspect_growth(model,meta,folder)
            rows[-1]['roles'].append(proof);rows[-1]['passed']&=proof['passed']
        if meta['revision'] in ['enhanced-elm-branch-domes-v9','enhanced-elm-filled-fans-v10']:
            from elm_dome_audit import inspect as inspect_dome
            proof=inspect_dome(bpy.data.objects[model+' / enhanced leaves'],meta,folder)
            rows[-1]['roles'].append(proof);rows[-1]['passed']&=proof['passed']
        if meta.get('shootCompetitionReview'):
            from competition_reference import audit as audit_competition
            proof=audit_competition(model,meta,folder,next(row for row in o['previousSources'] if row['id']==model))
            rows[-1]['roles'].append(proof);rows[-1]['passed']&=proof['passed']
        elif meta['revision']=='enhanced-oak-fork-shoulders-v8':
            from oak_surface_audit import audit_preservation
            proof=audit_preservation(model,meta,folder,next(row for row in o['previousSources'] if row['id']==model))
            rows[-1]['roles'].append(proof);rows[-1]['passed']&=proof['passed']
        print('[Enhanced audit] '+json.dumps(rows[-1]),flush=True)
    write_json(Path(o['output'])/'mesh-audit.json',{'models':rows,'passed':all(r['passed'] for r in rows)})
    if not all(r['passed'] for r in rows):raise RuntimeError('Saved mesh audit failed: '+', '.join(r['id'] for r in rows if not r['passed']))
