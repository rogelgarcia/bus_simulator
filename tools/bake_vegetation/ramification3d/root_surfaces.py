# Develops continuous basal surfaces around the unchanged shared root graph, retaining every fine tip.
import math
import bpy
import numpy as np
from common import activate,array
from wood import mesh_paths
from mesh_adapter import coordinates,fuse
from bark_projection import transfer
from surface_volume import signed_volume,is_remesh_sliver


def root_paths(graph):
    roots=[{**p,'points':coordinates(p['points']),'radii':np.array(p['radii']),'phase':0.,'basal':False} for p in graph['roots']['paths']]
    additions=[]
    for anchor,collar in zip(graph['base']['anchors'],graph['roots']['collars']):
        origin=coordinates([anchor['point']])[0];radius=anchor['radius'];points=coordinates(collar['points'])
        hosted=[p for p in roots if p['parent']<0 and np.linalg.norm(p['points'][0]-origin)<1e-7]
        flares=[]
        for root in hosted:
            direction=root['points'][min(3,len(root['points'])-1)]-origin
            if np.linalg.norm(direction[:2])<radius*.1:continue
            flares.append({'angle':math.atan2(direction[1],direction[0]),'width':.45,'strength':graph['settings']['rootFlare']*.85})
            end_index=min(len(root['points'])-2,max(2,int(np.argmin(abs(np.linalg.norm(root['points']-origin,axis=1)-radius*2.8)))) )
            end=root['points'][end_index];start=points[min(len(points)-1,16)];t=np.linspace(0,1,17)[:,None]
            controls=np.array([start,start*.45+(origin+direction/np.linalg.norm(direction)*radius)*.55,end+[0,0,radius*.35],end])
            shoulder=(1-t)**3*controls[0]+3*(1-t)**2*t*controls[1]+3*(1-t)*t*t*controls[2]+t**3*controls[3]
            additions.append({'points':shoulder,'radii':np.linspace(radius*.48,root['radii'][end_index]*1.08,len(t)),'phase':0.,'basal':False})
        trunk=graph['paths'][anchor['shoot']];u=np.linspace(0,collar['span']/trunk['span'],len(points));radii=np.interp(u,np.linspace(0,1,len(trunk['radii'])),trunk['radii'])
        radii*=1-.18*np.clip((np.linspace(0,1,len(points))-.5)/.5,0,1)**2
        additions.append({'points':np.vstack([origin+[0,0,-radius*.7],points]),'radii':np.r_[radii[0],radii],'phase':0.,'basal':False,'uvOffset':-radius*.7,
                          'rootFlares':flares,'rootFlareHeight':radius*.85*graph['settings']['rootFlareHeight']})
    if graph['roots']['crown']:
        anchors=graph['base']['anchors'];center=np.mean(coordinates([a['point'] for a in anchors]),axis=0);base=max(a['radius'] for a in anchors);center[2]=-base*1.8
        for a in anchors:
            end=coordinates([a['point']])[0];end[2]=-a['radius']*1.5
            additions.append({'points':np.linspace(center,end,13),'radii':np.linspace(base*1.4,a['radius']*1.15,13),'phase':0.,'basal':False,'rootCrownLink':True})
    return roots,additions


def fill_voxel_pockets(obj,voxel,slivers,minimum_source_diameter):
    import bmesh
    bm=bmesh.new();bm.from_mesh(obj.data);remaining=set(bm.verts);components=[]
    while remaining:
        first=next(iter(remaining));component={first};pending=[first]
        while pending:
            for edge in pending.pop().link_edges:
                for vertex in edge.verts:
                    if vertex not in component:component.add(vertex);pending.append(vertex)
        components.append(component);remaining-=component
    components.sort(key=len,reverse=True);filled=[]
    for component in components[1:]:
        points=np.array([v.co[:] for v in component]);extent=float(np.ptp(points,axis=0).max())
        if extent>voxel*4:continue
        faces={f for v in component for f in v.link_faces};volume=signed_volume([[v.co[:] for v in f.verts] for f in faces])
        if volume<0 and abs(volume)<voxel**3*8 and all(e.is_manifold for v in component for e in v.link_edges):
            filled.append({'vertices':len(component),'negativeVolume':volume,'maximumExtent':extent});bmesh.ops.delete(bm,geom=list(component),context='VERTS')
        elif is_remesh_sliver(len(component),[len(f.verts) for f in faces],volume,extent,voxel,minimum_source_diameter) and all(e.is_manifold for v in component for e in v.link_edges):
            slivers.append({'vertices':len(component),'faceSizes':[len(f.verts) for f in faces],'positiveVolume':volume,'maximumExtent':extent})
            bmesh.ops.delete(bm,geom=list(component),context='VERTS')
    bm.to_mesh(obj.data);bm.free();obj.data.update();return filled


