# Offers connected alternative leaf nodes and bounded in-plane directions before discarding crowded blades.
import numpy as np


def unit_rows(values):
    return values/np.maximum(np.linalg.norm(values,axis=1)[:,None],1e-12)


def candidates(path,t,node,size,face,blade_center,policy,rng):
    points=path['points'];arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(points,axis=0),axis=1))]
    parameters=np.linspace(0,1,len(points));count=policy['candidates']
    shifts=np.r_[0,rng.uniform(-policy['travelLeafLengths'],policy['travelLeafLengths'],count-1)]*size
    fractions=np.interp(np.clip(np.interp(t,parameters,arc)+shifts,arc[-1]*.06,arc[-1]*.96),arc,parameters)
    sample=lambda u:np.column_stack([np.interp(u,parameters,points[:,axis]) for axis in range(3)])
    anchors=sample(fractions);tangents=unit_rows(sample(np.minimum(1,fractions+.025))-sample(np.maximum(0,fractions-.025)))
    lateral=unit_rows(np.cross(tangents,face))*(-1 if node%2 else 1)
    forward=unit_rows(tangents-(tangents@face)[:,None]*face)
    direction=unit_rows(lateral+forward*rng.uniform(*policy['forwardRange'],(count,1))+face*rng.uniform(-.16,.16,(count,1)))
    normal=unit_rows(face-direction*(direction@face)[:,None]);side=unit_rows(np.cross(direction,normal));roll=rng.uniform(-.28,.28,(count,1))
    normal=normal*np.cos(roll)+side*np.sin(roll)
    frames=np.stack([unit_rows(np.cross(direction,normal)),direction,normal],axis=2)
    return anchors,anchors+np.einsum('nij,j->ni',frames,blade_center)*size,frames,fractions
