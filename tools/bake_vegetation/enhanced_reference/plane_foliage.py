# Places alternate leaves on preserved shoots, with curved petioles and crowding-aware blade orientation.
import math
from collections import defaultdict
import numpy as np
from architecture import point,unit


def form_parameters(form,spread=False,flat=False):
    rng=np.random.default_rng(12917+form*83)
    result={'petiole':float(rng.uniform(.43,.62) if spread else rng.uniform(.30,.47)),'arch':float(rng.uniform(.07,.17)),
            'curl':float(rng.uniform(-.11,-.025)),'twist':float(rng.uniform(-.12,.12)),
            'fold':float(rng.uniform(.06,.14)),'width':float(rng.uniform(.93,1.07))}
    if flat:
        for key in ['arch','curl','twist','fold']:result[key]*=.30
    return result


def blade_center(form,spread=False,flat=False):
    p=form_parameters(form,spread,flat)
    return np.array([0.,p['petiole']+.48,p['curl']*.48**2])


def place_leaves(p,paths,shoots,rng):
    leaves=[];grid=defaultdict(list);cell=.16;rejected=0
    for shoot in shoots:
        path=paths[shoot['id']];count=shoot['stations'];depth=path['shootDepth']
        intervals=rng.uniform(.70,1.35,count+1);positions=.10+.83*np.cumsum(intervals[:-1])/sum(intervals)
        axis=unit(path['points'][-1]-path['points'][0]);lateral=unit(np.cross(axis,[0,0,1]))
        if np.linalg.norm(lateral)<.5:lateral=np.array([1.,0,0])
        across=unit(np.cross(axis,lateral));phase=rng.uniform(-math.pi,math.pi)
        for node,t in enumerate(positions):
            anchor=point(path,t);tangent=unit(point(path,min(1,t+.03))-point(path,max(0,t-.03)))
            phase+=math.pi+rng.uniform(-.34,.34)
            radial=unit(lateral*math.cos(phase)+across*math.sin(phase))
            radial=unit(radial-tangent*np.dot(radial,tangent))
            direction=unit(radial*.90+tangent*rng.uniform(.15,.48)+np.array([0,0,rng.uniform(.04,.23)]))
            # The last leaf on young terminal growth is smaller; mature blades remain mixed in size.
            young=depth==3 and node==count-1
            size=p['leafLength']*rng.uniform(.76,1.10)*(rng.uniform(.48,.72) if young else 1.)
            form=int(rng.integers(8));center_local=blade_center(form);best=None
            for attempt in range(6):
                trial=unit(direction+radial*rng.uniform(-.14,.14)+tangent*rng.uniform(-.18,.18))
                up=unit(np.array([0.,0,1])-trial*trial[2]);side=unit(np.cross(trial,up))
                roll=rng.normal(0,.50);normal=unit(up*math.cos(roll)+side*math.sin(roll))
                matrix=np.column_stack([unit(np.cross(trial,normal)),trial,normal])*size
                center=anchor+matrix@center_local;key=np.floor(center/cell).astype(int);cost=0.
                for dx in [-1,0,1]:
                    for dy in [-1,0,1]:
                        for dz in [-1,0,1]:
                            for other,other_normal,other_size in grid[tuple(key+[dx,dy,dz])]:
                                cost+=max(0,1-np.linalg.norm(center-other)/((size+other_size)*.38))*abs(normal@other_normal)
                if best is None or cost<best[0]:best=(cost,matrix,center,normal,key)
            if best[0]>.85:rejected+=1;continue
            _,matrix,center,normal,key=best
            tint=rng.uniform(.91,1.09)*np.array([rng.uniform(.95,1.03),1.,rng.uniform(.91,1.02)])
            if young:tint*=np.array([1.10,1.08,.91])
            leaves.append({'origin':anchor,'matrix':matrix,'form':form,'tint':tint,'group':shoot['group'],'shoot':shoot['id'],'node':node,
                           'attachment':float(t),'bladeCenter':center,'young':young})
            grid[tuple(key)].append((center,normal,size))
    return leaves,{'candidateLeavesRejected':rejected,'crowdingMethod':'Six petiole/blade orientations; blade-center distance and face alignment, not exact intersections',
                   'petioles':'Curved volumetric geometry in each leaf prototype','youngLeaves':sum(l['young'] for l in leaves)}
