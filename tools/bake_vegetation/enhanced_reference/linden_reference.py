# Replaces crowded linden sprays while preserving the accepted trunk and structural growth.
import hashlib
import json
from pathlib import Path
import bpy
import numpy as np
from common import triangles,write_json
from architecture import scaffold
from foliage import grow,templates,instances
from wood import roots,mesh_paths
from junctions import uv_offsets,flow_surfaces
from releaf import wood_digest
from render import load
from surface import material
from linden_growth import crown_profile


def rebuild(o):
    for model in o['models']:
        species,variant=model.split('/');p=o['profiles'][species];source=Path(o['candidate'])/model;target=Path(o['output'])/model
        meta=json.loads((source/'model.json').read_text());file=source/'enhanced.blend';identity=hashlib.sha256(file.read_bytes()).hexdigest()
        if species!='silver_linden' or meta['revision']!='enhanced-linden-conical-v4' or identity!=meta['sha256']:raise RuntimeError('Expected authenticated accepted linden')
        if identity!=next(r['sha256'] for r in o['previousSources'] if r['id']==model):raise RuntimeError('Previous collection differs')
        if (target/'enhanced.blend').exists():raise RuntimeError('Preserve existing candidate')
        target.mkdir(parents=True,exist_ok=True)
        paths,lobes,rng,dimensions=scaffold(p,int(variant[-1]));roots(paths,p,rng)
        old=json.loads((source/'architecture.json').read_text())['paths'];retained_paths=len(paths)
        if any(not np.array_equal(r['points'],old[i]['points']) or not np.array_equal(r['radii'],old[i]['radii']) for i,r in enumerate(paths)):raise RuntimeError('Structural growth differs from the accepted tree')
        leaves,shoots,crowding=grow(p,paths,lobes,rng)
        print(f'[Enhanced] {model}: {len(shoots)} spaced shoots, {len(leaves)} leaves',flush=True)
        bpy.ops.wm.read_factory_settings(use_empty=True)
        wood,old_twigs=load(file,[model+' / enhanced wood',model+' / enhanced branchlets'])
        retained=wood_digest(wood.data);bark=old_twigs.data.materials[0]
        bpy.data.objects.remove(old_twigs,do_unlink=True)
        uv_offsets(paths);surfaces=flow_surfaces(paths)
        small=[r for r in surfaces if not (('growthRole' in r or r.get('root',False)) and (max(r['radii'])>=.060 or r.get('rootCrown',False)))]
        twigs=mesh_paths(model+' / enhanced branchlets',small,bark,p['barkTileMetres'],rng)
        front,leafmeta=material(o,species,'leaf_front');back,_=material(o,species,'leaf_back')
        forms=templates(o,species,[front,back],leafmeta,detailed_petioles=True);foliage=instances(model,leaves,forms)
        centers=np.asarray([r['bladeCenter'] for r in leaves]);origins=np.asarray([r['origin'] for r in leaves])
        if len(leaves)<3000 or not np.isfinite(centers).all():raise RuntimeError('Invalid canopy')
        profile=crown_profile(origins,meta['dimensions'])
        if profile['upperToLowerRadius']>=.80 or profile['middleToLowerRadius']>=1.10:raise RuntimeError('Lost the accepted conical silhouette')
        if wood_digest(wood.data)!=retained:raise RuntimeError('Changed accepted trunk geometry')
        revision='enhanced-linden-spaced-sprays-v5'
        for obj in [wood,twigs,foliage]:obj['species']=species;obj['variant']=variant;obj['referenceRevision']=revision
        counts=[triangles(m) for m in forms];previous_count=meta['leafCount']
        for key in ['retainedFoliageDigest','retainedLeafPrototypeDigests']:meta.pop(key,None)
        output=target/'enhanced.blend';bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(output),compress=True)
        meta.update(revision=revision,previousSha256=identity,codeIdentity=o['codeIdentity'],leafCount=len(leaves),previousLeafCount=previous_count,
                    branchPaths=len(paths),branchletTriangles=triangles(twigs.data),leafTemplateTriangles=counts,instancedLeafTriangles=sum(counts[l['form']] for l in leaves),
                    crowding=crowding,crownProfile=profile,preservedTrunkMeshDigest=retained,preservedStructuralPaths=retained_paths,
                    bounds={'min':np.minimum(centers.min(axis=0)-p['leafLength'],[0,0,0]).tolist(),'max':(centers.max(axis=0)+p['leafLength']).tolist()},
                    sha256=hashlib.sha256(output.read_bytes()).hexdigest())
        write_json(target/'model.json',meta)
        write_json(target/'architecture.json',{'paths':[{**r,'points':r['points'].tolist(),'radii':r['radii'].tolist()} for r in paths],'shoots':shoots})
        print('[Enhanced] Saved spaced linden; accepted trunk preserved '+model,flush=True)
