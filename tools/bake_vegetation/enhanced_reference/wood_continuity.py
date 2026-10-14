# Rejects missing leader segments by tracing outward from the growth centerline in the saved wood.
import math
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from architecture import unit


def leader_sections(paths):
    sections=[]
    for path in paths:
        if path.get('growthRole') not in ['bole','leader']:continue
        points=path['points'];radii=path['radii']
        for i in range(1,len(points)-1):
            if radii[i]<.075 or points[i,2]<.5:continue
            sections.append({'center':points[i].tolist(),'axis':unit(points[i+1]-points[i-1]).tolist(),'radius':float(radii[i])})
    return sections


def inspect_leader(obj,sections):
    tree=BVHTree.FromObject(obj,bpy.context.evaluated_depsgraph_get());failed=[];minimum=6
    for i,section in enumerate(sections):
        axis=np.array(section['axis']);side=unit(np.cross(axis,[1.,0,0]));across=unit(np.cross(axis,side));exits=0
        for angle in np.arange(6)*math.tau/6:
            direction=Vector(side*math.cos(angle)+across*math.sin(angle))
            hit,normal,_,distance=tree.ray_cast(Vector(section['center']),direction,section['radius']*4+.04)
            if hit is not None and normal.dot(direction)>0 and distance>section['radius']*.35:exits+=1
        minimum=min(minimum,exits)
        if exits<4:failed.append(i)
    return {'sections':len(sections),'minimumRadialExits':minimum,'failedSections':failed,'passed':len(sections)>0 and not failed}
