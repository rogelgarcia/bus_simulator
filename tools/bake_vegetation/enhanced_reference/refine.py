# Refines a verified staged wood surface without rebuilding or changing its foliage.
import hashlib
import json
import shutil
from pathlib import Path
import bpy
import numpy as np
from common import activate,array,triangles,write_json
from junctions import relax_forks


def digest(mesh):
    h=hashlib.sha256(array(mesh.vertices,'co',3).tobytes())
    for attr in mesh.attributes:
        field='vector' if attr.data_type=='FLOAT_VECTOR' else 'value' if attr.data_type in ['FLOAT','INT','BOOLEAN'] else None
        if field:h.update(array(attr.data,field,3 if field=='vector' else 1,np.int32 if attr.data_type=='INT' else np.bool_ if attr.data_type=='BOOLEAN' else np.float32).tobytes())
    return h.hexdigest()


def refine(o):
    for model in o['models']:
        source=Path(o['candidate'])/model;target=Path(o['output'])/model;file=source/'enhanced.blend'
        meta=json.loads((source/'model.json').read_text());identity=hashlib.sha256(file.read_bytes()).hexdigest()
        if identity!=meta['sha256'] or meta['revision']!='enhanced-shared-forks-v2':raise RuntimeError('Expected authenticated unsmoothed shared-fork candidate')
        if meta['baselineSha256']!=next(r['sha256'] for r in o['sources'] if r['id']==model):raise RuntimeError('Wrong candidate baseline')
        if meta['previousSha256']!=next(r['sha256'] for r in o['previousSources'] if r['id']==model):raise RuntimeError('Wrong previous enhanced reference')
        if (target/'enhanced.blend').exists():raise RuntimeError('Preserve existing refined candidate')
        target.mkdir(parents=True,exist_ok=True);bpy.ops.wm.open_mainfile(filepath=str(file))
        wood=bpy.data.objects[model+' / enhanced wood'];foliage=bpy.data.objects[model+' / enhanced leaves'];twigs=bpy.data.objects[model+' / enhanced branchlets']
        retained=[digest(obj.data) for obj in [foliage,twigs]];old=array(wood.data.vertices,'co',3)
        paths=json.loads((source/'architecture.json').read_text())['paths']
        for path in paths:path['points']=np.asarray(path['points']);path['radii']=np.asarray(path['radii'])
        activate(wood);relax_forks(wood,paths,.022)
        updated=array(wood.data.vertices,'co',3);shift=np.linalg.norm(updated-old,axis=1)
        if not np.isfinite(updated).all() or shift.max()>.22:raise RuntimeError('Excessive fork relaxation')
        if retained!=[digest(obj.data) for obj in [foliage,twigs]]:raise RuntimeError('Refinement changed retained foliage')
        if triangles(wood.data)!=meta['woodTriangles']:raise RuntimeError('Refinement changed topology')
        revision='enhanced-shared-forks-v3'
        for obj in [wood,foliage,twigs]:obj['referenceRevision']=revision
        output=target/'enhanced.blend';bpy.ops.wm.save_as_mainfile(filepath=str(output),compress=True)
        shutil.copyfile(source/'architecture.json',target/'architecture.json')
        meta.update(revision=revision,codeIdentity=o['codeIdentity'],refinedFrom={'file':str(file),'sha256':identity},maximumForkRelaxationMetres=float(shift.max()),retainedFoliageAndTwigs=True,sha256=hashlib.sha256(output.read_bytes()).hexdigest())
        write_json(target/'model.json',meta);print('[Enhanced] Refined shared fork shoulders '+model,flush=True)
