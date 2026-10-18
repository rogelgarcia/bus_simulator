# Places alternating attached leaves with modest local variation and quantized world-gravity deformation.
import math
import numpy as np
from architecture import unit
from leaf_space import LeafSpace


def gravity_directions():
    directions=[[0.,0.,-1.]]
    for tilt in [35,65,90]:
        for azimuth in np.linspace(0,2*np.pi,8,endpoint=False):
            angle=math.radians(tilt);directions.append([math.sin(angle)*math.cos(azimuth),math.sin(angle)*math.sin(azimuth),-math.cos(angle)])
    return np.array(directions)


def deform_vertices(vertices,gravity,strength):
    result=np.array(vertices,copy=True);distance=np.maximum(0,result[:,1])
    result+=np.asarray(gravity)[None,:]*strength*distance[:,None]**2
    return result


def place(paths,shoots,profile,policy,rng):
    leaves=[];space=LeafSpace([.34,.48,.13],cell=.30);directions=gravity_directions();rejected=0;clearances=[];errors=[]
    for shoot in shoots:
        idx=shoot['id'];path=paths[idx];points=path['points'];arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(points,axis=0),axis=1))]
        distance=shoot.get('leafStartMetres',0.)+profile['leafLength']*.45;node=0;reference=np.array(path['sprayNormal'])
        while distance<arc[-1]-.025:
            fraction=distance/arc[-1];anchor=np.array([np.interp(distance,arc,points[:,k]) for k in range(3)])
            segment=min(len(points)-2,int(np.searchsorted(arc,distance)-1));tangent=unit(points[segment+1]-points[segment])
            lateral=unit(np.cross(tangent,reference));sign=(-1 if node%2 else 1);size=profile['leafLength']*rng.uniform(*policy['leafSizeFraction'])*(1-.16*fraction**4)
            candidates=[]
            for variant in range(5):
                forward=rng.uniform(.12,.50);droop=rng.uniform(.12,.42)
                heading=unit(lateral*sign+tangent*forward+[0,0,-droop])
                normal=unit(reference-heading*(heading@reference));side=unit(np.cross(heading,normal))
                roll=rng.uniform(-.25,.25);normal=normal*math.cos(roll)+side*math.sin(roll);side=unit(np.cross(heading,normal))
                if normal[2]<0:normal=-normal;side=-side
                frame=np.column_stack([side,heading,normal]);gravity=frame.T@np.array([0.,0.,-1.])
                bucket=int(np.argmax(directions@gravity));style=int(rng.integers(8));form=style*len(directions)+bucket
                sag=np.linspace(*policy['leafSagFraction'],8)[style]
                center=anchor+frame@deform_vertices(np.array([[0.,.61,0.]]),directions[bucket],sag)[0]*size
                candidates.append((frame,center,form,float(directions[bucket]@gravity)))
            cost,clearance=space.score(anchor,np.array([c[1] for c in candidates]),np.array([c[0] for c in candidates]),np.full(len(candidates),size))
            valid=np.flatnonzero(clearance>=policy['leafMinimumClearance'])
            if len(valid):
                selected=valid[np.argmin(cost[valid])];frame,center,form,error=candidates[selected];matrix=frame*size
                tint=rng.uniform(.91,1.07)*np.array([rng.uniform(.95,1.02),1.,rng.uniform(.93,1.03)])*profile['leafGreen']
                leaves.append({'origin':anchor,'matrix':matrix,'bladeCenter':center,'form':form,'tint':tint,'shoot':idx,'group':shoot['group'],'node':node,'attachment':fraction})
                space.add(center,frame,size);clearances.append(float(clearance[selected]));errors.append(math.degrees(math.acos(min(1.,error))))
                path['demand'][segment]+=size*size
            else:rejected+=1
            distance+=profile['leafLength']*rng.uniform(*policy['leafSpacingLengths']);node+=1
    return leaves,{'acceptedLeaves':len(leaves),'suppressedCrowdedLeaves':rejected,'minimumAcceptedClearance':min(clearances),
                   'minimumRequiredClearance':policy['leafMinimumClearance'],'maximumGravityQuantizationDegrees':max(errors),
                   'gravityDirectionCount':len(directions),'leafAttachment':'alternating nodes on the actual shoot centerline; petiole root buried in twig'}
