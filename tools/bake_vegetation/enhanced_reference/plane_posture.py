# Raises a selected scaffold with a smooth proximal bend and rigid attached crown motion.
import math
import numpy as np
from architecture import unit


def rotation(axis,angle):
    x,y,z=unit(axis);cross=np.array([[0,-z,y],[z,0,-x],[-y,x,0]])
    return np.eye(3)+math.sin(angle)*cross+(1-math.cos(angle))*(cross@cross)


def lift_scaffold(paths,root,target_degrees=38.):
    branch=paths[root];original=branch['points'].copy();pivot=original[0].copy();delta=original[-1]-pivot
    elevation=math.atan2(delta[2],np.linalg.norm(delta[:2]));angle=math.radians(target_degrees)-elevation
    axis=unit(np.cross([delta[0],delta[1],0],[0,0,1]));matrix=rotation(axis,angle)
    selected={root}
    for i,path in enumerate(paths):
        if path['parent'] in selected:selected.add(i)
    for i in selected:
        path=paths[i];path['points']=pivot+(path['points']-pivot)@matrix.T
        if 'extensionGuide' in path:path['extensionGuide']=(matrix@path['extensionGuide']).tolist()
    arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(original,axis=0),axis=1))];t=arc/arc[-1]
    blend=np.clip((t-.12)/.46,0,1);blend=blend*blend*(3-2*blend)
    branch['points']=np.asarray([pivot+rotation(axis,angle*w)@(point-pivot) for point,w in zip(original,blend)])
    return {'rootPath':root,'paths':sorted(selected),'pivot':pivot,'rotation':matrix,
            'previousElevationDegrees':math.degrees(elevation),'elevationDegrees':target_degrees,
            'rotationDegrees':math.degrees(angle),'proximalBlendFraction':[.12,.58]}
