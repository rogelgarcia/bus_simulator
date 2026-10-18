# Continues attached gap filling from a verified elm without moving its existing leaves or wood.
import hashlib
import json
import shutil
import bpy
import numpy as np
from mathutils import Euler
from common import array,foliage_data,triangles,write_json
from foliage import instances
from spatial_poses import leaf_prototypes
from releaf import wood_digest
from spray_foliage import place_leaves
from spray_space import measure_sprays
from elm_leaf_distribution import ClusterLeafLayout
from oak_growth import crown_profile


def refill(o,model,meta,source,target):
    identity=hashlib.sha256((source/'enhanced.blend').read_bytes()).hexdigest()
    prior=next(r['sha256'] for r in o['previousSources'] if r['id']==model)
    if identity!=meta['sha256'] or meta['previousSha256']!=prior:raise RuntimeError('Unverified fan-fill source')
    if (target/'enhanced.blend').exists():raise RuntimeError('Preserve existing candidate')
    target.mkdir(parents=True,exist_ok=True);bpy.ops.wm.open_mainfile(filepath=str(source/'enhanced.blend'))
    old=bpy.data.objects[model+' / enhanced leaves'];old_mesh=old.data;data=foliage_data(old)
    forms=[obj.data for obj in leaf_prototypes(old)];graph=json.loads((source/'architecture.json').read_text())
    for path in graph['paths']:path['points']=np.asarray(path['points'])
    keys={name:array(old_mesh.attributes[name].data,'value',dtype=np.int32) for name in ['shoot_id','node_id','spray_id']}
    centers=array(old_mesh.attributes['blade_center'].data,'vector',3);tints=array(old_mesh.attributes['leaf_tint'].data,'color',4)
    matrices=np.array([np.array(Euler(tuple(r)).to_matrix()) for r in data['rotations']])*data['scales'][:,None,:]
    leaves=[]
    for i,origin in enumerate(data['origins']):
        points=graph['paths'][keys['shoot_id'][i]]['points'];delta=np.diff(points,axis=0)
        t=np.clip(np.einsum('ij,ij->i',origin-points[:-1],delta)/np.sum(delta*delta,axis=1),0,1)
        segment=int(np.argmin(np.linalg.norm(points[:-1]+delta*t[:,None]-origin,axis=1)))
        leaves.append({'origin':origin,'matrix':matrices[i],'bladeCenter':centers[i],'form':int(data['forms'][i]),'tint':tints[i,:3],
                       'shoot':int(keys['shoot_id'][i]),'node':int(keys['node_id'][i]),'group':int(keys['spray_id'][i]),
                       'attachment':float((segment+t[segment])/(len(points)-1)),'young':False})
    p=o['profiles']['american_elm'];layout=ClusterLeafLayout(meta['dimensions']['growth']['crownClusters'],p['foliageBalance'])
    source_passes=meta['crowding'].get('completedGapPasses',2);passes=p['sprayGapFill']['passes']-source_passes
    if passes<=0:raise RuntimeError('Candidate has already completed the configured gap passes')
    rng=np.random.default_rng(p['seed']+int(model[-1])*191+71431+source_passes*1009)
    result,proof=place_leaves(p,graph['paths'],graph['shoots'],rng,layout,existing=leaves,gap_passes=passes)
    bpy.data.objects.remove(old,do_unlink=True);new=instances(model,result,forms)
    indices={(leaf['shoot'],leaf['node']):i for i,leaf in enumerate(result)}
    retained=np.array([indices[(int(s),int(n))] for s,n in zip(keys['shoot_id'],keys['node_id'])])
    co=array(new.data.vertices,'co',3);co[retained]=data['origins'];new.data.vertices.foreach_set('co',co.ravel())
    for name in ['leaf_form','leaf_scale','leaf_rotation','leaf_tint','spray_id','shoot_id','node_id','blade_center']:
        attr=old_mesh.attributes[name];field,width,dtype={'INT':('value',1,np.int32),'FLOAT_VECTOR':('vector',3,np.float32),'FLOAT_COLOR':('color',4,np.float32)}[attr.data_type]
        original=array(attr.data,field,width,dtype);values=array(new.data.attributes[name].data,field,width,dtype)
        values[retained]=original;new.data.attributes[name].data.foreach_set(field,values.ravel())
        if not np.array_equal(array(new.data.attributes[name].data,field,width,dtype)[retained],original):raise RuntimeError('Existing leaf changed')
    if not np.array_equal(array(new.data.vertices,'co',3)[retained],data['origins']):raise RuntimeError('Existing leaf origin changed')
    saved=foliage_data(new);centers=array(new.data.attributes['blade_center'].data,'vector',3)
    matrices=np.array([np.array(Euler(tuple(r)).to_matrix()) for r in saved['rotations']])*saved['scales'][:,None,:]
    normals={int(k):v for k,v in proof['sprayPlanes'].items()}
    spacing=measure_sprays(centers,matrices,[leaf['group'] for leaf in result],normals,p['leafExclusionHalfAxes'][:2],p['sprayMinimumClearance'])
    if spacing['pairsBelowMinimum']:raise RuntimeError('Gap fill violated fan spacing')
    crowding=meta['crowding'];added=len(result)-len(leaves)
    for key in ['minimumAcceptedProxyClearance','minimumAcceptedSprayClearance']:crowding[key]=min(crowding[key],proof[key])
    crowding.update(completedGapPasses=source_passes+passes,gapFillLeaves=crowding['gapFillLeaves']+added)
    meta['foliageBalance']['after']=layout.distribution(centers,[graph['paths'][leaf['shoot']]['crownCluster'] for leaf in result])
    meta['foliageBalance']['spraySpacing']['after']=spacing;meta['foliageBalance']['leafCount']=len(result)
    meta['foliageBalance']['retainedGapFill']={'sourceSha256':identity,'retainedLeaves':len(leaves),'addedLeaves':added,'existingTransformsBitwisePreserved':True}
    new['referenceRevision']=meta['revision'];new['species']='american_elm';new['variant']=model.split('/')[1]
    meta['preservedWoodMeshDigests']=[wood_digest(bpy.data.objects[model+' / enhanced '+role].data) for role in ['wood','branchlets']]
    file=target/'enhanced.blend';bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(file),compress=True)
    counts=[triangles(mesh) for mesh in forms]
    meta.update(codeIdentity=o['codeIdentity'],leafCount=len(result),instancedLeafTriangles=sum(counts[l['form']] for l in result),
                crownProfile=crown_profile(centers),bounds={'min':np.minimum(centers.min(axis=0)-p['leafLength'],[0,0,0]).tolist(),'max':(centers.max(axis=0)+p['leafLength']).tolist()},
                sha256=hashlib.sha256(file.read_bytes()).hexdigest())
    write_json(target/'model.json',meta);shutil.copyfile(source/'architecture.json',target/'architecture.json')
    print('[Enhanced] Retained '+str(len(leaves))+' leaves; filled '+str(added)+' open sites in '+model,flush=True)
