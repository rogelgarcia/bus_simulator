# Turns complete twig fans toward their branch-owned dome, preserving attachments and basal tangents.
from collections import defaultdict
import numpy as np
from architecture import unit


def orient_fans(paths,shoots,layout):
    groups=defaultdict(list);targets=layout.fan_faces(paths,shoots);angles=[];errors=[]
    for shoot in shoots:groups[shoot['group']].append(shoot['id'])
    for group,ids in groups.items():
        root=next(i for i in ids if paths[i]['parent'] not in ids);origin=paths[root]['points'][0].copy()
        points=np.concatenate([paths[i]['points'] for i in ids]);_,_,basis=np.linalg.svd(points-points.mean(axis=0),full_matrices=False)
        normal=basis[-1];target=targets[group]
        if normal@target<0:normal=-normal
        angle=float(np.arccos(np.clip(normal@target,-1,1)))
        incoming=unit(paths[root]['points'][-1]-origin);old_axis=unit(incoming-normal*(incoming@normal))
        tangent=np.cross([0.,0.,1.],target)
        if np.linalg.norm(tangent)<.10:tangent=old_axis-target*(old_axis@target)
        tangent=unit(tangent)
        if tangent@old_axis<0:tangent=-tangent
        rise=float(np.clip(incoming[2],-.30,.35));new_axis=unit(tangent+unit(np.cross(target,tangent))*rise)
        rotation=np.column_stack([new_axis,np.cross(target,new_axis),target])@np.column_stack([old_axis,np.cross(normal,old_axis),normal]).T
        across=np.cross(target,new_axis)
        rotation=(np.eye(3)+(layout.policy['fanWidthScale']-1)*np.outer(across,across))@rotation
        length=np.linalg.norm(paths[root]['points'][-1]-origin);transition=max(.08,length*.22)
        delta=points-origin;u=np.clip(np.linalg.norm(delta,axis=1)/transition,0,1);weights=u*u*(3-2*u)
        correction=-np.sum((delta@rotation.T-delta)*weights[:,None],axis=0)/weights.sum()
        # Preserve height/depth across the fan, but allow tangential growth instead of folding its stem back.
        correction-=new_axis*(correction@new_axis)
        for i in ids:
            delta=paths[i]['points']-origin;u=np.clip(np.linalg.norm(delta,axis=1)/transition,0,1);blend=u*u*(3-2*u)
            paths[i]['points']=origin+delta+(delta@rotation.T-delta+correction)*blend[:,None]
        angles.append(float(np.degrees(angle)))
        errors.append(float(np.linalg.norm(paths[root]['points'][0]-origin)))
    # Recompute the dome from the oriented fans, avoiding any reference to a viewing camera.
    faces=layout.fan_faces(paths,shoots)
    for shoot in shoots:paths[shoot['id']]['sprayNormal']=faces[shoot['group']].tolist()
    return {'fans':len(groups),'medianRotationDegrees':float(np.median(angles)),'maximumRootAttachmentError':max(errors),'preservesAcrossFanCentroid':True,'fanWidthScale':layout.policy['fanWidthScale']}
