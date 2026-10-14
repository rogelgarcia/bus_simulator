# Redirects connected scaffold families in space while preserving root geometry and branch orders.
import math
import numpy as np
from architecture import unit
from plane_posture import rotation


def redirect_family(paths,root,elevation,yaw):
    branch=paths[root];original=branch['points'].copy();pivot=original[0].copy();delta=original[-1]-pivot
    previous=math.degrees(math.atan2(delta[2],np.linalg.norm(delta[:2])))
    lift=rotation(np.cross([delta[0],delta[1],0],[0,0,1]),math.radians(elevation-previous))
    matrix=rotation([0,0,1],math.radians(yaw))@lift
    parent=paths[branch['parent']]['points'];node=branch['parentNode']
    incoming=unit(parent[node]-parent[max(0,node-2)])
    outgoing=matrix@unit(original[-1]-original[-2]);end=pivot+matrix@delta;length=np.linalg.norm(delta)
    controls=[pivot,pivot+incoming*length*.32,end-outgoing*length*.30,end]
    t=np.linspace(0,1,len(original))[:,None]
    branch['points']=(1-t)**3*controls[0]+3*(1-t)**2*t*controls[1]+3*(1-t)*t*t*controls[2]+t**3*controls[3]
    # Exact terminal samples align the rigid daughter families without a crease at the next fork.
    branch['points'][1]=pivot+incoming*np.linalg.norm(branch['points'][1]-pivot)
    branch['points'][-2]=end-outgoing*np.linalg.norm(end-branch['points'][-2])
    transforms={root:(matrix,pivot-matrix@pivot)}
    for i,path in enumerate(paths):
        if i==root or path['parent'] not in transforms:continue
        old=path['points'].copy();anchor=paths[path['parent']]['points'][path['parentNode']]
        shift=anchor-matrix@old[0];path['points']=old@matrix.T+shift
        transforms[i]=(matrix,shift)
    for i in transforms:
        for key in ['extensionGuide','sprayNormal']:
            if key in paths[i]:paths[i][key]=(matrix@np.asarray(paths[i][key])).tolist()
    return transforms,{'rootPath':root,'pathCount':len(transforms),'previousElevationDegrees':previous,
                       'elevationDegrees':elevation,'azimuthChangeDegrees':yaw,'inheritedTangent':incoming.tolist()}


def spatial_scaffolds(paths,launches,variant):
    transforms={};proof=[]
    # Unequal elevations and alternating azimuth changes keep each family's outward extension.
    elevations=[45,49,53,43,48,52];azimuths=[19,-17,12,-23,16,-13]
    for slot,(elevation,yaw) in enumerate(zip(elevations,azimuths)):
        root=launches[slot*2];elevation+=(variant-2)*(-1 if slot%2 else 1)*1.5
        change,record=redirect_family(paths,root,elevation,yaw+(variant-2)*3)
        if set(change)&set(transforms):raise RuntimeError('Scaffold correction families must be disjoint')
        transforms.update(change);proof.append(record)
    return transforms,proof
