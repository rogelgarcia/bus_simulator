# Checks growth continuity and actual saved leaf attachment independently of crown coverage.
import hashlib
import json
import numpy as np
from growth_v2.support import supported_reach


def audit_graph(paths,leaves,policy,retained_count):
    attachment=[];turns=[];taper=[];ratios=[]
    for i,path in enumerate(paths):
        points=np.asarray(path['points']);radii=np.asarray(path['radii']);taper.append(float(np.diff(radii).max()))
        if path['parent']>=0 and ('growthRole' in path or 'shootRole' in path):
            parent=paths[path['parent']];node=path['parentNode'];attachment.append(np.linalg.norm(points[0]-parent['points'][node]))
        if i>=retained_count and not path.get('root',False) and not path.get('rootCrown',False):
            delta=np.diff(points,axis=0);length=np.linalg.norm(delta,axis=1)
            ratios.append(float(length.sum()/max(np.linalg.norm(points[-1]-points[0]),1e-9)))
            delta/=np.maximum(length[:,None],1e-12)
            turns.extend(np.degrees(np.arccos(np.clip(np.sum(delta[1:]*delta[:-1],axis=1),-1,1))))
    leaf_errors=[]
    for leaf in leaves:
        path=paths[int(leaf['shoot'])];points=np.asarray(path['points']);a=points[:-1];delta=np.diff(points,axis=0)
        u=np.clip(np.sum((np.asarray(leaf['origin'])-a)*delta,axis=1)/np.sum(delta*delta,axis=1),0,1)
        leaf_errors.append(float(np.linalg.norm(np.asarray(leaf['origin'])-a-u[:,None]*delta,axis=1).min()))
    keys=[(int(l['shoot']),int(l['node'])) for l in leaves]
    finite=all(np.isfinite(p['points']).all() and np.isfinite(p['radii']).all() for p in paths)
    proof={'maximumBranchAnchorError':float(max(attachment,default=0)),'maximumLeafAnchorError':float(max(leaf_errors,default=0)),
           'maximumSegmentTurnDegrees':float(max(turns,default=0)),'maximumRadiusIncrease':max(taper),'uniqueLeafNodes':len(keys)==len(set(keys)),
           'maximumPathTortuosity':max(ratios,default=1.),'paths':len(paths),'leaves':len(leaves),'finite':finite}
    proof['passed']=bool(finite and len(leaves)>0 and proof['maximumBranchAnchorError']<1e-7 and proof['maximumLeafAnchorError']<2e-5 and proof['maximumSegmentTurnDegrees']<85 and proof['maximumPathTortuosity']<2.7 and max(taper)<1e-8 and proof['uniqueLeafNodes'])
    if 'maximumSupportedSlenderness' in policy:
        wood=[p for p in paths if not p.get('root') and not p.get('rootCrown')]
        reach=supported_reach(wood)
        proof['maximumSupportedSlenderness']=float(max(np.max(r/(2*p['radii'])) for r,p in zip(reach,wood)))
        proof['maximumUnforkedLengthMetres']=float(max((np.linalg.norm(np.diff(p['points'],axis=0),axis=1).sum() for p in wood if p.get('growthRole')=='space-grown'),default=0.))
        proof['passed']&=proof['maximumSupportedSlenderness']<=policy['maximumSupportedSlenderness']+1e-5 and proof['maximumUnforkedLengthMetres']<=policy['maximumUnforkedLengthMetres']+.08
    return proof


def prototype_digest(mesh):
    from common import array
    digest=hashlib.sha256()
    for value in [array(mesh.loops,'vertex_index',dtype=np.int32),array(mesh.polygons,'loop_total',dtype=np.int32),array(mesh.polygons,'material_index',dtype=np.int32),array(mesh.uv_layers.active.data,'uv',2)]:digest.update(value.tobytes())
    return digest.hexdigest()


def inspect(model,meta,directory):
    import bpy
    from common import array
    from spatial_poses import leaf_prototypes
    graph=json.loads((directory/'architecture.json').read_text());paths=graph['paths']
    for p in paths:p['points']=np.array(p['points']);p['radii']=np.array(p['radii'])
    foliage=bpy.data.objects[model+' / enhanced leaves'];mesh=foliage.data
    origins=array(mesh.vertices,'co',3);ids=array(mesh.attributes['shoot_id'].data,'value',dtype=np.int32);nodes=array(mesh.attributes['node_id'].data,'value',dtype=np.int32)
    proof=audit_graph(paths,[{'origin':a,'shoot':i,'node':n} for a,i,n in zip(origins,ids,nodes)],meta['growthCore']['policy'],graph['retainedScaffoldCount'])
    from growth_v2.leaves import gravity_directions,deform_vertices
    forms=leaf_prototypes(foliage);per_style=len(gravity_directions());expected=meta['growthCore']['retainedLeafSurfaceDigests']
    proof['retainedLeafTopologyAndUV']=len(forms)==len(expected)*per_style and all(prototype_digest(obj.data)==expected[i//per_style] for i,obj in enumerate(forms))
    source=json.loads((__import__('pathlib').Path(meta['growthCore']['source'])/'architecture.json').read_text())
    proof['retainedScaffoldCoordinates']=all(np.array_equal(p['points'],source['paths'][p['retainedSourcePath']]['points']) for p in paths[:graph['retainedScaffoldCount']])
    proof['passed']&=proof['retainedLeafTopologyAndUV'] and proof['retainedScaffoldCoordinates'] and len(origins)==meta['leafCount']
    return {'role':'connected growth core',**proof}
