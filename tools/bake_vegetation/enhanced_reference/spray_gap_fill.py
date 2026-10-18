# Offers leaf nodes in the largest unused intervals of each surviving shoot's two ranks.
import numpy as np


def gap_nodes(path,leaves,length,policy):
    points=np.asarray(path['points']);arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(points,axis=0),axis=1))]
    parameters=np.linspace(0,1,len(points));result=[]
    for rank in [0,1]:
        occupied=[np.interp(l['attachment'],parameters,arc) for l in leaves if l['node']%2==rank]
        nodes=np.sort([arc[-1]*.06,*occupied,arc[-1]*.96]);gaps=np.diff(nodes)
        for i in np.argsort(-gaps)[:policy['gapsPerRank']]:
            if gaps[i]<length*policy['minimumGapLeafLengths']:continue
            result.append((rank,float(np.interp((nodes[i]+nodes[i+1])*.5,arc,parameters))))
    return result
