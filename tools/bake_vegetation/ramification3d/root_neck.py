# Fits the upper collar to the actual saved trunk surface with a flat-ended blend.
import numpy as np
import bpy
from common import array
from mesh_adapter import coordinates
from root_flow import stem_owners


def fit_necks(root,wood,graph,major_vertices):
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    tree=BVHTree.FromObject(wood,bpy.context.evaluated_depsgraph_get())
    points=array(root.data.vertices,'co',3).astype(np.float64);records=[]
    owners=stem_owners(points,[coordinates(graph['paths'][a['shoot']]['points']) for a in graph['base']['anchors']],[a['radius'] for a in graph['base']['anchors']])
    for anchor_index,anchor in enumerate(graph['base']['anchors']):
        stem=coordinates(graph['paths'][anchor['shoot']]['points']);radius=anchor['radius'];height=points[:,2]-stem[0,2]
        centers=np.column_stack([np.interp(points[:,2],stem[:,2],stem[:,k]) for k in range(3)])
        delta=points-centers;rho=np.linalg.norm(delta[:,:2],axis=1)
        selected=np.flatnonzero((owners==anchor_index)&(np.arange(len(points))<major_vertices)&(height>radius*.65)&(height<radius*2.15)&(rho>radius*.65)&(rho<radius*1.7));moved=0
        for index in selected:
            direction=delta[index]/np.linalg.norm(delta[index]);hit=tree.ray_cast(Vector(centers[index]),Vector(direction),radius*2)
            if hit[0] is None:raise RuntimeError('Root collar has no saved trunk surface')
            bole=float(np.linalg.norm(np.asarray(hit[0])-centers[index]));excess=max(0,rho[index]-bole)
            t=np.clip((height[index]/radius-.65)/1.35,0,1);weight=t*t*t*(10+t*(-15+6*t))
            target=bole+excess*(1-weight)-radius*.002*weight
            points[index]=centers[index]+direction*target;moved+=1
        records.append({'anchor':anchor['id'],'fittedVertices':moved,'maximumHeightInRadii':2.15,'upperInsetInRadii':.002})
    root.data.vertices.foreach_set('co',points.astype(np.float32).ravel());root.data.update()
    return records
