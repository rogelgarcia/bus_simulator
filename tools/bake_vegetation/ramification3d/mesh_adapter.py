# Adapts shared-grammar centerlines to the existing longitudinal mesh and fork-surface builders.
import json
import bpy
import numpy as np
from wood import mesh_paths,check_bounds
from junctions import flow_surfaces
from common import activate,array
from fork_review import make_fork,connected_vertices


def coordinates(points):
    p=np.asarray(points,dtype=float)
    return p[:,[0,2,1]]*np.array([1.,-1.,1.])


def adapt(graph):
    paths=[]
    for p in graph['paths']:
        knots=sorted(set([i/(len(p['points'])-1) for i in range(len(p['points']))]+[graph['paths'][i]['parentT'] for i in p['children']]))
        original=np.linspace(0,1,len(p['points']));points=coordinates(p['points'])
        paths.append({**p,'points':np.column_stack([np.interp(knots,original,points[:,k]) for k in range(3)]),
                      'radii':np.interp(knots,original,p['radii']),'knots':knots,'phase':0.,'basal':False,
                      'growthRole':p['role'],'junctionMode':'inherited-tangent','uvOffset':0.})
    for p in paths:
        if p['parent']>=0:p['parentNode']=paths[p['parent']]['knots'].index(p['parentT'])
    return paths


def create_material(name,color):
    material=bpy.data.materials.new(name);material.diffuse_color=(*color,1);material.use_nodes=True
    bsdf=material.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(*color,1);bsdf.inputs['Roughness'].default_value=.8
    return material


def fuse(obj,paths,voxel,before_smooth=None):
    activate(obj)
    modifier=obj.modifiers.new('Shared fork and collar union','REMESH');modifier.mode='VOXEL';modifier.voxel_size=voxel;modifier.use_smooth_shade=True
    bpy.ops.object.modifier_apply(modifier=modifier.name);check_bounds(obj,paths,'ramification voxel union')
    if before_smooth:before_smooth(obj)
    smooth=obj.modifiers.new('Local surface continuity','SMOOTH');smooth.factor=.5;smooth.iterations=3
    bpy.ops.object.modifier_apply(modifier=smooth.name);check_bounds(obj,paths,'ramification smoothing')
    obj.data.polygons.foreach_set('use_smooth',np.ones(len(obj.data.polygons),bool))
    return obj


def build(graph):
    paths=adapt(graph);surfaces=flow_surfaces(paths);rng=np.random.default_rng(graph['settings']['seed'])
    material=create_material('Neutral wood',(.14,.12,.095))
    base=max(p['baseRadius'] for p in paths);threshold=max(.006,base*.075);voxel=max(.0015,min(.022,threshold*.32))
    major=[p for p in surfaces if p['baseRadius']>=threshold and p['children']]
    major_ids={p['id'] for p in major};minor=[p for p in surfaces if p['id'] not in major_ids]
    wood=mesh_paths('Wood / continuous major junctions',major,material,1.,rng,True);fuse(wood,major,voxel)
    fine=mesh_paths('Wood / finer subdivisions',minor,material,1.,rng,False)
    print('[Ramification3D] Meshed all '+str(len(paths))+' axes',flush=True)
    roots=[]
    for p in graph['roots']['paths']+graph['roots']['collars']:
        roots.append({**p,'points':coordinates(p['points']),'radii':np.array(p['radii']),'phase':0.,'basal':False})
    crown=graph['roots']['crown']
    if crown:
        center=np.array([0.,0.,-base*.6])
        for a in graph['base']['anchors']:
            anchor=coordinates([a['point']])[0];radius=a['radius']*1.3
            roots.append({'points':np.linspace(center,anchor,7),'radii':np.linspace(radius*1.3,radius,7),'phase':0.,'basal':False})
    print('[Ramification3D] Meshing '+str(len(roots))+' root axes',flush=True)
    root=mesh_paths('Roots / full underground graph and crown',roots,material,1.,rng,False) if roots else None
    print('[Ramification3D] Root mesh complete',flush=True)
    colors=[(.32,.22,.13),(.68,.21,.06),(.84,.51,.06),(.22,.52,.16),(.035,.52,.58),(.12,.29,.76),(.48,.19,.66),(.75,.16,.38),(.27,.24,.31)]
    levels=[]
    for level in sorted(set(p['level'] for p in paths)):
        print('[Ramification3D] Diagnostic level '+str(level),flush=True)
        obj=mesh_paths('Diagnostic / level '+str(level),[p for p in surfaces if p['level']==level],create_material('Level '+str(level),colors[level%len(colors)]),1.,rng,False)
        obj['generationLevel']=level;obj.hide_render=True;obj.hide_set(True);levels.append(obj)
    candidates=[p for p in paths if p['level']==1 and len(p['children'])>=2]
    selected=max(candidates,key=lambda p:p['span'])
    family={selected['id']}
    for p in paths:
        if p['parent'] in family:family.add(p['id'])
    subtree=mesh_paths('Diagnostic / isolated subtree '+selected['key'],[p for p in surfaces if p['id'] in family],material,1.,rng,False)
    subtree['ancestryKey']=selected['key'];subtree.hide_render=True;subtree.hide_set(True)
    fork,fork_selection=make_fork(paths,wood,major_ids)
    for obj in [wood,fine,root,*levels,subtree,fork]:
        if obj:obj['generator']=graph['generator'];obj['species']=graph['settings']['species'];obj['seed']=graph['settings']['seed']
    return {'wood':wood,'fine':fine,'root':root,'levels':levels,'subtree':subtree,'fork':fork,'forkSelection':fork_selection,'paths':paths,'surfaces':surfaces,'voxel':voxel,'threshold':threshold,'subtreeId':selected['id'],'majorIds':sorted(major_ids)}


