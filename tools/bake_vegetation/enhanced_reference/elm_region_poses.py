# Uses fixed crown-relative inspection cameras, independent of the foliage generation policy.
import numpy as np
from architecture import unit


def add_region_poses(poses,meta,width):
    full=poses['full'];height=meta['dimensions']['heightTarget'];side=unit(np.cross([0,0,1],full['offset']))
    for label,horizontal,vertical,span in [('left',-.27,.10,.27),('upper',0,.33,.27),('right',.27,.16,.27),('fringe',.40,.12,.20)]:
        target=np.asarray(full['target'])+side*height*horizontal+[0,0,height*vertical]
        poses['region_'+label]={**full,'target':target.tolist(),'span':height*span,'width':width}
