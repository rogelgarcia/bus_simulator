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
    def __init__(self,half_axes=HALF_AXES,cell=.40):
        self.grid=defaultdict(list);self.centers=[];self.frames=[];self.sizes=[];self.cell=cell
        self.half_axes=np.asarray(half_axes)

    def neighbors(self,anchor):
        x,y,z=(int(v) for v in np.floor(anchor/self.cell))
        return [i for dx,dy,dz in OFFSETS for i in self.grid.get((x+dx,y+dy,z+dz),())]

    def score(self,anchor,centers,frames,sizes):
        ids=self.neighbors(anchor)
        if not ids:return np.zeros(len(centers)),np.full(len(centers),10.)
        other_centers=np.asarray([self.centers[i] for i in ids]);other_sizes=np.asarray([self.sizes[i] for i in ids])
        # Beyond this conservative support bound, every candidate's crowding penalty is exactly zero.
        reach=np.linalg.norm(centers-anchor,axis=1).max()+1.4*(self.half_axes.max()*(sizes.max()+other_sizes)+.020)
        keep=np.linalg.norm(other_centers-anchor,axis=1)<=reach
        if not keep.any():return np.zeros(len(centers)),np.full(len(centers),1.4)
        other_frames=np.asarray([self.frames[i] for i,k in zip(ids,keep) if k])
        separation=clearance(centers,frames,sizes,other_centers[keep],other_frames,other_sizes[keep],self.half_axes)
        return np.sum(np.maximum(0,1.4-separation)**2,axis=1),np.minimum(1.4,np.min(separation,axis=1))

    def add(self,center,frame,size):
        self.grid[tuple(np.floor(center/self.cell).astype(int))].append(len(self.centers))
        self.centers.append(center);self.frames.append(frame);self.sizes.append(size)
