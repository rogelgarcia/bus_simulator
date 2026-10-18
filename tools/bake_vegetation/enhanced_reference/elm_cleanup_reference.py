# Applies conservative foliage cleanup to authenticated elm models without changing any surviving geometry.
import hashlib
import json
import shutil
from pathlib import Path
import bpy
import numpy as np
from mathutils import Euler
from common import array,foliage_data,write_json
from releaf import wood_digest
from foliage_cleanup import clean_foliage
from spatial_poses import leaf_prototypes
from oak_growth import crown_profile


def rebuild(o):
    for model in o['models']:
        species,variant=model.split('/');source=Path(o['candidate'])/model;target=Path(o['output'])/model
        meta=json.loads((source/'model.json').read_text());file=source/'enhanced.blend';identity=hashlib.sha256(file.read_bytes()).hexdigest()
        if species!='american_elm' or meta['revision']!='enhanced-elm-clustered-v5' or identity!=meta['sha256']:raise RuntimeError('Expected authenticated clustered elm')
        if identity!=next(r['sha256'] for r in o['previousSources'] if r['id']==model):raise RuntimeError('Previous collection differs')
        if (target/'enhanced.blend').exists():raise RuntimeError('Preserve existing candidate')
        target.mkdir(parents=True,exist_ok=True);bpy.ops.wm.open_mainfile(filepath=str(file))
        wood=[bpy.data.objects[model+' / enhanced '+role] for role in ['wood','branchlets']];retained=[wood_digest(obj.data) for obj in wood]
        foliage=bpy.data.objects[model+' / enhanced leaves'];source_mesh=foliage.data;data=foliage_data(foliage)
        matrices=np.array([np.array(Euler(tuple(r)).to_matrix()) for r in data['rotations']])*data['scales'][:,None,:]
        centers=array(source_mesh.attributes['blade_center'].data,'vector',3);groups=array(source_mesh.attributes['spray_id'].data,'value',dtype=np.int32)
        keep,proof=clean_foliage(centers,matrices,groups,o['profiles'][species]['foliageCleanup']);ids=np.flatnonzero(keep)
        mesh=bpy.data.meshes.new(model+' coverage-preserving leaf origins');mesh.vertices.add(len(ids));mesh.vertices.foreach_set('co',data['origins'][ids].ravel())
        for attr in source_mesh.attributes:
            if attr.name=='position' or attr.domain!='POINT' or attr.name.startswith('.'):continue
            field,width,dtype={'FLOAT_VECTOR':('vector',3,np.float32),'FLOAT_COLOR':('color',4,np.float32),'INT':('value',1,np.int32),'FLOAT':('value',1,np.float32),'BOOLEAN':('value',1,np.bool_)}[attr.data_type]
            mesh.attributes.new(attr.name,attr.data_type,'POINT').data.foreach_set(field,array(attr.data,field,width,dtype)[ids].ravel())
        foliage.data=mesh
        if retained!=[wood_digest(obj.data) for obj in wood]:raise RuntimeError('Cleanup changed accepted wood')
        template_digests=[wood_digest(obj.data) for obj in leaf_prototypes(foliage)]
        if len(ids)==len(keep):raise RuntimeError('Cleanup did not improve crowding')
        revision='enhanced-elm-clean-foliage-v6'
        for obj in wood+[foliage]:obj['referenceRevision']=revision
        output=target/'enhanced.blend';bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(output),compress=True)
        shutil.copyfile(source/'architecture.json',target/'architecture.json')
        meta.update(revision=revision,previousSha256=identity,codeIdentity=o['codeIdentity'],leafCount=len(ids),previousLeafCount=len(keep),
                    instancedLeafTriangles=int(sum(meta['leafTemplateTriangles'][int(form)] for form in data['forms'][ids])),
                    foliageCleanup=proof,preservedWoodMeshDigests=retained,preservedLeafTemplateDigests=template_digests,
                    crownProfile=crown_profile(centers[ids]),sha256=hashlib.sha256(output.read_bytes()).hexdigest())
        write_json(target/'model.json',meta)
        print('[Enhanced] Cleaned elm '+model+' '+json.dumps(proof),flush=True)
