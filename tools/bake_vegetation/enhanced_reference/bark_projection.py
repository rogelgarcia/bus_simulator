# Projects each small remeshed face onto one source bark chart without blending across its UV seam.
import numpy as np


def affine_uv(points,triangles,uv):
    a=triangles[:,0];u=triangles[:,1]-a;v=triangles[:,2]-a;q=points-a
    uu=np.einsum('ij,ij->i',u,u);uvv=np.einsum('ij,ij->i',u,v);vv=np.einsum('ij,ij->i',v,v)
    qu=np.einsum('ij,ij->i',q,u);qv=np.einsum('ij,ij->i',q,v);denominator=uu*vv-uvv*uvv
    if np.any(denominator<=1e-20):raise RuntimeError('Degenerate bark chart triangle')
    b=(qu*vv-qv*uvv)/denominator;c=(qv*uu-qu*uvv)/denominator
    return uv[:,0]+b[:,None]*(uv[:,1]-uv[:,0])+c[:,None]*(uv[:,2]-uv[:,0])


def transfer(obj,source,voxel):
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    from common import array
    mesh=source.data;mesh.calc_loop_triangles();source_points=array(mesh.vertices,'co',3).astype(np.float64)
    indices=np.empty((len(mesh.loop_triangles),3),np.int32);mesh.loop_triangles.foreach_get('vertices',indices.ravel())
    loops=np.empty_like(indices);mesh.loop_triangles.foreach_get('loops',loops.ravel())
    corners=source_points[indices];area=np.linalg.norm(np.cross(corners[:,1]-corners[:,0],corners[:,2]-corners[:,0]),axis=1)
    valid=area>1e-10;indices=indices[valid];loops=loops[valid];corners=corners[valid]
    chart=array(mesh.uv_layers.active.data,'uv',2).astype(np.float64)[loops]
    tree=BVHTree.FromPolygons(source_points.tolist(),indices.tolist(),all_triangles=True)
    target=obj.data;points=array(target.vertices,'co',3).astype(np.float64)
    vertex_ids=np.empty(len(target.loops),np.int32);target.loops.foreach_get('vertex_index',vertex_ids)
    starts=np.empty(len(target.polygons),np.int32);counts=np.empty_like(starts)
    target.polygons.foreach_get('loop_start',starts);target.polygons.foreach_get('loop_total',counts)
    loop_points=points[vertex_ids];centers=np.add.reduceat(loop_points,starts,axis=0)/counts[:,None]
    nearest=[tree.find_nearest(Vector(p)) for p in centers]
    if any(hit[2] is None for hit in nearest):raise RuntimeError('Unmapped bark surface')
    distances=np.array([hit[3] for hit in nearest]);face_triangles=np.array([hit[2] for hit in nearest],np.int32)
    if distances.max()>voxel*6:raise RuntimeError('Bark chart projection is too far from the source surface')
    triangle_ids=np.repeat(face_triangles,counts);result=affine_uv(loop_points,corners[triangle_ids],chart[triangle_ids])
    if not np.isfinite(result).all():raise RuntimeError('Non-finite bark coordinates')
    target.uv_layers.active.data.foreach_set('uv',result.astype(np.float32).ravel())
    obj['barkProjectionMaximumDistance']=float(distances.max());obj['barkProjectionMethod']='Nearest source triangle per face; affine UV projection'
    if 'forkChartNeighbours' in source:
        from fork_charts import alternate_chart
        alternate_chart(obj,source,valid,face_triangles,distances,centers,loop_points,counts,corners,chart,voxel)
        obj['barkProjectionMethod']='Adjacent branch-aligned charts; local surface-distance blend'
    print('[Enhanced] Projected bark charts: '+str(len(centers))+' faces, maximum distance '+str(float(distances.max())),flush=True)
