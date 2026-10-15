# Frames actual crown depth from orthogonal, rear and elevated directions.
from presentation_poses import rotated_offset


def add_volume_poses(poses,primary):
    full=poses['full']
    for name,angle in [('side',90),('rear',180)]:
        poses['volume_'+name]={**full,'offset':rotated_offset(full['offset'],angle)}
    poses['volume_above']={**full,'offset':[8,-10,32]}
    if primary:poses['wood_volume_above']=poses['volume_above'].copy()
