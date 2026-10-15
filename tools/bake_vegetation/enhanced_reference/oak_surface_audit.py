# Verifies that a fork-surface revision retains the authenticated growth graph, leaf instances and fine-wood geometry.
import hashlib
from pathlib import Path
import bpy
from common import array
from refine import digest
from releaf import wood_digest
from spatial_poses import leaf_prototypes


def leaf_digest(mesh):
    h=hashlib.sha256(digest(mesh).encode())
    for attr in mesh.attributes:
        if attr.data_type=='FLOAT_COLOR':h.update(array(attr.data,'color',4).tobytes())
    return h.hexdigest()


def audit_preservation(model,meta,folder,previous):
    if previous['sha256']!=meta['previousSha256']:raise RuntimeError('Fork revision has the wrong preserved predecessor')
    source=Path(previous['file'])
    if hashlib.sha256(source.read_bytes()).hexdigest()!=previous['sha256']:raise RuntimeError('Preserved fork predecessor changed')
    names=[model+' / enhanced '+role for role in ['leaves','branchlets']]
    current=[bpy.data.objects[name] for name in names]
    with bpy.data.libraries.load(str(source),link=False) as (available,data):data.objects=names
    original=data.objects
    proof={'role':'preserved growth and foliage',
           'architectureIdentical':(folder/'architecture.json').read_bytes()==(source.parent/'architecture.json').read_bytes(),
           'leafInstancesIdentical':leaf_digest(current[0].data)==leaf_digest(original[0].data),
           'leafPrototypesIdentical':[wood_digest(obj.data) for obj in leaf_prototypes(current[0])]==[wood_digest(obj.data) for obj in leaf_prototypes(original[0])],
           'fineWoodIdentical':wood_digest(current[1].data)==wood_digest(original[1].data)}
    proof['passed']=all(value for key,value in proof.items() if key!='role')
    for obj in original:bpy.data.objects.remove(obj,do_unlink=True)
    return proof
