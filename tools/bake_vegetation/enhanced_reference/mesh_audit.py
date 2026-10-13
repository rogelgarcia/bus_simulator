# Audits saved final mesh coordinates independently from their source growth curves.
import hashlib
import json
from pathlib import Path
import bpy
import numpy as np
from common import array,write_json


def audit_objects(model,meta):
    roles=[]
    for role in ['wood','branchlets']:
        obj=bpy.data.objects[model+' / enhanced '+role];co=array(obj.data.vertices,'co',3)
        edges=array(obj.data.edges,'vertices',2,np.int32);length=np.linalg.norm(co[edges[:,0]]-co[edges[:,1]],axis=1)
        outside=np.flatnonzero((np.abs(co[:,:2])>meta['dimensions']['radiusTarget']*3).any(axis=1)|(co[:,2]<-3)|(co[:,2]>meta['dimensions']['heightTarget']*1.7)|~np.isfinite(co).all(axis=1))
        maximum=float(length.max());limit=.25 if role=='wood' else max(1,meta['dimensions']['radiusTarget']*.5)
        roles.append({'role':role,'min':co.min(axis=0).tolist(),'max':co.max(axis=0).tolist(),'maximumEdge':maximum,'edgeLimit':limit,'outlierCount':len(outside),'outlierSample':[{'index':int(i),'co':co[i].tolist()} for i in outside[:8]],'passed':bool(len(outside)==0 and np.isfinite(maximum) and maximum<limit)})
        if 'preservedWoodMeshDigests' in meta:
            from releaf import wood_digest
            matches=wood_digest(obj.data)==meta['preservedWoodMeshDigests'][len(roles)-1]
            roles[-1]['preservedSourceMeshMatches']=matches;roles[-1]['passed']&=matches
        if role=='wood' and 'preservedTrunkMeshDigest' in meta:
            from releaf import wood_digest
            matches=wood_digest(obj.data)==meta['preservedTrunkMeshDigest']
            roles[-1]['preservedSourceMeshMatches']=matches;roles[-1]['passed']&=matches
    return {'id':model,'sha256':meta['sha256'],'roles':roles,'passed':all(r['passed'] for r in roles)}


def inspect(o):
    rows=[]
    for model in o['models']:
        folder=Path(o['candidate'])/model;meta=json.loads((folder/'model.json').read_text());file=folder/'enhanced.blend'
        if hashlib.sha256(file.read_bytes()).hexdigest()!=meta['sha256']:raise RuntimeError('Candidate identity differs')
        bpy.ops.wm.open_mainfile(filepath=str(file));rows.append(audit_objects(model,meta));print('[Enhanced audit] '+json.dumps(rows[-1]),flush=True)
    write_json(Path(o['output'])/'mesh-audit.json',{'models':rows,'passed':all(r['passed'] for r in rows)})
    if not all(r['passed'] for r in rows):raise RuntimeError('Saved mesh audit failed: '+', '.join(r['id'] for r in rows if not r['passed']))
