# Rebuilds only fine shoot surfaces and foliage into card-ready outward-facing reference sprays.
import hashlib
import json
from pathlib import Path
import bpy
import numpy as np
from common import array,triangles,write_json,foliage_data
from dome_sprays import arrange_sprays
from fan_foliage import attachment,place_fans
from foliage import templates,instances
from junctions import uv_offsets,flow_surfaces
from releaf import wood_digest
from surface import material
from wood import mesh_paths


def fan_reference(o):
    for model in o['models']:
        species,variant=model.split('/');p=o['profiles'][species];source=Path(o['candidate'])/model;target=Path(o['output'])/model
        meta=json.loads((source/'model.json').read_text());file=source/'enhanced.blend';identity=hashlib.sha256(file.read_bytes()).hexdigest()
        if species!='london_plane' or meta['revision']!='enhanced-plane-spaced-foliage-v11' or identity!=meta['sha256']:raise RuntimeError('Dome foliage requires authenticated v11 London plane')
        if identity!=next(r['sha256'] for r in o['previousSources'] if r['id']==model):raise RuntimeError('Dome source differs from previous collection')
        if (target/'enhanced.blend').exists():raise RuntimeError('Preserve existing fan candidate')
        target.mkdir(parents=True,exist_ok=True);bpy.ops.wm.open_mainfile(filepath=str(file))
        wood=bpy.data.objects[model+' / enhanced wood'];retained=wood_digest(wood.data)
        graph=json.loads((source/'architecture.json').read_text());paths=graph['paths']
        for path in paths:path['points']=np.asarray(path['points']);path['radii']=np.asarray(path['radii'])
        old=bpy.data.objects[model+' / enhanced leaves'];data=foliage_data(old);mesh=old.data
        shoots=array(mesh.attributes['shoot_id'].data,'value',dtype=np.int32);nodes=array(mesh.attributes['node_id'].data,'value',dtype=np.int32)
        groups=array(mesh.attributes['spray_id'].data,'value',dtype=np.int32);tints=array(mesh.attributes['leaf_tint'].data,'color',4)
        accepted=[{'shoot':int(shoots[i]),'node':int(nodes[i]),'group':int(groups[i]),'form':int(data['forms'][i]),'size':float(data['scales'][i,0]),
                   'tint':tints[i,:3],'attachment':float(attachment(paths[shoots[i]],data['origins'][i]))} for i in range(len(shoots))]
        study_root=max((i for i,r in enumerate(paths) if r.get('shootDepth')==1),key=lambda i:paths[i]['points'][-1,2])
        selected={study_root}
        for i,path in enumerate(paths):
            if path['parent'] in selected:selected.add(i)
        old_centers=array(mesh.attributes['blade_center'].data,'vector',3)[np.isin(shoots,list(selected))]
        normals,arrangement=arrange_sprays(paths);rng=np.random.default_rng(p['seed']+int(variant[-1])*191+12117)
        leaves,crowding=place_fans(paths,normals,accepted,rng)
        front,leafmeta=material(o,species,'leaf_front');back,_=material(o,species,'leaf_back')
        forms=templates(o,species,[front,back],leafmeta,detailed_petioles=True,spread_petioles=True,flat_blades=True)
        bpy.data.objects.remove(old,do_unlink=True);foliage=instances(model,leaves,forms)
        old=bpy.data.objects[model+' / enhanced branchlets'];bark=old.data.materials[0];bpy.data.objects.remove(old,do_unlink=True)
        uv_offsets(paths);surfaces=flow_surfaces(paths)
        small=[r for r in surfaces if not (('growthRole' in r or r.get('root',False)) and (max(r['radii'])>=.060 or r.get('rootCrown',False)))]
        twigs=mesh_paths(model+' / enhanced branchlets',small,bark,p['barkTileMetres'],rng)
        if wood_digest(wood.data)!=retained:raise RuntimeError('Dome arrangement changed the preserved trunk')
        revision='enhanced-plane-dome-foliage-v12'
        for obj in [wood,twigs,foliage]:obj['species']=species;obj['variant']=variant;obj['referenceRevision']=revision
        output=target/'enhanced.blend';bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(output),compress=True)
        centers=np.array([l['bladeCenter'] for l in leaves]);counts=[triangles(m) for m in forms]
        study_centers=np.vstack([old_centers,[l['bladeCenter'] for l in leaves if l['shoot'] in selected]])
        low=study_centers.min(axis=0)-p['leafLength'];high=study_centers.max(axis=0)+p['leafLength']
        study_pose={'target':((low+high)*.5).tolist(),'offset':(normals[study_root]*8).tolist(),'span':float(max(high-low)*1.28)}
        meta.pop('preservedWoodMeshDigests',None)
        meta.update(revision=revision,previousSha256=identity,codeIdentity=o['codeIdentity'],preservedTrunkMeshDigest=retained,
                    leafCount=len(leaves),previousLeafCount=len(accepted),crowding=crowding,sprayArrangement=arrangement,sprayStudyPose=study_pose,
                    branchletTriangles=triangles(twigs.data),leafTemplateTriangles=counts,instancedLeafTriangles=sum(counts[l['form']] for l in leaves),
                    bounds={'min':np.minimum(centers.min(axis=0)-p['leafLength'],[0,0,0]).tolist(),'max':(centers.max(axis=0)+p['leafLength']).tolist()},
                    sha256=hashlib.sha256(output.read_bytes()).hexdigest())
        write_json(target/'model.json',meta);write_json(target/'architecture.json',{'paths':[{**r,'points':r['points'].tolist(),'radii':r['radii'].tolist()} for r in paths],'shoots':graph['shoots'],'studyRoot':study_root})
        print('[Enhanced] Outward fans '+model+'; retained '+str(len(leaves))+' leaves and exact trunk mesh',flush=True)
