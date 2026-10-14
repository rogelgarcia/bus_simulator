# Opens existing leaf tissue toward its dark upper face without changing wood or foliage placement.
import hashlib
import json
import shutil
from pathlib import Path
import bpy
import numpy as np
from mathutils import Euler
from common import array,write_json,foliage_data
from leaf_curvature import open_blade_height,blade_shape_metrics
from plane_foliage import form_parameters
from releaf import wood_digest
from spatial_poses import leaf_prototypes


def placement_digest(mesh):
    h=hashlib.sha256(array(mesh.vertices,'co',3).tobytes())
    for name,field,size in [('leaf_form','value',1),('leaf_scale','vector',3),('leaf_rotation','vector',3),('leaf_tint','color',4),('spray_id','value',1),('shoot_id','value',1),('node_id','value',1)]:
        h.update(array(mesh.attributes[name].data,field,size).tobytes())
    return h.hexdigest()


def retained_blade_digest(mesh):
    points=array(mesh.vertices,'co',3);h=hashlib.sha256(points[:2562,:2].tobytes());h.update(points[2562:].tobytes())
    for items,field,size in [(mesh.loops,'vertex_index',1),(mesh.polygons,'loop_total',1),(mesh.polygons,'material_index',1)]:h.update(array(items,field,size,np.int32).tobytes())
    for layer in mesh.uv_layers:h.update(array(layer.data,'uv',2).tobytes())
    return h.hexdigest()


def upper_face_metrics(mesh):
    normals=array(mesh.polygons,'normal',3)[:2304,2];area=array(mesh.polygons,'area')[:2304]
    return {'minimumUpperNormalZ':float(normals.min()),'areaWeightedUpperNormalZ':float(np.average(normals,weights=area))}


def open_leaf_reference(o):
    for model in o['models']:
        species,variant=model.split('/');source=Path(o['candidate'])/model;target=Path(o['output'])/model
        meta=json.loads((source/'model.json').read_text());file=source/'enhanced.blend';identity=hashlib.sha256(file.read_bytes()).hexdigest()
        if species!='london_plane' or meta['revision']!='enhanced-plane-spatial-growth-v14' or identity!=meta['sha256']:raise RuntimeError('Open leaves require authenticated v14 London plane')
        if identity!=next(r['sha256'] for r in o['previousSources'] if r['id']==model):raise RuntimeError('Open-leaf source differs from previous collection')
        if (target/'enhanced.blend').exists():raise RuntimeError('Preserve existing open-leaf candidate')
        target.mkdir(parents=True,exist_ok=True);bpy.ops.wm.open_mainfile(filepath=str(file))
        wood=[bpy.data.objects[model+' / enhanced '+role] for role in ['wood','branchlets']];retained=[wood_digest(obj.data) for obj in wood]
        foliage=bpy.data.objects[model+' / enhanced leaves'];placement=placement_digest(foliage.data);proof=[];blade_digests=[]
        for form,obj in enumerate(leaf_prototypes(foliage)):
            mesh=obj.data;old_digest=retained_blade_digest(mesh);points=array(mesh.vertices,'co',3);shape=form_parameters(form,True)
            xy=points[:1281,:2]-[0,shape['petiole']];z=open_blade_height(xy,form)
            points[:1281,2]=z+.0007;points[1281:2562,2]=z-.0007
            mesh.vertices.foreach_set('co',points.astype(np.float32).ravel());mesh.update()
            if retained_blade_digest(mesh)!=old_digest:raise RuntimeError('Leaf opening changed stalk, silhouette, UVs or material assignments')
            surface=upper_face_metrics(mesh)
            if surface['minimumUpperNormalZ']<=0 or surface['areaWeightedUpperNormalZ']<.94 or 'leaf_front' not in mesh.materials[0].name:raise RuntimeError('Dark upper face is not open along local +Z: '+json.dumps(surface))
            metrics={**blade_shape_metrics(points[:1281]),**surface}
            proof.append(metrics);blade_digests.append(old_digest);mesh['bladeShape']=json.dumps(metrics)
        data=foliage_data(foliage);matrices=np.array([np.array(Euler(tuple(r)).to_matrix()) for r in data['rotations']])*data['scales'][:,None,:]
        local=np.array([[0,form_parameters(int(f),True)['petiole']+.48,float(open_blade_height([[0,.48]],int(f))[0])] for f in data['forms']])
        centers=data['origins']+np.einsum('nij,nj->ni',matrices,local);foliage.data.attributes['blade_center'].data.foreach_set('vector',centers.astype(np.float32).ravel())
        if placement_digest(foliage.data)!=placement or retained!=[wood_digest(obj.data) for obj in wood]:raise RuntimeError('Leaf opening changed accepted structure or placements')
        revision='enhanced-plane-open-leaves-v15'
        for obj in wood+[foliage]:obj['referenceRevision']=revision
        output=target/'enhanced.blend';bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(output),compress=True)
        meta.update(revision=revision,previousSha256=identity,codeIdentity=o['codeIdentity'],preservedWoodMeshDigests=retained,
                    preservedLeafPlacementDigest=placement,preservedBladeDigests=blade_digests,bladeShape=proof,
                    previousBladeShape=meta['bladeShape'],leafShapeProfile='Shallow convex upper face, lowered margins, modest twist; static geometry',
                    sha256=hashlib.sha256(output.read_bytes()).hexdigest())
        write_json(target/'model.json',meta);shutil.copyfile(source/'architecture.json',target/'architecture.json')
        print('[Enhanced] Open leaves '+model+'; '+str(meta['leafCount'])+' retained leaves, exact wood and attachment transforms',flush=True)
