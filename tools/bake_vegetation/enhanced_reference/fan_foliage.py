# Reuses accepted leaves in an alternate planar arrangement, searching within each shoot's fan.
import numpy as np
from architecture import unit,point
from plane_foliage import blade_center
from leaf_space import LeafSpace


def attachment(path,origin):
    delta=np.diff(path['points'],axis=0);offset=origin-path['points'][:-1]
    u=np.clip(np.sum(offset*delta,axis=1)/np.sum(delta*delta,axis=1),0,1)
    segment=int(np.argmin(np.linalg.norm(offset-u[:,None]*delta,axis=1)))
    return (segment+u[segment])/(len(path['points'])-1)


def place_fans(paths,normals,accepted,rng):
    space=LeafSpace();leaves=[];separations=[];angles=[]
    for index in rng.permutation(len(accepted)):
        leaf=accepted[index];path=paths[leaf['shoot']];face=normals[leaf['shoot']];size=leaf['size']
        centers=[];frames=[];origins=[];positions=[];penalties=[]
        sign=1 if (leaf['node']+leaf['shoot'])%2 else -1
        for attempt in range(24):
            t=np.clip(leaf['attachment']+rng.uniform(-.12,.12),.035,.97);anchor=point(path,t)
            tangent=unit(point(path,min(1,t+.03))-point(path,max(0,t-.03)))
            tangent=unit(tangent-face*np.dot(tangent,face));across=unit(np.cross(tangent,face))
            flipped=attempt>=20;forward=rng.uniform(-.60,.90);direction=unit(across*sign*(-1 if flipped else 1)+tangent*forward)
            normal=unit(face+across*rng.uniform(-.10,.10)+tangent*rng.uniform(-.10,.10))
            normal=unit(normal-direction*np.dot(normal,direction));frame=np.column_stack([unit(np.cross(direction,normal)),direction,normal])
            center=anchor+frame@blade_center(leaf['form'],True,True)*size
            centers.append(center);frames.append(frame);origins.append(anchor);positions.append(t);penalties.append((t-leaf['attachment'])**2*.1+(.18 if flipped else 0))
        centers=np.array(centers);frames=np.array(frames)
        costs,clearance=space.score(np.mean(origins,axis=0),centers,frames,np.full(len(centers),size))
        costs+=np.maximum(0,.85-clearance)**2*8+penalties;best=int(np.argmin(costs))
        space.add(centers[best],frames[best],size);separations.append(float(clearance[best]));angles.append(float(frames[best,:,2]@face))
        leaves.append({**leaf,'origin':origins[best],'matrix':frames[best]*size,'bladeCenter':centers[best],'attachment':float(positions[best])})
    leaves.sort(key=lambda l:(l['shoot'],l['node']))
    return leaves,{'retainedLeafCount':len(leaves),'meanNormalAlignment':float(np.mean(angles)),
                   'proxyClearanceQuantiles':np.quantile(separations,[0,.05,.5]).tolist(),
                   'method':'Alternate in-plane stalk directions, small blade tilt, 24 spatial candidates; original leaf count, forms, sizes and tint retained',
                   'limitations':'Spacing proxy permits natural overlap; not an exact triangle intersection test'}