def build_roots(graph,material,tile):
    roots,additions=root_paths(graph);base=max(a['radius'] for a in graph['base']['anchors']);voxel=max(.0015,min(.012,base*.032));threshold=voxel*3.5
    crown_top=max((float(np.max(p['points'][:,2]+p['radii']*1.04)) for p in additions if p.get('rootCrownLink')),default=None)
    if crown_top is not None and crown_top>=0:raise RuntimeError('Shared crown connectors must stay below soil grade')
    major=list(additions);fine=[];splits=[]
    for p in roots:
        usable=np.flatnonzero(p['radii']>=threshold)
        if len(usable)>=3:
            end=int(usable[-1]);major.append({**p,'points':p['points'][:end+1],'radii':p['radii'][:end+1]})
            start=max(0,end-1);fine.append({**p,'points':p['points'][start:],'radii':p['radii'][start:]});splits.append({'id':p['id'],'fineStart':start})
        else:fine.append(p);splits.append({'id':p['id'],'fineStart':0})
    rng=np.random.default_rng(graph['settings']['seed']+6001)
    source=mesh_paths('Temporary / root source charts',major,material,tile,rng,True)
    root=source.copy();root.data=source.data.copy();root.name='Roots / continuous collars and full fine graph';root.data.name=root.name;bpy.context.scene.collection.objects.link(root)
    filled=[];slivers=[];minimum_source_diameter=float(min(np.min(p['radii'])*2 for p in major))
    fuse(root,major,voxel,lambda obj:filled.extend(fill_voxel_pockets(obj,voxel,slivers,minimum_source_diameter)))
    filled.extend(fill_voxel_pockets(root,voxel,slivers,minimum_source_diameter))
    if not root.data.uv_layers:root.data.uv_layers.new(name='UVMap')
    transfer(root,source,voxel);bpy.data.objects.remove(source,do_unlink=True)
    major_vertices=len(root.data.vertices);major_faces=len(root.data.polygons)
    tips=mesh_paths('Temporary / retained root tips',fine,material,tile,rng,False)
    fine_vertices=len(tips.data.vertices)
    activate(root);tips.select_set(True);bpy.ops.object.join()
    return root,{'voxelMetres':voxel,'majorVertices':major_vertices,'majorFaces':major_faces,'fineVertices':fine_vertices,'graphPaths':len(roots),'collars':len(graph['base']['anchors']),'sealedVoxelPockets':filled,
                 'removedRemeshSlivers':slivers,'minimumCoarseSourceDiameter':minimum_source_diameter,'buttresses':len(additions)-len(graph['base']['anchors'])*(2 if graph['roots']['crown'] else 1),'splits':splits,'crownBelowGrade':bool(graph['roots']['crown']),'crownMaximumSurfaceHeight':crown_top}


def audit_roots(graph,root,receipt):
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    import bmesh
    mesh=root.data;co=array(mesh.vertices,'co',3);tree=BVHTree.FromObject(root,bpy.context.evaluated_depsgraph_get())
    bm=bmesh.new();bm.from_mesh(mesh);bm.verts.ensure_lookup_table();seen={bm.verts[0]};pending=[bm.verts[0]]
    while pending:
        for edge in pending.pop().link_edges:
            for vertex in edge.verts:
                if vertex.index<receipt['majorVertices'] and vertex not in seen:seen.add(vertex);pending.append(vertex)
    connected=len(seen)==receipt['majorVertices'];components=[{'vertices':len(seen)}];remaining=set(list(bm.verts)[:receipt['majorVertices']])-seen
    while remaining:
        first=next(iter(remaining));component={first};pending=[first]
        while pending:
            for edge in pending.pop().link_edges:
                for vertex in edge.verts:
                    if vertex.index<receipt['majorVertices'] and vertex not in component:component.add(vertex);pending.append(vertex)
        points=np.array([v.co[:] for v in component]);faces={f for v in component for f in v.link_faces};volume=signed_volume([[v.co[:] for v in f.verts] for f in faces])
        components.append({'vertices':len(component),'bounds':[points.min(axis=0).tolist(),points.max(axis=0).tolist()],'volume':volume});remaining-=component
    bm.free()
    connections=[]
    for a,c in zip(graph['base']['anchors'],graph['roots']['collars']):
        point=coordinates([c['points'][5]])[0];hit=tree.find_nearest(Vector(point));signed=float(np.dot(point-np.asarray(hit[0]),np.asarray(hit[1])))
        connections.append({'anchor':a['id'],'interiorDepthInRadii':-signed/a['radius']})
    roots,_=root_paths(graph);offset=receipt['majorVertices'];max_error=0.
    for split in receipt['splits']:
        p=roots[split['id']];start=split['fineStart'];points=p['points'][start:];radii=p['radii'][start:];sides=10 if max(radii)>.01 else 6
        rings=co[offset:offset+len(points)*sides].reshape(len(points),sides,3);offset+=len(points)*sides
        max_error=max(max_error,float(np.max(np.linalg.norm(rings.mean(axis=1)-points,axis=1)/radii)))
    return {'anchors':connections,'retainedTips':len(roots),'maximumFineCenterErrorInRadii':max_error,'allVerticesAccounted':offset==len(co),'coarseRootsConnected':connected,'components':components,
            'passed':connected and min(r['interiorDepthInRadii'] for r in connections)>.5 and max_error<.04 and offset==len(co)}
