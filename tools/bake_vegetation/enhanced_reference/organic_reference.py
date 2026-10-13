# Preserves the accepted woody sprays while replacing planar foliage with gently curved leaves.
import hashlib
import json
import shutil
from pathlib import Path
import bpy
import numpy as np
from mathutils import Euler
from common import array,triangles,write_json,foliage_data
from fan_foliage import attachment
from organic_foliage import soften_sprays
from foliage import templates,instances
from releaf import wood_digest
from surface import material


def organic_reference(o):
    for model in o['models']:
        species,variant=model.split('/');p=o['profiles'][species];source=Path(o['candidate'])/model;target=Path(o['output'])/model
        meta=json.loads((source/'model.json').read_text());file=source/'enhanced.blend';identity=hashlib.sha256(file.read_bytes()).hexdigest()
        if species!='london_plane' or meta['revision']!='enhanced-plane-dome-foliage-v12' or identity!=meta['sha256']:raise RuntimeError('Organic foliage requires authenticated v12 London plane')
        if identity!=next(r['sha256'] for r in o['previousSources'] if r['id']==model):raise RuntimeError('Organic source differs from previous collection')
        if (target/'enhanced.blend').exists():raise RuntimeError('Preserve existing organic candidate')
        target.mkdir(parents=True,exist_ok=True);bpy.ops.wm.open_mainfile(filepath=str(file))
        wood=[bpy.data.objects[model+' / enhanced '+role] for role in ['wood','branchlets']];retained=[wood_digest(obj.data) for obj in wood]
        graph=json.loads((source/'architecture.json').read_text());paths=graph['paths']
        for path in paths:path['points']=np.asarray(path['points']);path['radii']=np.asarray(path['radii'])
        old=bpy.data.objects[model+' / enhanced leaves'];data=foliage_data(old);mesh=old.data
        shoots=array(mesh.attributes['shoot_id'].data,'value',dtype=np.int32);nodes=array(mesh.attributes['node_id'].data,'value',dtype=np.int32)
        groups=array(mesh.attributes['spray_id'].data,'value',dtype=np.int32);tints=array(mesh.attributes['leaf_tint'].data,'color',4)
        matrices=np.array([np.array(Euler(tuple(r)).to_matrix()) for r in data['rotations']])*data['scales'][:,None,:]
        accepted=[{'shoot':int(shoots[i]),'node':int(nodes[i]),'group':int(groups[i]),'form':int(data['forms'][i]),'size':float(data['scales'][i,0]),
                   'tint':tints[i,:3],'origin':data['origins'][i],'matrix':matrices[i],
                   'attachment':float(attachment(paths[shoots[i]],data['origins'][i]))} for i in range(len(shoots))]
        leaves,crowding=soften_sprays(paths,accepted,np.random.default_rng(p['seed']+int(variant[-1])*191+13117))
        front,leafmeta=material(o,species,'leaf_front');back,_=material(o,species,'leaf_back')
        forms=templates(o,species,[front,back],leafmeta,detailed_petioles=True,spread_petioles=True)
        bpy.data.objects.remove(old,do_unlink=True);foliage=instances(model,leaves,forms)
        if retained!=[wood_digest(obj.data) for obj in wood]:raise RuntimeError('Organic foliage changed preserved wood')
        revision='enhanced-plane-organic-foliage-v13'
        for obj in wood+[foliage]:obj['species']=species;obj['variant']=variant;obj['referenceRevision']=revision
        output=target/'enhanced.blend';bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(output),compress=True)
        centers=np.array([leaf['bladeCenter'] for leaf in leaves]);counts=[triangles(m) for m in forms]
        meta.update(revision=revision,previousSha256=identity,codeIdentity=o['codeIdentity'],preservedWoodMeshDigests=retained,
                    leafCount=len(leaves),previousLeafCount=len(accepted),crowding=crowding,leafTemplateTriangles=counts,
                    instancedLeafTriangles=sum(counts[leaf['form']] for leaf in leaves),
                    bounds={'min':np.minimum(centers.min(axis=0)-p['leafLength'],[0,0,0]).tolist(),'max':(centers.max(axis=0)+p['leafLength']).tolist()},
                    sha256=hashlib.sha256(output.read_bytes()).hexdigest())
        write_json(target/'model.json',meta);shutil.copyfile(source/'architecture.json',target/'architecture.json')
        print('[Enhanced] Organic foliage '+model+'; '+str(len(leaves))+' attached leaves, exact wood and fine branchlets',flush=True)
