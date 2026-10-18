# Extends short leafy shoots from skeleton tips, with staggered buds, shared clearance and gravity sag.
import math
import numpy as np
from architecture import unit
from shoot_growth import TwigSpace


def extend_shoot(paths,parent,node,direction,length,normal,group,depth,policy,rng):
    source=paths[parent];start=source['points'][node].copy()
    incoming=unit(start-source['points'][max(0,node-2)]);t=np.linspace(0,1,17);u=t[:,None]
    end=start+direction*length
    points=(1-u)**3*start+3*(1-u)**2*u*(start+incoming*length*.20)+3*(1-u)*u*u*(end-direction*length*.30)+u**3*end
    points[:,2]-=policy['shootSagFraction']*length*t**2
    idx=len(paths)
    paths.append({'points':points,'radii':np.full(len(points),.003),'demand':np.full(len(points),.00002),
                  'parent':parent,'parentNode':node,'phase':float(rng.random()),'basal':False,'order':source['order']+1,
                  'shootRole':'bud-grown-v2','shootDepth':depth,'group':group,'sprayNormal':normal.tolist(),
                  'junctionMode':'inherited-tangent'})
    return idx


def grow_shoots(paths,terminals,policy,rng):
    space=TwigSpace(policy['twigClearanceMetres']);shoots=[];rejected=0
    buds=[];terminal_set=set(terminals);tip_distance=np.full(len(paths),np.inf);tip_distance[terminals]=0
    lengths=[float(np.linalg.norm(np.diff(p['points'],axis=0),axis=1).sum()) for p in paths]
    for index in reversed(range(len(paths))):
        parent=paths[index]['parent']
        if parent>=0:tip_distance[parent]=min(tip_distance[parent],tip_distance[index]+lengths[index])
    for parent,path in enumerate(paths):
        if path.get('growthRole')!='space-grown' or tip_distance[parent]>=policy['youngWoodLeafyLengthMetres']:continue
        arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(path['points'],axis=0),axis=1))]
        if parent in terminal_set:buds.append((parent,len(path['points'])-1,True))
        leafy=policy['directLeafyWoodLengthMetres']-tip_distance[parent]
        if leafy>0:
            axis=unit(path['points'][-1]-path['points'][0]);normal=np.array([0.,0.,1.])-axis*axis[2]
            if np.linalg.norm(normal)<.1:normal=np.array([1.,0,0])-axis*axis[0]
            path['sprayNormal']=unit(normal).tolist()
            shoots.append({'id':parent,'group':-parent-1,'leafStartMetres':max(0.,arc[-1]-leafy)})
        available=policy['youngWoodLeafyLengthMetres']-tip_distance[parent]
        for distance in np.arange(arc[-1]-.42,max(.12,arc[-1]-available),-.48):
            buds.append((parent,max(2,int(np.searchsorted(arc,distance))),False))
    for group,(parent,anchor_node,terminal) in enumerate(buds):
        support=paths[parent];axis=unit(support['points'][anchor_node]-support['points'][anchor_node-2])
        up=unit(np.array([0.,0.,1.])-axis*axis[2]);side=unit(np.cross(axis,up))
        if np.linalg.norm(up)<.1:up=unit(np.array([1.,0,0])-axis*axis[0]);side=unit(np.cross(axis,up))
        roll=rng.uniform(-.55,.55);normal=up*math.cos(roll)+side*math.sin(roll);side=unit(np.cross(axis,normal))
        if not terminal:axis=unit(axis*.65+side*((-1)**group)*.75+normal*.1)
        length=rng.uniform(*policy['shootLengthMetres'])*(1 if terminal else .72)
        main=extend_shoot(paths,parent,anchor_node,axis,length,normal,group,0,policy,rng)
        if space.clearance(paths[main]['points'][5:],parent)<space.gap:
            paths.pop();rejected+=1;continue
        space.add(paths[main]['points'][5:],main);shoots.append({'id':main,'group':group,'parent':parent})
        for rank,fraction in enumerate([.32,.72] if terminal else []):
            node=round((fraction+rng.uniform(-.025,.025))*16);path=paths[main];tangent=unit(path['points'][node]-path['points'][node-2])
            sign=1 if rank%2==0 else -1
            direction=unit(tangent*.64+side*sign*.78+normal*rng.uniform(-.16,.16)+[0,0,.08])
            lateral=extend_shoot(paths,main,node,direction,length*rng.uniform(*policy['lateralLengthFraction']),normal,group,1,policy,rng)
            if space.clearance(paths[lateral]['points'][6:],main)<space.gap:
                paths.pop();rejected+=1;continue
            space.add(paths[lateral]['points'][6:],lateral);shoots.append({'id':lateral,'group':group,'parent':main})
    return shoots,{'shoots':sum('shootRole' in paths[s['id']] for s in shoots),'directLeafyPaths':sum('growthRole' in paths[s['id']] for s in shoots),'suppressedCrowdedBuds':rejected,'maximumShootDepth':1,'minimumTwigClearance':space.gap}
