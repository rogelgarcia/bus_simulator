# Rebuilds linden wood from its preserved growth graph, retaining every leaf and authenticated comparison frame.
import hashlib
import json
import shutil
from pathlib import Path
import bpy
import numpy as np
from common import triangles,write_json
from refine import digest
from releaf import wood_digest
from spatial_poses import leaf_prototypes
from surface import material
from wood import build_wood
from wood_continuity import leader_sections,inspect_leader


def rebuild(o,model,source,target,meta):
    species,variant=model.split('/');p=o['profiles'][species]
    bpy.ops.wm.open_mainfile(filepath=str(source/'enhanced.blend'))
    foliage=bpy.data.objects[model+' / enhanced leaves'];retained=digest(foliage.data)
    prototypes=[wood_digest(obj.data) for obj in leaf_prototypes(foliage)]
    paths=json.loads((source/'architecture.json').read_text())['paths']
    for path in paths:path['points']=np.array(path['points']);path['radii']=np.array(path['radii'])
    sections=leader_sections(paths);before=inspect_leader(bpy.data.objects[model+' / enhanced wood'],sections)
    for role in ['wood','branchlets']:bpy.data.objects.remove(bpy.data.objects[model+' / enhanced '+role],do_unlink=True)
    bark,barkmeta=material(o,species,'bark')
    wood,twigs=build_wood(model,paths,p,bark,barkmeta,np.random.default_rng(p['seed']+int(variant[-1])*191))
    proof=inspect_leader(wood,sections)
    if not proof['passed']:raise RuntimeError('Rebuilt central leader still contains gaps: '+str(proof))
    if digest(foliage.data)!=retained or prototypes!=[wood_digest(obj.data) for obj in leaf_prototypes(foliage)]:raise RuntimeError('Wood rebuild changed foliage')
    for obj in [wood,twigs]:obj['species']=species;obj['variant']=variant;obj['referenceRevision']=meta['revision']
    output=target/'enhanced.blend';bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(output),compress=True)
    shutil.copyfile(source/'architecture.json',target/'architecture.json')
    meta.update(codeIdentity=o['codeIdentity'],refinedFrom={'file':str(source/'enhanced.blend'),'sha256':meta['sha256']},
                woodTriangles=triangles(wood.data),branchletTriangles=triangles(twigs.data),
                boleMinimumRadiusRatios=list(wood['boleMinimumRadiusRatios']),boleSections=json.loads(wood['boleSections']),
                leaderSections=sections,leaderContinuityBefore=before,leaderContinuity=proof,
                retainedFoliageDigest=retained,retainedLeafPrototypeDigests=prototypes,
                sha256=hashlib.sha256(output.read_bytes()).hexdigest())
    meta['barkProjection']={'method':wood['barkProjectionMethod'],'maximumDistance':wood['barkProjectionMaximumDistance']}
    write_json(target/'model.json',meta)
    manifest=source/'renders.json'
    if manifest.exists():
        records=[]
        for row in json.loads(manifest.read_text())['renders']:
            if row['state'] not in ['current','previous']:continue
            expected=meta['baselineSha256'] if row['state']=='current' else meta['previousSha256']
            image=source/Path(row['file']).name
            if row['sourceSha256']!=expected or hashlib.sha256(image.read_bytes()).hexdigest()!=row['sha256']:raise RuntimeError('Invalid retained comparison frame')
            shutil.copyfile(image,target/image.name);records.append({**row,'reusedFrom':str(image)})
        write_json(target/'renders.json',{'id':model,'engine':'CYCLES','device':'CPU','renders':records})
    print('[Enhanced] Rebuilt continuous linden wood '+model+' / '+str(proof),flush=True)