def inspect_saved(graph,meta):
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    import bmesh
    rows=[]
    for name in meta['meshes']:
        obj=bpy.data.objects[name];mesh=obj.data;co=array(mesh.vertices,'co',3);normal=array(mesh.polygons,'normal',3)
        bm=bmesh.new();bm.from_mesh(mesh)
        boundary=sum(not e.is_manifold for e in bm.edges);volume=bm.calc_volume(signed=True)
        connected=True
        if name==meta['fork']:
            bm.verts.ensure_lookup_table();connected=len(bm.verts)>0 and len(connected_vertices(bm.verts[0]))==len(bm.verts)
        bm.free()
        finite=bool(np.isfinite(co).all() and np.isfinite(normal).all())
        proof={'name':name,'vertices':len(mesh.vertices),'faces':len(mesh.polygons),'nonManifoldEdges':boundary,'signedVolume':volume,'finite':finite,
               'unitNormals':bool(np.allclose(np.linalg.norm(normal,axis=1),1,atol=1e-5))}
        proof['intentionallyCut']=name==meta['fork']
        proof['connectedJunctionCrop']=connected
        proof['passed']=finite and connected and (proof['intentionallyCut'] or boundary==0 and volume>0) and proof['unitNormals'];rows.append(proof)
    obj=bpy.data.objects[meta['wood']];tree=BVHTree.FromObject(obj,bpy.context.evaluated_depsgraph_get());samples=[]
    paths=adapt(graph)
    for p in paths:
        if p['parent']<0 or p['id'] not in meta['majorIds']:continue
        point=p['points'][0];nearest=tree.find_nearest(Vector(point));distance=float(nearest[3]) if nearest[0] else 0.
        signed=float(np.dot(point-np.array(nearest[0]),np.array(nearest[1])))
        samples.append(distance/max(p['baseRadius'],1e-9) if signed<0 else -distance/max(p['baseRadius'],1e-9))
    connection={'majorAttachments':len(samples),'minimumInteriorRadiusRatio':min(samples,default=1.),'passed':min(samples,default=1.)>.30}
    co=array(bpy.data.objects[meta['fine']].data.vertices,'co',3);offset=0;ring_error=0.;radius_error=0.
    for p in flow_surfaces(paths):
        if p['id'] in meta['majorIds']:continue
        sides=10 if max(p['radii'])>.01 else 6;count=len(p['points']);rings=co[offset:offset+count*sides].reshape((count,sides,3));offset+=count*sides
        ring_error=max(ring_error,float(np.max(np.linalg.norm(rings.mean(axis=1)-p['points'],axis=1)/p['radii'])))
        measured=np.linalg.norm(rings-p['points'][:,None,:],axis=2).mean(axis=1)
        radius_error=max(radius_error,float(np.max(np.abs(measured-p['radii'])/p['radii'])))
    fidelity={'maximumCenterErrorInRadii':ring_error,'maximumRelativeRadiusError':radius_error,'allVerticesAccounted':offset==len(co),'passed':offset==len(co) and ring_error<.03 and radius_error<.03}
    source=bpy.data.texts['Shared branching graph.json'].as_string();same=json.loads(source)==graph
    return {'meshes':rows,'junctionInterior':connection,'fineAxisFidelity':fidelity,'embeddedGraphMatches':same,'passed':all(r['passed'] for r in rows) and connection['passed'] and fidelity['passed'] and same}
