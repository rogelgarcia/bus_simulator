# Spaces opposite leaf pairs by shoot length and rejects crowded pairs as a unit.
import math
import numpy as np
from architecture import unit,point
from leaf_space import LeafSpace,clearance
from spray_foliage import blade_center


def place_leaves(p,paths,shoots,rng):
    policy=p['pairedFoliage'];axes=np.array([.40,.49,.13]);space=LeafSpace(axes,cell=p['leafLength']*1.6)
    pending=[];leaves=[];accepted=[];rejected=0
    for shoot in shoots:
        path=paths[shoot['id']];points=path['points'];axis=unit(points[-1]-points[0])
        face=unit(np.array([0.,0.,1.])-axis*axis[2])
        if np.linalg.norm(face)<.5:face=unit(np.r_[points[-1,:2],.35])
        side=unit(np.cross(axis,face));phase=rng.uniform(-.45,.45)
        face=unit(face*math.cos(phase)+side*math.sin(phase));path['sprayNormal']=face.tolist()
        arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(points,axis=0),axis=1))]
        count=max(2,int(arc[-1]*.82/(p['leafLength']*rng.uniform(*policy['internodeRatio']))))
        gaps=rng.uniform(.85,1.15,count+1)
        positions=np.interp(arc[-1]*(.08+.84*np.cumsum(gaps[:-1])/sum(gaps)),arc,np.linspace(0,1,len(arc)))
        for node,t in enumerate(positions):
            size=p['leafLength']*rng.uniform(.88,1.08)*(rng.uniform(.70,.84) if node==count-1 else 1.)
            pending.append((shoot,node,t,size,rng.integers(0,8,2)))
    for index in rng.permutation(len(pending)):
        shoot,node,t,size,forms=pending[index];path=paths[shoot['id']];anchor=point(path,t)
        tangent=unit(point(path,min(1,t+.025))-point(path,max(0,t-.025)))
        face=np.asarray(path['sprayNormal']);lateral=unit(np.cross(tangent,face));forward=unit(tangent-face*(tangent@face))
        frames=[];centers=[]
        for attempt in range(8):
            turn=(1 if node%2 else -1)*.30+rng.uniform(-.20,.20)
            spread=unit(lateral*math.cos(turn)+face*math.sin(turn))
            for pair,sign in enumerate([1,-1]):
                direction=unit(spread*sign+forward*rng.uniform(.25,.48))
                normal=unit(face-direction*(face@direction));side=unit(np.cross(direction,normal));roll=rng.uniform(-.20,.20)
                normal=unit(normal*math.cos(roll)+side*math.sin(roll))
                frame=np.column_stack([unit(np.cross(direction,normal)),direction,normal])
                frames.append(frame);centers.append(anchor+frame@blade_center(int(forms[pair]),p.get('bladeShape'))*size)
        frames=np.asarray(frames);centers=np.asarray(centers)
        cost,separation=space.score(anchor,centers,frames,np.full(len(centers),size))
        cost=cost.reshape(-1,2).sum(axis=1);separation=separation.reshape(-1,2).min(axis=1)
        for attempt in range(8):
            i=attempt*2
            pair_clearance=clearance(centers[i:i+1],frames[i:i+1],np.array([size]),centers[i+1:i+2],frames[i+1:i+2],np.array([size]),axes)[0,0]
            separation[attempt]=min(separation[attempt],pair_clearance)
        cost[separation<policy['minimumClearance']]=np.inf;best=int(np.argmin(cost))
        if not np.isfinite(cost[best]):rejected+=2;continue
        accepted.append(float(separation[best]))
        for pair in range(2):
            i=best*2+pair;space.add(centers[i],frames[i],size)
            tint=rng.uniform(.94,1.06)*np.array([rng.uniform(.96,1.02),1.,rng.uniform(.94,1.02)])*p['leafGreen']
            leaves.append({'origin':anchor,'matrix':frames[i]*size,'form':int(forms[pair]),'tint':tint,
                           'group':shoot['group'],'shoot':shoot['id'],'node':node,'attachment':float(t),'bladeCenter':centers[i]})
    leaves.sort(key=lambda l:(l['shoot'],l['node']))
    return leaves,{'candidateLeaves':len(pending)*2,'candidateLeavesRejected':rejected,'oppositePairs':len(leaves)//2,
                   'minimumAcceptedProxyClearance':min(accepted),'minimumRequiredProxyClearance':policy['minimumClearance'],
                   'exclusionHalfAxes':axes.tolist(),'internodeRatio':policy['internodeRatio'],
                   'crowdingMethod':'Arc-length opposite pairs; bounded node rotation; whole-pair oriented blade-volume rejection',
                   'limitations':'Proxy clearance limits stacking; it does not prove exact mesh nonintersection'}
