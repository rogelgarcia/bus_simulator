# Adds fixed specimen angles and matching in-canopy/isolated branchlet cameras.
import math
import numpy as np


def rotated_offset(offset,degrees):
    angle=math.radians(degrees);c,s=math.cos(angle),math.sin(angle)
    return (np.array([[c,-s,0],[s,c,0],[0,0,1]])@np.asarray(offset)).tolist()


def add_presentation_poses(poses,meta,primary):
    full=poses['full']
    for name,angle in [('side',70),('rear',150)]:
        poses['pose_'+name]={**full,'offset':rotated_offset(full['offset'],angle),'span':full['span']*1.10}
    if primary:
        detail=meta['sprayStudyPose']
        oblique={**detail,'offset':rotated_offset(detail['offset'],30)}
        poses['pose_branch_in']=oblique.copy();poses['pose_branch_out']=oblique.copy()
