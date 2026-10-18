# Selectively removes crowded blades while protecting multi-direction coverage and occupied crown volume.
import math
import numpy as np
from leaf_space import clearance


def footprints(centers,matrices,cell,azimuth,elevation):
    side=np.array([-math.sin(azimuth),math.cos(azimuth),0.])
    up=np.array([-math.cos(azimuth)*math.sin(elevation),-math.sin(azimuth)*math.sin(elevation),math.cos(elevation)])
    basis=np.column_stack([side,up]);xy=centers@basis/cell
    axes=np.einsum('nji,jk->nki',matrices[:,:,:2],basis)*np.array([.34,.49])/cell
    covariance=axes@axes.transpose(0,2,1)+np.eye(2)*.16
    inverse=np.linalg.inv(covariance);radius=int(np.ceil(np.sqrt(np.max(np.linalg.eigvalsh(covariance)))))+1
    offsets=np.array([(x,y) for x in range(-radius,radius+1) for y in range(-radius,radius+1)])
    grid=np.floor(xy).astype(np.int32)[:,None,:]+offsets;delta=grid+.5-xy[:,None,:]
    valid=np.einsum('nki,nij,nkj->nk',delta,inverse,delta)<=1
    valid[:,np.flatnonzero(np.all(offsets==0,axis=1))[0]]=True
    low=grid.min(axis=(0,1));span=grid.max(axis=(0,1))-low+1
    keys=(grid[:,:,0]-low[0])+(grid[:,:,1]-low[1])*span[0]
    keys[~valid]=-1;counts=np.bincount(keys[valid],minlength=int(np.prod(span)))
    return keys,counts


def clean_foliage(centers,matrices,groups,policy):
    centers=np.asarray(centers);matrices=np.asarray(matrices);groups=np.asarray(groups)
    if not len(centers) or not np.isfinite(centers).all() or not np.isfinite(matrices).all():raise ValueError('Invalid foliage for cleanup')
    sizes=np.linalg.norm(matrices[:,:,0],axis=1);frames=matrices/sizes[:,None,None]
    group_ids,inverse,group_counts=np.unique(groups,return_inverse=True,return_counts=True)
    remaining=group_counts.copy();minimum=np.ceil(group_counts*policy['minimumSprayRetention']).astype(int)
    protected=np.zeros(len(centers),bool);scores=np.zeros(len(centers));pairs=[]
    for group in range(len(group_ids)):
        ids=np.flatnonzero(inverse==group);points=centers[ids]
        protected[ids[np.r_[points.argmin(axis=0),points.argmax(axis=0)]]]=True
        separation=clearance(points,frames[ids],sizes[ids],points,frames[ids],sizes[ids],np.array([.34,.49,.12]))
        penalty=np.maximum(0,1.25-separation)**2;np.fill_diagonal(penalty,0)
        scores[ids]=penalty.sum(axis=1);a,b=np.where(np.triu(penalty>0,1));pairs.extend(zip(ids[a],ids[b],penalty[a,b]))
    directions=[(i*math.pi/4,.0 if i%2==0 else .55) for i in range(8)]
    views=[footprints(centers,matrices,policy['projectionCellMetres'],*direction) for direction in directions]
    totals=np.array([np.count_nonzero(counts) for _,counts in views]);lost=np.zeros(len(views),int)
    budgets=np.floor(totals*(1-policy['minimumProjectedRetention'])).astype(int)
    _,voxels,voxel_counts=np.unique(np.floor(centers/policy['volumeCellMetres']).astype(int),axis=0,return_inverse=True,return_counts=True)
    keep=np.ones(len(centers),bool);removed=0;limit=int(len(centers)*policy['maximumRemoval'])
    for i in np.argsort(-scores,kind='stable'):
        if removed>=limit or scores[i]<=0:break
        if protected[i] or remaining[inverse[i]]<=minimum[inverse[i]] or voxel_counts[voxels[i]]<=1:continue
        keys=[row[i][row[i]>=0] for row,_ in views]
        loss=np.array([np.count_nonzero(counts[key]==1) for key,(_,counts) in zip(keys,views)])
        if np.any(lost+loss>budgets):continue
        for key,(_,counts) in zip(keys,views):counts[key]-=1
        lost+=loss;voxel_counts[voxels[i]]-=1;remaining[inverse[i]]-=1;keep[i]=False;removed+=1
    before=sum(weight for _,_,weight in pairs);after=sum(weight for a,b,weight in pairs if keep[a] and keep[b])
    return keep,{'policy':policy,'previousLeafCount':len(centers),'leafCount':int(keep.sum()),'removedLeaves':removed,
                 'withinSprayCrowdingBefore':float(before),'withinSprayCrowdingAfter':float(after),
                 'projectedCoverage':[{'azimuthDegrees':math.degrees(a),'elevationDegrees':math.degrees(e),'beforeCells':int(n),'afterCells':int(n-l),'retainedFraction':float((n-l)/n)} for (a,e),n,l in zip(directions,totals,lost)],
                 'occupiedVolumeCells':len(voxel_counts),'retainedOccupiedVolumeFraction':1.,
                 'protectedSprayExtrema':int(protected.sum()),'minimumSprayRetainedFraction':float(np.min(remaining/group_counts)),
                 'method':'Remove crowded blades only; protect every spray extent and occupied 3D cell, with eight directional coverage budgets',
                 'limitations':'Elliptical blade footprints and occupied cells are geometric proxies; rendered coverage is checked separately'}
