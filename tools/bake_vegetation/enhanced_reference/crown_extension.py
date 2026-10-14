# Extends branch centerlines into a weak crown axis while preserving leaf-bearing shoot shapes.
import numpy as np
from architecture import unit


def shoot_frames(matrix,anchors,tangents,pivot):
    headings=tangents@matrix.T;headings/=np.linalg.norm(headings,axis=1)[:,None]
    cross=np.cross(tangents,headings);cosine=np.sum(tangents*headings,axis=1)
    skew=np.zeros((len(anchors),3,3));skew[:,0,1]=-cross[:,2];skew[:,0,2]=cross[:,1]
    skew[:,1,0]=cross[:,2];skew[:,1,2]=-cross[:,0];skew[:,2,0]=-cross[:,1];skew[:,2,1]=cross[:,0]
    turns=np.eye(3)+skew+skew@skew/(1+cosine)[:,None,None]
    shifts=pivot+(anchors-pivot)@matrix.T-np.einsum('nij,nj->ni',turns,anchors)
    return turns,shifts


def extend_crown(paths,target,policy):
    from crown_spread import crown_metrics
    structural={i for i,p in enumerate(paths) if 'growthRole' in p};parents={p['parent'] for p in paths}
    grafts=[i for i,p in enumerate(paths) if i not in structural and not p.get('root') and p['parent'] in structural]
    owners=np.full(len(paths),-1,dtype=int);lookup={root:i for i,root in enumerate(grafts)}
    for i,p in enumerate(paths):
        if i in lookup:owners[i]=lookup[i]
        elif i not in structural and p['parent']>=0:owners[i]=owners[p['parent']]
    tips=np.array([i for i in range(len(paths)) if owners[i]>=0 and i not in parents]);groups=owners[tips]
    original=np.array([paths[i]['points'][-1] for i in tips]);anchors=np.array([paths[i]['points'][0] for i in grafts]);tangents=[]
    for i in grafts:
        p=paths[i];parent=paths[p['parent']]['points'];node=p['parentNode'];tangents.append(unit(parent[node]-parent[max(0,node-2)]))
    tangents=np.asarray(tangents);pivot=paths[0]['points'][-1].copy();matrix=np.eye(3)
    axes=np.array([paths[i]['points'][-1]-paths[i]['points'][0] for i in structural if paths[i].get('growthRole')=='scaffold'])
    for iteration in range(policy['maxIterations']+1):
        turns,shifts=shoot_frames(matrix,anchors,tangents,pivot)
        points=np.einsum('nij,nj->ni',turns[groups],original)+shifts[groups];metrics=crown_metrics(points,policy['azimuthSamples'])
        if metrics['minimumWidth']>=target:break
        if iteration==policy['maxIterations']:raise RuntimeError('Crown breadth did not converge')
        angle=np.radians(metrics['azimuthDegrees'][int(np.argmin(metrics['widths']))]);axis=np.array([np.cos(angle),np.sin(angle),0.])
        matrix=(np.eye(3)+policy['growthStep']*np.outer(axis,axis))@matrix
        changed=axes@matrix.T;elevations=np.degrees(np.arctan2(changed[:,2],np.linalg.norm(changed[:,:2],axis=1)))
        if np.min(elevations)<policy['minimumElevationDegrees'] or np.linalg.svd(matrix,compute_uv=False).max()>policy['maximumDirectionalGrowth']:raise RuntimeError('Crown spread exceeds branch angle or extension limits')
    transforms={}
    for i,p in enumerate(paths):
        if i in structural and i!=0:
            p['points']=pivot+(p['points']-pivot)@matrix.T
            for key in ['extensionGuide','sprayNormal']:
                if key in p:p[key]=unit(matrix@np.asarray(p[key])).tolist()
        elif owners[i]>=0:
            turn,shift=turns[owners[i]],shifts[owners[i]];p['points']=p['points']@turn.T+shift;transforms[i]=(turn,shift)
            for key in ['extensionGuide','sprayNormal']:
                if key in p:p[key]=(turn@np.asarray(p[key])).tolist()
    return transforms,{'matrix':matrix.tolist(),'directionalGrowth':np.linalg.svd(matrix,compute_uv=False).tolist(),'iterations':iteration,
                       'minimumScaffoldElevation':float(np.degrees(np.arctan2((axes@matrix.T)[:,2],np.linalg.norm((axes@matrix.T)[:,:2],axis=1))).min())}
