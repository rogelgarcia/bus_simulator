# Extracts actual saved geometry for an isolated leafy shoot review, without remodeling its wood.
import json
import bpy
import numpy as np
from mathutils import Euler,Vector
from common import array
from junctions import flow_surfaces


def isolate(directory,objects,outer=False,root_override=None):
    graph=json.loads((directory/'architecture.json').read_text());paths=graph['paths']
    for r in paths:r['points']=np.asarray(r['points']);r['radii']=np.asarray(r['radii'])
    root=graph.get('studyRoot') if root_override is None else root_override
    if root is None:
        fan=any(r.get('shootRole')=='open-staggered-fan' for r in paths)
        candidates=[i for i,r in enumerate(paths) if r.get('shootDepth')==(0 if fan else 1)]
        if candidates:
            height=max(float(r['points'][-1,2]) for r in paths)
            root=max(candidates,key=lambda i:paths[i]['points'][-1]@np.array([.12,-1.,0.])-abs(paths[i]['points'][-1,2]-height*.66)*1.4) if outer else max(candidates,key=lambda i:paths[i]['points'][-1,2])
        else:
            candidates=sorted({r['parent'] for r in graph['shoots']})
            height=max(float(r['points'][-1,2]) for r in paths)
            view=np.array([1.,-8.,0.]);view/=np.linalg.norm(view)
            root=max(candidates,key=lambda i:paths[i]['points'][-1]@view-abs(paths[i]['points'][-1,2]-height*.60)*1.4)
    selected={root}
    for i,path in enumerate(paths):
        if path['parent'] in selected:selected.add(i)
    surfaces=flow_surfaces(paths);keep=[];cursor=0
    shrub=json.loads((directory/'model.json').read_text())['dimensions']['habit']=='shrub'
    for i,r in enumerate(surfaces):
        major=('growthRole' in r or r.get('root',False)) and (max(r['radii'])>=.060 or r.get('rootCrown',False))
        if shrub:major=max(r['radii'])>.018 or r.get('rootCollar',False)
        if major:continue
        sides=10 if max(r['radii'])>.01 else 6;count=sides*(len(r['points'])-1)+2
        if i in selected:keep.extend(range(cursor,cursor+count))
        cursor+=count
    source=objects[2].data
    if 'source_path' in source.attributes:keep=np.flatnonzero(np.isin(array(source.attributes['source_path'].data,'value',dtype=np.int32),list(selected)))
    elif cursor!=len(source.polygons):raise RuntimeError('Branchlet mesh ranges do not match saved topology')
    verts=array(source.vertices,'co',3);loop_ids=np.concatenate([np.arange(source.polygons[i].loop_start,source.polygons[i].loop_start+source.polygons[i].loop_total) for i in keep])
    faces=[tuple(source.polygons[i].vertices) for i in keep];used=np.unique(np.concatenate(faces));lookup={int(v):i for i,v in enumerate(used)}
    mesh=bpy.data.meshes.new('Isolated accepted branchlet');mesh.from_pydata(verts[used],[],[[lookup[v] for v in face] for face in faces])
    for material in source.materials:mesh.materials.append(material)
    for uv in source.uv_layers:mesh.uv_layers.new(name=uv.name).data.foreach_set('uv',array(uv.data,'uv',2)[loop_ids].ravel())
    mesh.polygons.foreach_set('use_smooth',np.ones(len(mesh.polygons),bool));mesh.update()
    twig=bpy.data.objects.new('Isolated actual shoot wood',mesh);bpy.context.scene.collection.objects.link(twig)
    source=objects[0].data;ids=np.flatnonzero(np.isin(array(source.attributes['shoot_id'].data,'value',dtype=np.int32),list(selected)))
    mesh=bpy.data.meshes.new('Isolated actual leaf origins');mesh.vertices.add(len(ids));mesh.vertices.foreach_set('co',array(source.vertices,'co',3)[ids].ravel())
    for attr in source.attributes:
        if attr.name in ['position'] or attr.domain!='POINT' or attr.name.startswith('.'):continue
        field,width,dtype={'FLOAT_VECTOR':('vector',3,np.float32),'FLOAT_COLOR':('color',4,np.float32),'INT':('value',1,np.int32),'FLOAT':('value',1,np.float32),'BOOLEAN':('value',1,np.bool_)}[attr.data_type]
        mesh.attributes.new(attr.name,attr.data_type,'POINT').data.foreach_set(field,array(attr.data,field,width,dtype)[ids].ravel())
    foliage=objects[0].copy();foliage.data=mesh;foliage.name='Isolated actual foliage';bpy.context.scene.collection.objects.link(foliage)
    if 'blade_center' in mesh.attributes:
        points=array(mesh.attributes['blade_center'].data,'vector',3);margin=.24
    else:
        points=array(mesh.vertices,'co',3);margin=float(np.max(array(mesh.attributes['leaf_scale'].data,'vector',3)))
    low=np.minimum(points.min(axis=0)-margin,verts[used].min(axis=0));high=np.maximum(points.max(axis=0)+margin,verts[used].max(axis=0))
    pose={'target':((low+high)*.5).tolist(),'offset':[1.,-8.,2.4],'span':float(max(high-low)*1.23)}
    if outer:
        rotations=array(mesh.attributes['leaf_rotation'].data,'vector',3)
        normal=np.mean([np.array(Euler(tuple(r)).to_matrix())[:,2] for r in rotations],axis=0);normal/=np.linalg.norm(normal)
        basis=np.array((-Vector(normal)).to_track_quat('-Z','Y').to_matrix())
        projected=np.concatenate([points,verts[used]])@basis
        low=projected.min(axis=0);high=projected.max(axis=0)
        margin=float(np.max(array(mesh.attributes['leaf_scale'].data,'vector',3)))*.65
        pose={'target':(basis@((low+high)*.5)).tolist(),'offset':(normal*8).tolist(),'span':float(max((high-low)[:2])+margin*2)*1.12}
    return [foliage,twig],pose
