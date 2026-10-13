# Flattens connected fine-shoot families into shallow fans distributed around the crown.
import numpy as np
from collections import defaultdict
from architecture import unit


def arrange_sprays(paths):
    roots=[i for i,p in enumerate(paths) if p.get('shootDepth')==1];families={};owner={}
    for i,p in enumerate(paths):
        if i in roots:owner[i]=i;families[i]=[]
        elif p['parent'] in owner:owner[i]=owner[p['parent']]
        if i in owner:families[owner[i]].append(i)
    anchors=np.array([paths[i]['points'][0] for i in roots]);mid=np.median(anchors[:,2]);height=np.ptp(anchors[:,2])
    normals={};rows=[];siblings=defaultdict(int)
    for i,p in enumerate(paths):
        if p.get('shootDepth')!=0:continue
        axis=unit(p['points'][-1]-p['points'][0]);radial=unit(np.r_[p['points'][0,:2],.1])
        normals[i]=unit(radial-axis*np.dot(radial,axis))
        p['sprayRoot']=i;p['sprayNormal']=normals[i].tolist()
    for root,ids in families.items():
        stem=paths[root];anchor=stem['points'][0].copy();axis=unit(stem['points'][-1]-anchor)
        cloud=np.vstack([paths[i]['points'] for i in ids])-anchor
        _,_,basis=np.linalg.svd(cloud,full_matrices=False);normal=unit(basis[-1]-axis*np.dot(basis[-1],axis))
        radial=unit(np.r_[anchor[:2],0.]);outward=unit(radial+[0,0,np.clip((anchor[2]-mid)/height,-.35,.55)])
        rng=np.random.default_rng(root*73+417);sign=1 if siblings[stem['parent']]%2 else -1;siblings[stem['parent']]+=1
        yaw=sign*rng.uniform(.60,1.12);side=unit(np.cross([0,0,1],radial))
        facing_target=unit(radial*np.cos(yaw)+side*np.sin(yaw)+[0,0,rng.uniform(-.20,.48)])
        if np.dot(normal,outward)<0:normal=-normal
        old=np.column_stack([unit(np.cross(axis,normal)),axis,normal])
        tangent=axis-facing_target*np.dot(axis,facing_target)
        if np.linalg.norm(tangent)<.25:tangent=np.array([0.,0,1])-facing_target*facing_target[2]
        heading=unit(axis*.23+unit(tangent)*.77)
        facing=unit(facing_target-heading*np.dot(facing_target,heading))
        new=np.column_stack([unit(np.cross(heading,facing)),heading,facing])
        transform=new@np.diag([1.45,1.10,.12])@old.T
        reach=np.linalg.norm(stem['points'][-1]-anchor)
        for i in ids:
            original=paths[i]['points']-anchor;distance=np.linalg.norm(original,axis=1)
            weight=np.clip((distance/reach-.18)/.42,0,1);weight=weight*weight*(3-2*weight)
            paths[i]['points']=anchor+original+weight[:,None]*(original@transform.T-original)
            paths[i]['sprayRoot']=root;paths[i]['sprayNormal']=facing.tolist();normals[i]=facing
        depth=np.abs((np.vstack([paths[i]['points'] for i in ids])-anchor)@facing)
        rows.append({'root':root,'normal':facing.tolist(),'outwardAlignment':float(facing@outward),'depth90':float(np.quantile(depth,.90))})
    return normals,{'sprays':rows,'sprayCount':len(rows),'meanOutwardAlignment':float(np.mean([r['outwardAlignment'] for r in rows])),
                    'method':'Smaller shallow connected fans; staggered paired crown normals; original attachment tangent retained; no camera tracking'}
