# Spaces leaf-bearing nodes by twig length and places alternate blades into unoccupied crown space.
import math
import numpy as np
from architecture import unit,point
from plane_foliage import blade_center
from leaf_space import LeafSpace


def nodes_for_shoot(p,path,rng):
    arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(path['points'],axis=0),axis=1))]
    pitch=p['leafLength']*rng.uniform(.38,.50);count=max(1,int(round(arc[-1]*.86/pitch)))
    gaps=rng.uniform(.80,1.20,count+1);distance=arc[-1]*(.06+.88*np.cumsum(gaps[:-1])/sum(gaps))
    return np.interp(distance,arc,np.linspace(0,1,len(arc)))


def place_leaves(p,paths,shoots,rng):
    space=LeafSpace();pending=[];leaves=[];rejected=0;clearances=[]
    for shoot in shoots:
        path=paths[shoot['id']];positions=nodes_for_shoot(p,path,rng);phase=rng.uniform(-.65,.65)
        for node,t in enumerate(positions):
            phase+=math.pi+rng.uniform(-.23,.23)
            young=path['shootDepth']==3 and node==len(positions)-1
            size=p['leafLength']*rng.uniform(.78,1.04)*(rng.uniform(.65,.82) if young else 1.)
            pending.append((shoot,node,t,phase,young,size,int(rng.integers(8))))
    for index in rng.permutation(len(pending)):
        shoot,node,t,phase,young,size,form=pending[index];path=paths[shoot['id']]
        anchor=point(path,t);tangent=unit(point(path,min(1,t+.03))-point(path,max(0,t-.03)))
        lateral=unit(np.cross(tangent,[0,0,1]));lateral=lateral if np.linalg.norm(lateral)>.5 else np.array([1.,0,0])
        across=unit(np.cross(tangent,lateral));centers=[];frames=[];penalties=[]
        for attempt in range(16):
            azimuth=rng.uniform(-1.12,1.12);radial=lateral*math.cos(phase+azimuth)+across*math.sin(phase+azimuth)
            direction=unit(radial+tangent*rng.uniform(-.16,.28)+np.array([0,0,rng.uniform(-.12,.12)]))
            up=unit(np.array([0.,0,1])-direction*direction[2]);side=unit(np.cross(direction,up));roll=rng.normal(0,.52)
            normal=up*math.cos(roll)+side*math.sin(roll);frame=np.column_stack([unit(np.cross(direction,normal)),direction,normal])
            centers.append(anchor+frame@blade_center(form,True)*size);frames.append(frame);penalties.append(.045*azimuth**2)
        centers=np.asarray(centers);frames=np.asarray(frames);sizes=np.full(len(centers),size)
        costs,separation=space.score(anchor,centers,frames,sizes);costs+=penalties;costs[separation<.92]=np.inf
        best=int(np.argmin(costs))
        if not np.isfinite(costs[best]):rejected+=1;continue
        center=centers[best];frame=frames[best];space.add(center,frame,size);clearances.append(float(separation[best]))
        tint=rng.uniform(.92,1.08)*np.array([rng.uniform(.95,1.03),1.,rng.uniform(.92,1.02)])
        if young:tint*=np.array([1.10,1.08,.91])
        leaves.append({'origin':anchor,'matrix':frame*size,'form':form,'tint':tint,'group':shoot['group'],'shoot':shoot['id'],'node':node,
                       'attachment':float(t),'bladeCenter':center,'young':young})
    leaves.sort(key=lambda leaf:(leaf['shoot'],leaf['node']))
    return leaves,{'candidateNodes':len(pending),'candidateLeavesRejected':rejected,'youngLeaves':sum(l['young'] for l in leaves),
                   'crowdingMethod':'Length-based uneven internodes; 16 alternate-rank azimuth/orientation candidates; oriented blade exclusion volumes',
                   'minimumAcceptedProxyClearance':min(clearances),'petioles':'Curved 3D stalks extending blades away from their shoot',
                   'limitations':'Ellipsoidal spacing proxies, not exact triangle intersection or physiological growth simulation'}
