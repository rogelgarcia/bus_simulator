# Revises fine elm fans and foliage while retaining the accepted trunk and leaf prototypes.
import hashlib
import json
from pathlib import Path
import bpy
import numpy as np
from mathutils import Euler
from common import array,triangles,write_json,foliage_data
from foliage import instances
from releaf import wood_digest
from spatial_poses import leaf_prototypes
from spray_foliage import place_leaves
from elm_leaf_distribution import ClusterLeafLayout
from oak_growth import crown_profile
from spray_space import measure_sprays
from elm_fan_growth import orient_fans
from shoot_competition import redundant_shoots,compact_graph
from wood import mesh_paths
from junctions import flow_surfaces


def rebuild(o):
    for model in o['models']:
        species,variant=model.split('/');source=Path(o['candidate'])/model;target=Path(o['output'])/model
        meta=json.loads((source/'model.json').read_text());file=source/'enhanced.blend';identity=hashlib.sha256(file.read_bytes()).hexdigest()
        if species=='american_elm' and meta['revision']=='enhanced-elm-filled-fans-v10':
            from elm_fan_fill import refill
            refill(o,model,meta,source,target);continue
        if species!='american_elm' or meta['revision'] not in ['enhanced-elm-clean-foliage-v6','enhanced-elm-balanced-foliage-v7'] or identity!=meta['sha256']:raise RuntimeError('Expected authenticated cleaned or balanced elm')
        if identity!=next(r['sha256'] for r in o['previousSources'] if r['id']==model):raise RuntimeError('Previous collection differs')
        if (target/'enhanced.blend').exists():raise RuntimeError('Preserve existing candidate')
        target.mkdir(parents=True,exist_ok=True);bpy.ops.wm.open_mainfile(filepath=str(file))
        wood=[bpy.data.objects[model+' / enhanced '+role] for role in ['wood','branchlets']];retained=[wood_digest(obj.data) for obj in wood]
        old=bpy.data.objects[model+' / enhanced leaves'];forms=[obj.data for obj in leaf_prototypes(old)]
        template_digests=[wood_digest(mesh) for mesh in forms];old_centers=array(old.data.attributes['blade_center'].data,'vector',3)
        old_shoots=array(old.data.attributes['shoot_id'].data,'value',dtype=np.int32)
        old_groups=array(old.data.attributes['spray_id'].data,'value',dtype=np.int32);old_data=foliage_data(old)
        old_matrices=np.array([np.array(Euler(tuple(r)).to_matrix()) for r in old_data['rotations']])*old_data['scales'][:,None,:]
        graph=json.loads((source/'architecture.json').read_text());paths=graph['paths']
        for r in paths:r['points']=np.asarray(r['points']);r['radii']=np.asarray(r['radii'])
        old_clusters=[paths[i]['crownCluster'] for i in old_shoots]
        if graph.get('studyRoot') is None:
            height=max(float(r['points'][-1,2]) for r in paths)
            graph['studyRoot']=max((i for i,r in enumerate(paths) if r.get('shootDepth')==0),key=lambda i:paths[i]['points'][-1]@np.array([.12,-1.,0.])-abs(paths[i]['points'][-1,2]-height*.66)*1.4)
        p=o['profiles'][species];layout=ClusterLeafLayout(meta['dimensions']['growth']['crownClusters'],p['foliageBalance'])
        normals={s['group']:paths[s['id']]['sprayNormal'] for s in graph['shoots']}
        overlap_before=measure_sprays(old_centers,old_matrices,old_groups,normals,p['leafExclusionHalfAxes'][:2],p['sprayMinimumClearance'])
        fan_growth=orient_fans(paths,graph['shoots'],layout)
        removed,competition=redundant_shoots(paths,graph['shoots'],p['leafLength'],p['shootCompetition'])
        graph=compact_graph(graph,removed);paths=graph['paths']
        small=[r for r in flow_surfaces(paths) if not (('growthRole' in r or r.get('root',False)) and (max(r['radii'])>=.060 or r.get('rootCrown',False)))]
        name=wood[1].name;material=wood[1].data.materials[0];bpy.data.objects.remove(wood[1],do_unlink=True)
        wood[1]=mesh_paths(name,small,material,p['barkTileMetres'],np.random.default_rng(p['seed']+int(variant[-1])*191),False)
        rng=np.random.default_rng(p['seed']+int(variant[-1])*191+71431)
        print('[Enhanced] Oriented '+str(fan_growth['fans'])+' fans; pruned '+str(len(removed))+' competing shoots; placing foliage',flush=True)
        leaves,crowding=place_leaves(p,paths,graph['shoots'],rng,layout)
        bpy.data.objects.remove(old,do_unlink=True);foliage=instances(model,leaves,forms)
        if retained[0]!=wood_digest(wood[0].data):raise RuntimeError('Fan growth changed the accepted trunk')
        centers=np.asarray([l['bladeCenter'] for l in leaves]);counts=[triangles(m) for m in forms]
        proof={'policy':p['foliageBalance'],'previousLeafCount':meta['leafCount'],'leafCount':len(leaves),
               'before':layout.distribution(old_centers,old_clusters),
               'after':layout.distribution(centers,[paths[l['shoot']]['crownCluster'] for l in leaves]),
               'previousBounds':{'min':old_centers.min(axis=0).tolist(),'max':old_centers.max(axis=0).tolist()},
               'clusters':len(layout.regions),'method':'Branch-owned ellipsoid gradients guide coherent fans around local sides and top; attached alternate leaves use projected fan spacing and global 3D spacing',
               'minimumAcceptedProxyClearance':crowding['minimumAcceptedProxyClearance']}
        normals={s['group']:paths[s['id']]['sprayNormal'] for s in graph['shoots']}
        overlap_after=measure_sprays(centers,[l['matrix'] for l in leaves],[l['group'] for l in leaves],normals,p['leafExclusionHalfAxes'][:2],p['sprayMinimumClearance'])
        if overlap_after['pairsBelowMinimum']:raise RuntimeError('Foliage still stacks within its supporting fan')
        proof['spraySpacing']={'before':overlap_before,'after':overlap_after}
        proof['fanGrowth']=fan_growth;proof['shootCompetition']={'removed':len(removed),'decisions':competition,'policy':p['shootCompetition']}
        revision='enhanced-elm-filled-fans-v10'
        for obj in wood+[foliage]:obj['referenceRevision']=revision;obj['species']=species;obj['variant']=variant
        crowding['branchletSpacing']={'sourceLayout':meta['crowding']['branchletSpacing'],
            'fineShootPaths':len(graph['shoots']),'competitionPruned':len(removed),
            'measurementScope':'Source clearance predates fan rotation; not a post-rotation twig collision guarantee'}
        for key in ['foliageCleanup','preservedLeafTemplateDigests','preservedWoodMeshDigests']:meta.pop(key,None)
        output=target/'enhanced.blend';bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(output),compress=True)
        meta.update(revision=revision,previousSha256=identity,codeIdentity=o['codeIdentity'],leafCount=len(leaves),previousLeafCount=proof['previousLeafCount'],
                    branchPaths=len(paths),branchletTriangles=triangles(wood[1].data),
                    instancedLeafTriangles=int(sum(counts[l['form']] for l in leaves)),crowding=crowding,foliageBalance=proof,
                    preservedTrunkMeshDigest=retained[0],preservedLeafTemplateDigests=template_digests,crownProfile=crown_profile(centers),
                    bounds={'min':np.minimum(centers.min(axis=0)-p['leafLength'],[0,0,0]).tolist(),'max':(centers.max(axis=0)+p['leafLength']).tolist()},
                    sha256=hashlib.sha256(output.read_bytes()).hexdigest())
        write_json(target/'model.json',meta)
        write_json(target/'architecture.json',{**graph,'paths':[{**r,'points':r['points'].tolist(),'radii':r['radii'].tolist()} for r in paths]})
        print('[Enhanced] Balanced elm '+model+' '+json.dumps({'leaves':len(leaves),'prunedShoots':len(removed),'gapFillLeaves':crowding['gapFillLeaves']}),flush=True)
