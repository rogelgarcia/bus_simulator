# Gives aligned sprays coherent depth, modest blade rotation and restored curved tissue.
import math
import numpy as np
from plane_foliage import blade_center
from leaf_space import LeafSpace


def local_rotation(pitch,roll,yaw):
    cx,sx=math.cos(pitch),math.sin(pitch);cy,sy=math.cos(roll),math.sin(roll);cz,sz=math.cos(yaw),math.sin(yaw)
    return np.array([[cz,-sz,0],[sz,cz,0],[0,0,1]])@np.array([[1,0,0],[0,cx,-sx],[0,sx,cx]])@np.array([[cy,0,sy],[0,1,0],[-sy,0,cy]])


def soften_sprays(paths,accepted,rng):
    space=LeafSpace();leaves=[];angles=[];separations=[];profiles={}
    for shoot in sorted({leaf['shoot'] for leaf in accepted}):
        profiles[shoot]=(rng.uniform(-math.pi,math.pi),rng.uniform(-7,7),rng.uniform(-6,6))
    for index in rng.permutation(len(accepted)):
        leaf=accepted[index];size=leaf['size'];base=leaf['matrix']/size;face=np.asarray(paths[leaf['shoot']]['sprayNormal'])
        phase,bias,lean=profiles[leaf['shoot']];t=leaf['attachment']
        roll=18*math.sin(phase+leaf['node']*1.8)+bias+rng.normal(0,4)
        pitch=(t-.5)*26+lean+rng.normal(0,5);yaw=rng.normal(0,5)
        frames=[];centers=[];deviation=[]
        for attempt in range(12):
            jitter=np.zeros(3) if attempt==0 else rng.uniform(-5,5,3)
            rotation=np.radians(np.clip(np.array([pitch,roll,yaw])+jitter,[-23,-29,-12],[23,29,12]))
            rotation[:2]*=min(1.,math.radians(27)/max(np.linalg.norm(rotation[:2]),1e-12))
            frame=base@local_rotation(*rotation)
            if frame[:,2]@face<math.cos(math.radians(36)):continue
            frames.append(frame);centers.append(leaf['origin']+frame@blade_center(leaf['form'],True)*size);deviation.append(float(jitter@jitter)*.0003)
        if not frames:raise RuntimeError('Organic foliage has no bounded orientation candidate')
        frames=np.array(frames);centers=np.array(centers)
        costs,clearance=space.score(leaf['origin'],centers,frames,np.full(len(frames),size))
        costs+=np.maximum(0,.85-clearance)**2*8+deviation;best=int(np.argmin(costs))
        space.add(centers[best],frames[best],size);separations.append(float(clearance[best]))
        angles.append(float(np.degrees(np.arccos(np.clip(frames[best,:,2]@face,-1,1)))))
        leaves.append({**leaf,'matrix':frames[best]*size,'bladeCenter':centers[best]})
    leaves.sort(key=lambda leaf:(leaf['shoot'],leaf['node']))
    return leaves,{'retainedLeafCount':len(leaves),'normalAngleDegreesQuantiles':np.quantile(angles,[0,.05,.5,.95,1]).tolist(),
                   'proxyClearanceQuantiles':np.quantile(separations,[0,.05,.5]).tolist(),
                   'method':'Coherent shoot lean and alternating blade roll, bounded 36-degree fan deviation; curved blades and petioles; fixed attached nodes',
                   'limitations':'Spacing proxy allows natural overlap; not an exact triangle intersection test'}
