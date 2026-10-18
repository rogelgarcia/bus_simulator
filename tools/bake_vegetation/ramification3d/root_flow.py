# Maps basal bark along one continuous cylindrical-to-radial growth field.
import math
import numpy as np


def growth_coordinates(points,stem,radii,tile,roots=None,with_period=False):
    heights=stem[:,2];z=points[:,2]
    center=np.column_stack([np.interp(z,heights,stem[:,k]) for k in range(3)])
    tangent=np.gradient(stem,axis=0);tangent/=np.linalg.norm(tangent,axis=1)[:,None]
    overall=stem[-1]-stem[0];reference=np.array([0.,0.,1.]) if abs(overall[2]/np.linalg.norm(overall))<.9 else np.array([1.,0.,0.])
    sides=[];previous=None
    for direction in tangent:
        side=np.cross(direction,reference) if previous is None else previous-direction*np.dot(previous,direction)
        side/=np.linalg.norm(side);sides.append(side);previous=side
    side=np.column_stack([np.interp(z,heights,np.array(sides)[:,k]) for k in range(3)])
    direction=np.column_stack([np.interp(z,heights,tangent[:,k]) for k in range(3)])
    direction/=np.linalg.norm(direction,axis=1)[:,None];side-=direction*np.sum(side*direction,axis=1)[:,None];side/=np.linalg.norm(side,axis=1)[:,None]
    across=np.cross(direction,side);delta=points-center
    x=np.sum(delta*side,axis=1);y=np.sum(delta*across,axis=1);angle=np.arctan2(y,x)
    arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(stem,axis=0),axis=1))]
    height=np.interp(z,heights,arc)+np.sum(delta*direction,axis=1)
    radius=np.interp(z,heights,radii);excess=np.hypot(x,y)-radius
    radial=(excess+np.sqrt(excess*excess+(radii[0]*.08)**2))*.5
    result=np.column_stack([angle*radii[0]/tile,(height-radial)/tile]);periods=np.full(len(points),math.tau*radii[0]/tile)
    if roots:
        outer,outer_periods=axis_coordinates(points,roots,radii[0],tile,stem[0],(sides[0],np.cross(tangent[0],sides[0])),True)
        period=math.tau*radii[0]/tile;outer[:,0]+=period*np.round((result[:,0]-outer[:,0])/period)
        t=np.clip((np.hypot(x,y)/radii[0]-1.25)/1.5,0,1);weight=(t*t*(3-2*t))[:,None]
        result+=(outer-result)*weight
        periods+=(outer_periods-periods)*weight[:,0]
    return (result,periods) if with_period else result


def axis_coordinates(points,roots,base,tile,origin,frame=(np.array([0.,1.,0.]),np.array([-1.,0.,0.])),with_period=False):
    distance=np.full(len(points),np.inf);result=np.zeros((len(points),2));periods=np.empty(len(points))
    for root in roots:
        line=root['points'];vectors=np.diff(line,axis=0);lengths=np.linalg.norm(vectors,axis=1);arc=np.r_[0,np.cumsum(lengths)]
        outward=line[min(3,len(line)-1)]-origin;azimuth=math.atan2(np.dot(outward,frame[1]),np.dot(outward,frame[0]));width=root['radii'][0]
        for index,(vector,length) in enumerate(zip(vectors,lengths)):
            direction=vector/length;t=np.clip((points-line[index])@direction/length,0,1);delta=points-(line[index]+t[:,None]*vector)
            squared=np.sum(delta*delta,axis=1);take=squared<distance
            if not np.any(take):continue
            side=np.cross([1.,0.,0.] if abs(direction[2])>.98 else [0.,0.,1.],direction);side/=np.linalg.norm(side);up=np.cross(direction,side)
            angle=np.arctan2(delta[take]@side,delta[take]@up)
            result[take,0]=(azimuth*base+angle*width)/tile;result[take,1]=(base-arc[index]-t[take]*length)/tile;distance[take]=squared[take]
            periods[take]=math.tau*width/tile
    return (result,periods) if with_period else result


def stem_owners(points,stems,radii,root_groups=None):
    scores=[]
    for index,(stem,radius) in enumerate(zip(stems,radii)):
        center=np.column_stack([np.interp(points[:,2],stem[:,2],stem[:,k]) for k in range(2)])
        score=np.linalg.norm(points[:,:2]-center,axis=1)/radius
        for root in root_groups[index] if root_groups else []:
            for j,vector in enumerate(np.diff(root['points'],axis=0)):
                length=np.linalg.norm(vector);direction=vector/length;t=np.clip((points-root['points'][j])@direction/length,0,1)
                delta=points-(root['points'][j]+t[:,None]*vector);r=root['radii'][j]*(1-t)+root['radii'][j+1]*t
                score=np.minimum(score,1.15*np.linalg.norm(delta,axis=1)/r)
        scores.append(score)
    return np.argmin(np.column_stack(scores),axis=1)


def unwrap_faces(u,starts,counts,period):
    # Preserve each chart's absolute phase: a circumference is not a texture repeat.
    reference=np.repeat(u[starts],counts)
    return u+period*np.round((reference-u)/period)


def collar_weight(height,radius):
    t=np.clip((radius*3.-height)/(radius*.85),0,1)
    return t*t*t*(10+t*(-15+6*t))
