# Uses oriented blade volumes to select free space instead of accepting coincident leaf centers.
from collections import defaultdict
import itertools
import numpy as np

HALF_AXES=np.array([.63,.49,.28])
OFFSETS=list(itertools.product(range(-2,3),repeat=3))


def clearance(centers,frames,sizes,other_centers,other_frames,other_sizes,half_axes=HALF_AXES):
    delta=centers[:,None,:]-other_centers;distance=np.linalg.norm(delta,axis=2)
    direction=delta/np.maximum(distance[:,:,None],1e-12)
    a=np.einsum('cni,cij->cnj',direction,frames)*half_axes*sizes[:,None,None]
    b=np.einsum('cni,nij->cnj',direction,other_frames)*half_axes*other_sizes[None,:,None]
    return distance/(np.linalg.norm(a,axis=2)+np.linalg.norm(b,axis=2)+.020)


class LeafSpace:
    def __init__(self,half_axes=HALF_AXES):
        self.grid=defaultdict(list);self.centers=[];self.frames=[];self.sizes=[];self.cell=.40
        self.half_axes=np.asarray(half_axes)

    def neighbors(self,anchor):
        key=np.floor(anchor/self.cell).astype(int)
        return [i for offset in OFFSETS for i in self.grid.get(tuple(key+offset),())]

    def score(self,anchor,centers,frames,sizes):
        ids=self.neighbors(anchor)
        if not ids:return np.zeros(len(centers)),np.full(len(centers),10.)
        separation=clearance(centers,frames,sizes,np.asarray([self.centers[i] for i in ids]),np.asarray([self.frames[i] for i in ids]),np.asarray([self.sizes[i] for i in ids]),self.half_axes)
        return np.sum(np.maximum(0,1.4-separation)**2,axis=1),np.min(separation,axis=1)

    def add(self,center,frame,size):
        self.grid[tuple(np.floor(center/self.cell).astype(int))].append(len(self.centers))
        self.centers.append(center);self.frames.append(frame);self.sizes.append(size)
