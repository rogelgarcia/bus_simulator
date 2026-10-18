# Removes complete fine-wood components and leaf instances without rebuilding surviving geometry.
import hashlib
import bpy
import numpy as np
from common import array
from junctions import flow_surfaces

ATTRIBUTE_TYPES={'FLOAT_VECTOR':('vector',3,np.float32),'FLOAT_COLOR':('color',4,np.float32),'INT':('value',1,np.int32),'FLOAT':('value',1,np.float32),'BOOLEAN':('value',1,np.bool_)}


def leaf_subset(source,ids,mapping):
    mesh=bpy.data.meshes.new(source.name+' pruned');mesh.vertices.add(len(ids));mesh.vertices.foreach_set('co',array(source.vertices,'co',3)[ids].ravel())
    for attr in source.attributes:
        if attr.name=='position' or attr.name.startswith('.') or attr.domain!='POINT':continue
        field,width,dtype=ATTRIBUTE_TYPES[attr.data_type];values=array(attr.data,field,width,dtype)[ids]
        if attr.name=='shoot_id':values=np.array([mapping[int(i)] for i in values],np.int32)
        mesh.attributes.new(attr.name,attr.data_type,'POINT').data.foreach_set(field,values.ravel())
        if not np.array_equal(array(mesh.attributes[attr.name].data,field,width,dtype),values):raise RuntimeError('Leaf attribute changed during subset')
    return mesh


def fine_ranges(paths,shrub):
    result=[];cursor=0
    for i,path in enumerate(flow_surfaces(paths)):
        major=max(path['radii'])>.018 or path.get('rootCollar',False) if shrub else ('growthRole' in path or path.get('root',False)) and (max(path['radii'])>=.060 or path.get('rootCrown',False))
        if major:continue
        sides=10 if max(path['radii'])>.01 else 6;count=sides*(len(path['points'])-1)+2
        result.append((i,cursor,cursor+count));cursor+=count
    return result,cursor


def wood_subset(source,paths,removed,mapping,shrub):
    ranges,total=fine_ranges(paths,shrub)
    if total!=len(source.polygons):raise RuntimeError('Saved branchlet topology differs from its graph')
    selected=np.concatenate([np.arange(a,b) for i,a,b in ranges if i not in removed])
    faces=[tuple(source.polygons[i].vertices) for i in selected];used=np.unique(np.concatenate(faces));lookup=np.full(len(source.vertices),-1,np.int32);lookup[used]=np.arange(len(used))
    loops=np.concatenate([np.arange(source.polygons[i].loop_start,source.polygons[i].loop_start+source.polygons[i].loop_total) for i in selected])
    mesh=bpy.data.meshes.new(source.name+' pruned');mesh.from_pydata(array(source.vertices,'co',3)[used],[],[lookup[list(f)] for f in faces])
    for material in source.materials:mesh.materials.append(material)
    for uv in source.uv_layers:mesh.uv_layers.new(name=uv.name).data.foreach_set('uv',array(uv.data,'uv',2)[loops].ravel())
    mesh.polygons.foreach_set('use_smooth',array(source.polygons,'use_smooth',dtype=np.bool_)[selected]);mesh.polygons.foreach_set('material_index',array(source.polygons,'material_index',dtype=np.int32)[selected])
    mesh.attributes.new('source_path','INT','FACE').data.foreach_set('value',np.concatenate([np.full(b-a,mapping[i],np.int32) for i,a,b in ranges if i not in removed]));mesh.update()
    if not np.array_equal(array(mesh.vertices,'co',3),array(source.vertices,'co',3)[used]):raise RuntimeError('Surviving wood moved')
    return mesh


def subset_digest(mesh,leaves=False):
    from releaf import wood_digest
    if not leaves:return wood_digest(mesh)
    h=hashlib.sha256(array(mesh.vertices,'co',3).tobytes())
    for name in ['leaf_form','leaf_scale','leaf_rotation','leaf_tint','spray_id','shoot_id','node_id','blade_center']:
        attr=mesh.attributes[name];field,width,dtype=ATTRIBUTE_TYPES[attr.data_type];h.update(array(attr.data,field,width,dtype).tobytes())
    return h.hexdigest()
