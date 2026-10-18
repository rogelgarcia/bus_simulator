# Adapts the independent growth graph to the established bark mesh and detailed leaf instance pipeline.
import copy
import hashlib
import json
from pathlib import Path
import bpy
import numpy as np
from common import array,triangles,write_json
from foliage import instances
from spatial_poses import leaf_prototypes
from surface import material
from wood import build_wood
from growth import demand_radii
from growth_v2.space_growth import retained_scaffold,light_space,colonize,append_skeleton
from growth_v2.shoots import grow_shoots
from growth_v2.leaves import place,gravity_directions,deform_vertices
from growth_v2.audit import audit_graph,prototype_digest
from growth_v2.support import size_support


REVISION='enhanced-elm-growth-core-v2-study-2'


def build(o):
    if o['models']!=['american_elm/mature_01']:raise RuntimeError('Growth-core study currently requires one American elm mature_01')
    model=o['models'][0];source=Path(o['candidate'])/model;target=Path(o['output'])/model
    meta=json.loads((source/'model.json').read_text());file=source/'enhanced.blend'
    identity=hashlib.sha256(file.read_bytes()).hexdigest()
    if identity!=meta['sha256'] or identity!=next(r['sha256'] for r in o['previousSources'] if r['id']==model):raise RuntimeError('Growth-core source is not authenticated')
    if (target/'enhanced.blend').exists():raise RuntimeError('Preserve the existing study')
    target.mkdir(parents=True,exist_ok=True);bpy.ops.wm.open_mainfile(filepath=str(file))
    foliage=bpy.data.objects[model+' / enhanced leaves'];source_forms=[obj.data for obj in leaf_prototypes(foliage)]
    forms=[];directions=gravity_directions();policy=json.loads((Path(__file__).parent/'policy.json').read_text())
    retained=[prototype_digest(mesh) for mesh in source_forms]
    for style,source_mesh in enumerate(source_forms):
        points=array(source_mesh.vertices,'co',3)
        for bucket,direction in enumerate(directions):
            mesh=source_mesh.copy();mesh.name=f'Elm v2 tissue {style:02} gravity {bucket:02}'
            mesh.vertices.foreach_set('co',deform_vertices(points,direction,np.linspace(*policy['leafSagFraction'],8)[style]).astype(np.float32).ravel());mesh.update();forms.append(mesh)
    for obj in list(bpy.context.scene.objects):bpy.data.objects.remove(obj,do_unlink=True)
    species='american_elm';profile=copy.deepcopy(o['profiles'][species]);rng=np.random.default_rng(profile['seed']+191)
    graph=json.loads((source/'architecture.json').read_text());paths,mapping=retained_scaffold(graph['paths'])
    retained_count=len(paths);targets=light_space(profile,policy,rng)
    nodes,parents,children,anchors,growth=colonize(paths,targets,policy,rng);terminals=append_skeleton(paths,nodes,children,anchors,rng)
    shoots,shoot_proof=grow_shoots(paths,terminals,policy,rng)
    print('[Growth v2] Skeleton '+json.dumps({**growth,**shoot_proof}),flush=True)
    leaves,leaf_proof=place(paths,shoots,profile,policy,rng)
    pipe=policy['youngBranchPipeExponent'];base=policy['terminalSupportRadiusMetres']*len(leaves)**(1/pipe)
    flow=demand_radii(paths,min(profile['growth']['basalRadius'],base),pipe)
    support_proof=size_support(paths,policy)
    root_mapping=dict(mapping)
    for index,old in enumerate(graph['paths']):
        if not old.get('root',False) and not old.get('rootCrown',False):continue
        path=copy.deepcopy(old);path['points']=np.array(path['points']);path['radii']=np.array(path['radii'])
        if path['parent']>=0:path['parent']=root_mapping[path['parent']]
        root_mapping[index]=len(paths);paths.append(path)
    branch_counts={}
    for leaf in leaves:branch_counts[leaf['group']]=branch_counts.get(leaf['group'],0)+1
    roots=[s['id'] for s in shoots if paths[s['id']].get('shootDepth')==0]
    study=min(roots,key=lambda i:abs(branch_counts.get(paths[i]['group'],0)-28)+abs(paths[i]['points'][-1,2]-profile['height']*.65)*.2)
    proof=audit_graph(paths,leaves,policy,retained_count)
    if not proof['passed']:raise RuntimeError('Growth graph validation failed: '+str(proof))
    bark,barkmeta=material(o,species,'bark');wood,twigs=build_wood(model,paths,profile,bark,barkmeta,rng);foliage=instances(model,leaves,forms)
    for obj in [wood,twigs,foliage]:obj['referenceRevision']=REVISION;obj['species']=species;obj['variant']='mature_01'
    centers=np.array([l['bladeCenter'] for l in leaves]);bounds={'min':np.minimum(centers.min(axis=0)-.25,[0,0,0]).tolist(),'max':(centers.max(axis=0)+.25).tolist()}
    output=target/'enhanced.blend';bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(output),compress=True)
    record={'id':model,'file':model+'/enhanced.blend','revision':REVISION,'baselineSha256':next(r['sha256'] for r in o['sources'] if r['id']==model),'previousSha256':identity,'codeIdentity':o['codeIdentity'],
            'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'leafCount':len(leaves),'branchPaths':len(paths),'crownLobes':0,'alphaCards':0,
            'woodTriangles':triangles(wood.data),'branchletTriangles':triangles(twigs.data),'leafTemplateTriangles':[triangles(m) for m in forms],
            'bounds':bounds,'dimensions':{'heightTarget':profile['height'],'radiusTarget':profile['radius'],'habit':profile['habit']},
            'growthCore':{'policy':policy,'spaceGrowth':growth,'shootGrowth':shoot_proof,'leafPlacement':leaf_proof,'flow':flow,'support':support_proof,'graphAudit':proof,
                          'retainedScaffoldPaths':retained_count,'retainedLeafSurfaceDigests':retained,'source':str(source),'sourceLeafCount':meta['leafCount']},
            'limitations':['Experimental artistic light/space-growth approximation, not a physiological simulation','Shared free-space samples approximate available light; no ray-traced illumination feedback',
                           'Gravity uses bounded deformation and a quantized direction library, not a beam solver','Spacing uses proxies; numerical gates do not certify visual realism'],
            'files':['enhanced.blend','architecture.json']}
    write_json(target/'model.json',record)
    write_json(target/'architecture.json',{'paths':[{k:(v.tolist() if isinstance(v,np.ndarray) else v) for k,v in p.items()} for p in paths],
                                         'shoots':shoots,'studyRoot':study,'retainedScaffoldCount':retained_count})
    print('[Growth v2] Saved '+model+' leaves='+str(len(leaves)),flush=True)
