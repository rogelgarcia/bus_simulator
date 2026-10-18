# Checks blade footprints in each supporting fan's own plane, independently of the review camera.
from collections import defaultdict
import numpy as np


def projected_clearance(centers,frames,sizes,other_centers,other_frames,other_sizes,normal,half_axes):
    delta=centers[:,None,:]-other_centers
    delta-=np.einsum('cni,i->cn',delta,normal)[:,:,None]*normal
    distance=np.linalg.norm(delta,axis=2);direction=delta/np.maximum(distance[:,:,None],1e-12)
    a=np.einsum('cni,cij->cnj',direction,frames[:,:,:2])*half_axes*sizes[:,None,None]
    b=np.einsum('cni,nij->cnj',direction,other_frames[:,:,:2])*half_axes*other_sizes[None,:,None]
    return distance/(np.linalg.norm(a,axis=2)+np.linalg.norm(b,axis=2)+1e-12)


class SpraySpace:
    def __init__(self,half_axes):
        self.half_axes=np.asarray(half_axes);self.groups=defaultdict(list)

    def score(self,group,normal,centers,frames,sizes):
        previous=self.groups.get(group)
        if not previous:return np.full(len(centers),10.)
        c,f,s=map(np.asarray,zip(*previous))
        return projected_clearance(centers,frames,sizes,c,f,s,normal,self.half_axes).min(axis=1)

    def add(self,group,center,frame,size):
        self.groups[group].append((center,frame,size))


def measure_sprays(centers,matrices,groups,normals,half_axes,minimum):
    centers=np.asarray(centers);matrices=np.asarray(matrices);groups=np.asarray(groups)
    sizes=np.linalg.norm(matrices[:,:,0],axis=1);frames=matrices/sizes[:,None,None]
    pairs=0;penalty=0.;worst=10.
    for group in np.unique(groups):
        ids=np.flatnonzero(groups==group)
        if len(ids)<2:continue
        ratios=projected_clearance(centers[ids],frames[ids],sizes[ids],centers[ids],frames[ids],sizes[ids],np.asarray(normals[int(group)]),np.asarray(half_axes))
        values=ratios[np.triu_indices(len(ids),1)];worst=min(worst,float(values.min()))
        pairs+=int(np.count_nonzero(values<minimum-1e-5));penalty+=float(np.maximum(0,minimum-values).sum())
    return {'pairsBelowMinimum':pairs,'overlapPenalty':penalty,'minimumProjectedClearance':worst,'minimumRequired':minimum,
            'method':'Blade ellipse support distances projected onto the shared fan plane; natural cross-fan occlusion remains possible'}
