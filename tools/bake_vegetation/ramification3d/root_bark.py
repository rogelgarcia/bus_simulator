# Shares the trunk's basal bark field with its roots while retaining upper branch charts.
import math
import numpy as np
from common import array
from mesh_adapter import adapt,coordinates
from junctions import flow_surfaces
from root_flow import growth_coordinates,unwrap_faces,collar_weight,stem_owners


def apply_root_flow(graph,wood,root,tile):
    stems=flow_surfaces(adapt(graph));anchors=graph['base']['anchors'];records=[]
    root_groups=[[{**p,'points':coordinates(p['points'])} for p in graph['roots']['paths'] if p['parent']<0 and np.linalg.norm(coordinates([p['points'][0]])[0]-stems[a['shoot']]['points'][0])<1e-7] for a in anchors]
    for obj,is_root in [(wood,False),(root,True)]:
        mesh=obj.data;points=array(mesh.vertices,'co',3).astype(np.float64)
        ids=array(mesh.loops,'vertex_index',1,dtype=np.int32).ravel();starts=array(mesh.polygons,'loop_start',1,dtype=np.int32).ravel();counts=array(mesh.polygons,'loop_total',1,dtype=np.int32).ravel()
        uv=array(mesh.uv_layers.active.data,'uv',2).astype(np.float64);corners=points[ids]
        centers=np.add.reduceat(corners,starts,axis=0)/counts[:,None]
        owners=stem_owners(centers,[stems[a['shoot']]['points'] for a in anchors],[a['radius'] for a in anchors],root_groups if is_root else None);changed=0
        for index,anchor in enumerate(anchors):
            stem=stems[anchor['shoot']];radius=anchor['radius'];height=centers[:,2]-stem['points'][0,2]
            faces=(owners==index)&(np.ones(len(centers),bool) if is_root else height<radius*3.)
            mask=np.repeat(faces,counts)
            if not np.any(mask):continue
            selected=corners[mask];local_counts=counts[faces];local_starts=np.r_[0,np.cumsum(local_counts[:-1])]
            mapped,periods=growth_coordinates(selected,stem['points'],stem['radii'],tile,root_groups[index],True);period=math.tau*radius/tile
            face_periods=np.repeat(np.add.reduceat(periods,local_starts)/local_counts,local_counts)
            mapped[:,0]=unwrap_faces(mapped[:,0],local_starts,local_counts,face_periods if is_root else period)
            if not is_root:
                old=uv[mask];mapped[:,0]+=period*np.round((old[:,0]-mapped[:,0])/period)
                weight=collar_weight(selected[:,2]-stem['points'][0,2],radius)[:,None];mapped=old+(mapped-old)*weight
            uv[mask]=mapped;changed+=len(selected)
        if not np.isfinite(uv).all():raise RuntimeError('Non-finite basal bark flow')
        mesh.uv_layers.active.data.foreach_set('uv',uv.astype(np.float32).ravel())
        obj['basalBarkFlow']='Shared continuous cylindrical-to-radial coordinates'
        records.append({'object':obj.name,'mappedLoops':changed,'finite':True})
    return {'method':'shared cylindrical-to-radial growth field','objects':records,'upperWoodUnchangedAboveRadius':3.}
