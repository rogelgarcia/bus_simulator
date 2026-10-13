# Replaces reference foliage while preserving authenticated scaffold and twig meshes byte-for-byte.
import hashlib
import json
import shutil
from pathlib import Path
import bpy
import numpy as np
from common import array,triangles,write_json
from foliage import templates,instances
from plane_foliage import place_leaves
from surface import material


def wood_digest(mesh):
    h=hashlib.sha256(array(mesh.vertices,'co',3).tobytes())
    h.update(array(mesh.loops,'vertex_index',dtype=np.int32).tobytes())
    h.update(array(mesh.polygons,'loop_total',dtype=np.int32).tobytes())
    for layer in mesh.uv_layers:h.update(array(layer.data,'uv',2).tobytes())
    return h.hexdigest()


def releaf(o):
    spread=o['foliage-layout']=='spatial'
    for model in o['models']:
        species,variant=model.split('/');p=o['profiles'][species];source=Path(o['candidate'])/model;target=Path(o['output'])/model
        meta=json.loads((source/'model.json').read_text());file=source/'enhanced.blend';identity=hashlib.sha256(file.read_bytes()).hexdigest()
        accepted=['enhanced-plane-foliage-v9','enhanced-plane-posture-v10'] if spread else ['enhanced-plane-branchlets-v8']
        if species!='london_plane' or meta['revision'] not in accepted or identity!=meta['sha256']:raise RuntimeError('Foliage phase requires the authenticated source revision for its layout')
        if identity!=next(r['sha256'] for r in o['previousSources'] if r['id']==model):raise RuntimeError('Foliage source must match the authenticated previous collection')
        if (target/'enhanced.blend').exists():raise RuntimeError('Preserve existing foliage candidate')
        target.mkdir(parents=True,exist_ok=True);bpy.ops.wm.open_mainfile(filepath=str(file))
        wood=[bpy.data.objects[model+' / enhanced '+role] for role in ['wood','branchlets']];retained=[wood_digest(obj.data) for obj in wood]
        data=json.loads((source/'architecture.json').read_text());paths=data['paths']
        for path in paths:path['points']=np.asarray(path['points']);path['radii']=np.asarray(path['radii'])
        rng=np.random.default_rng(p['seed']+int(variant[-1])*191+93011)
        if spread:
            from spaced_foliage import place_leaves as space_leaves
            leaves,crowding=space_leaves(p,paths,data['shoots'],rng)
        else:leaves,crowding=place_leaves(p,paths,data['shoots'],rng)
        previous_leaf_count=meta['leafCount']
        bpy.data.objects.remove(bpy.data.objects[model+' / enhanced leaves'],do_unlink=True)
        front,leafmeta=material(o,species,'leaf_front');back,_=material(o,species,'leaf_back')
        forms=templates(o,species,[front,back],leafmeta,detailed_petioles=True,spread_petioles=spread);foliage=instances(model,leaves,forms)
        if retained!=[wood_digest(obj.data) for obj in wood]:raise RuntimeError('Foliage update modified accepted wood')
        centers=np.asarray([l['bladeCenter'] for l in leaves]);counts=[triangles(m) for m in forms]
        if len(leaves)<3000 or not np.isfinite(centers).all():raise RuntimeError('Invalid new foliage')
        revision='enhanced-plane-spaced-foliage-v11' if spread else 'enhanced-plane-foliage-v9'
        for obj in wood+[foliage]:obj['species']=species;obj['variant']=variant;obj['referenceRevision']=revision
        output=target/'enhanced.blend';bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(output),compress=True)
        shutil.copyfile(source/'architecture.json',target/'architecture.json')
        meta.update(revision=revision,previousSha256=identity,codeIdentity=o['codeIdentity'],leafCount=len(leaves),previousLeafCount=previous_leaf_count,leafTemplateTriangles=counts,
                    instancedLeafTriangles=sum(counts[l['form']] for l in leaves),crowding=crowding,preservedWoodMeshDigests=retained,
                    bounds={'min':np.minimum(centers.min(axis=0)-p['leafLength'],[0,0,0]).tolist(),'max':(centers.max(axis=0)+p['leafLength']).tolist()},
                    sha256=hashlib.sha256(output.read_bytes()).hexdigest(),foliageStudySha256=hashlib.sha256(Path(o['foliage-study']).read_bytes()).hexdigest())
        write_json(target/'model.json',meta);print('[Enhanced] Refoliated '+model+' / '+str(len(leaves))+' leaves; wood preserved',flush=True)
