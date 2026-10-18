# Separates the narrow stalk from the blade without bridging the basal notch.
import math
import numpy as np


def blade_profile(mask,sectors=256,follow_stem=False):
    valid=mask>.98;height,width=mask.shape;scale=np.array([width-1,height-1])
    ys,xs=np.where(valid);axis=int(np.median(xs[ys<ys.min()+6] if follow_stem else xs));rows=[]
    narrow=follow_stem;threshold=np.max(np.sum(valid,axis=1))*.10
    for y in range(int(ys.min()),int(ys.max())+1):
        if narrow:
            columns=np.flatnonzero(valid[y])
            if not len(columns):raise ValueError('Disconnected petiole mask')
            axis=int(columns[np.argmin(abs(columns-axis))])
        if not valid[y,axis]:continue
        left=axis;right=axis
        while left>0 and valid[y,left-1]:left-=1
        while right<width-1 and valid[y,right+1]:right+=1
        rows.append((y,left,right))
        if narrow:
            narrow=right-left<threshold
            if narrow:axis=round((left+right)*.5)
    rows=np.asarray(rows);wide=rows[:,2]-rows[:,1]>np.max(np.sum(valid,axis=1))*.10
    junction_y=int(rows[np.flatnonzero(wide)[0],0]);stem=rows[rows[:,0]<junction_y]
    junction=np.array([np.mean(stem[-3:,1:]),junction_y])/scale
    blade=valid.copy()
    for y,left,right in stem:blade[y,max(0,left-2):min(width,right+3)]=False
    by,bx=np.where(blade);center=np.array([bx.mean(),by.mean()])/scale
    angles=np.arange(sectors)*math.tau/sectors;directions=np.column_stack([np.cos(angles),np.sin(angles)])
    steps=np.linspace(0,1.5,3500);samples=center+directions[:,None,:]*steps[None,:,None]
    ij=np.clip(np.round(samples*scale),[0,0],scale).astype(int)
    inside=blade[ij[:,:,1],ij[:,:,0]]&np.all((samples>=0)&(samples<=1),axis=2)
    # First exit is essential: a ray must not jump across the notch into another lobe or the stalk.
    edge=np.argmax(~inside,axis=1);contour=center+directions*steps[np.maximum(0,edge-4),None]
    stem_uv=np.column_stack([np.mean(stem[:,1:],axis=1),stem[:,0]])/scale
    return center,contour,junction,stem_uv
