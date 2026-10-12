# Loads only the authenticated point layout and original photographed leaf prototypes.
import bpy
import numpy as np
from mathutils import Euler
from common import array,foliage_data


def load(row,wood=False):
    names=[row['id']+' / natural leaves']
    if wood:names += [row['id']+' / original wood',row['id']+' / curved branchlets']
    with bpy.data.libraries.load(row['file'],link=False) as (available,loaded):
        if any(n not in available.objects for n in names):raise RuntimeError('Missing reference objects')
        loaded.objects=names+[f'{row["id"]}_form_{i:02}' for i in range(9)]
    for obj in loaded.objects[:len(names)]:
        bpy.context.scene.collection.objects.link(obj);obj.hide_render=False;obj.hide_viewport=False;obj.hide_set(False)
    obj=loaded.objects[0]
    if len(obj.data.vertices)!=row['leafCount']:raise RuntimeError('Leaf index mismatch')
    data=foliage_data(obj)
    data['matrices']=np.array([np.array(Euler(tuple(r)).to_matrix()) for r in data['rotations']])*data['scales'][:,None,:]
    data['centers']=data['origins']+data['matrices'][:,:,1]*.48
    data['groups']=array(obj.data.attributes['spray_id'].data,'value',dtype=np.int32)
    data['tints']=array(obj.data.attributes['leaf_tint'].data,'color',4)
    return loaded.objects[:len(names)],data


def prototypes(model):
    result=[]
    for i in range(9):
        obj=bpy.data.objects[f'{model}_form_{i:02}'];mesh=obj.data;mesh.calc_loop_triangles()
        loops=array(mesh.loop_triangles,'loops',3,np.int32)
        result.append({'points':array(mesh.vertices,'co',3),'faces':array(mesh.loop_triangles,'vertices',3,np.int32),
            'uv':array(mesh.uv_layers.active.data,'uv',2)[loops].reshape((-1,2)),'material':mesh.materials[0]})
    return result
