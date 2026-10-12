# Grows irregular connected shoot hierarchies, resolving local blade crowding.
import math
from collections import defaultdict
import numpy as np
from mathutils import Euler,Matrix
from leaf_geometry import LENGTH_RATIO,PETIOLE


def unit(vector):
    return vector/max(float(np.linalg.norm(vector)),1e-12)


def frame(direction,up=np.array([0.,0.,1.])):
    y=unit(direction);z=up-y*np.dot(up,y)
    if np.linalg.norm(z)<.05:z=np.cross(y,[1.,0.,0.])
    z=unit(z);x=unit(np.cross(y,z))
    return np.column_stack([x,y,np.cross(x,y)])


def curve(a,b,start_direction,rng,bend=.12):
    length=np.linalg.norm(b-a);direction=unit(b-a)
    side=frame(direction)[:,0]
    control_a=a+unit(start_direction)*length*.34
    control_b=b-direction*length*.30+side*rng.uniform(-bend,bend)*length
    control_b[2]+=rng.uniform(-.04,.12)*length
    t=np.linspace(0,1,9)[:,None]
    return (1-t)**3*a+3*(1-t)**2*t*control_a+3*(1-t)*t*t*control_b+t**3*b


def station(path,t):
    lengths=np.linalg.norm(np.diff(path,axis=0),axis=1);dist=np.r_[0,np.cumsum(lengths)];dist/=dist[-1]
    segment=min(len(path)-2,max(0,int(np.searchsorted(dist,t)-1)))
    f=(t-dist[segment])/(dist[segment+1]-dist[segment])
    return path[segment]*(1-f)+path[segment+1]*f,unit(path[segment+1]-path[segment])


class Neighbors:
    def __init__(self,size):
        self.size=size;self.cells=defaultdict(list);self.centers=[];self.radii=[];self.normals=[]
    def near(self,point):
        key=np.floor(point/self.size).astype(int)
        return [i for x in range(key[0]-1,key[0]+2) for y in range(key[1]-1,key[1]+2) for z in range(key[2]-1,key[2]+2) for i in self.cells[(x,y,z)]]
    def cost(self,point,radius,normal):
        ids=self.near(point)
        if not ids:return 0.
        delta=np.array([self.centers[i] for i in ids])-point
        distance=np.linalg.norm(delta,axis=1);limits=np.array([self.radii[i] for i in ids])+radius
        alignment=np.abs(np.array([self.normals[i] for i in ids])@normal)
        return float(np.sum(np.maximum(0,1-distance/limits)**2*(.25+alignment)))
    def add(self,point,radius,normal):
        key=tuple(np.floor(point/self.size).astype(int));self.cells[key].append(len(self.centers))
        self.centers.append(point);self.radii.append(radius);self.normals.append(normal)


def grow(data,recipe,variant,retain):
    rng=np.random.default_rng(variant['seed']+611000)
    kind=recipe['texture']['leaf'];count=recipe['texture']['leafCount'];stride=count+2
    groups=data['origins'].reshape(-1,stride,3)
    rotations=np.array([np.array(Euler(tuple(row)).to_matrix()) for row in data['rotations']])
    old_ids=np.flatnonzero(data['forms']!=8)
    old_centers=data['origins'][old_ids]+rotations[old_ids,:,1]*data['scales'][old_ids,1,None]*.5
    old={'centers':old_centers,'normals':rotations[old_ids,:,2],'widths':data['scales'][old_ids,0],'lengths':data['scales'][old_ids,1]}
    low,high=recipe['growth']['leafWidthMetres'];neighbors=Neighbors(high*LENGTH_RATIO[kind]*1.5)
    leaves=[];paths=[];shoots=[];rejected=0;adjusted=0;crowd_before=0.;crowd_after=0.
    centers=groups[:,2:].mean(axis=1)
    center_cells=defaultdict(list);cell=.40
    for i,p in enumerate(centers):center_cells[tuple(np.floor(p/cell).astype(int))].append(i)
    for group in rng.permutation(len(groups)):
        base=group*stride;a=groups[group,0]
        length=float(data['scales'][base+1,1])
        # Competition for local space acts on entire shoots, never floating individual leaves.
        center=centers[group];key=np.floor(center/cell).astype(int)
        nearby=[j for x in range(key[0]-1,key[0]+2) for y in range(key[1]-1,key[1]+2) for z in range(key[2]-1,key[2]+2) for j in center_cells[(x,y,z)] if j!=group]
        repulsion=np.zeros(3)
        if nearby:
            delta=center-centers[nearby];distance=np.linalg.norm(delta,axis=1)
            weight=np.maximum(0,.38-distance)
            repulsion=(delta/np.maximum(distance[:,None],.02)*weight[:,None]).sum(axis=0)
            repulsion=unit(repulsion)*min(.11,np.linalg.norm(repulsion)*.22)
        center=center+repulsion
        outward=unit(center-a)
        if np.linalg.norm(center-a)<.02:outward=rotations[base+1,:,1]
        # The old card axis can point back toward its attachment. Replace that fold
        # with one outward continuation through the original foliage envelope.
        axis=unit(outward*.88+rotations[base+1,:,1]*.12)
        basis=frame(axis)
        b=a+(center-a)*.35+basis[:,0]*rng.uniform(-.045,.045)*length
        tip=center+axis*length*.40
        axis=unit(tip-b);basis=frame(axis)
        target_count=max(6,int(round(count*retain*rng.uniform(.84,1.16))))
        lateral_count=min(int(rng.integers(2,4)),target_count//2-1)
        numbers=2+rng.multinomial(target_count-2*(lateral_count+1),np.ones(lateral_count+1)/(lateral_count+1))
        connector=curve(a,b,b-a,rng,.23)
        parent=curve(b,tip,unit(axis*.65+unit(b-a)*.35),rng,.25)
        root_radius=float(np.clip(.00145*math.sqrt(target_count)*rng.uniform(.95,1.25),.0045,.012))
        root_radius=min(root_radius,float(data['root_max_radius'][group]))
        root_path=len(paths);paths.append({'points':connector,'radii':np.linspace(root_radius*1.25,root_radius,9),'group':int(group)})
        paths.append({'points':parent,'radii':np.linspace(root_radius,.00125,9),'group':int(group)})
        local_shoots=[(parent,int(numbers[0]),0)]
        phases=rng.uniform(0,math.tau)
        for j in range(lateral_count):
            t=(j+1)/(lateral_count+1)+rng.uniform(-.09,.09)
            attach,tangent=station(parent,t)
            phi=phases+j*(math.pi if kind in ['linden','elm'] else 2.399)+rng.normal(0,.20)
            side=basis[:,0]*math.cos(phi)+basis[:,2]*math.sin(phi)*.65
            aim=unit(side*.82+tangent*rng.uniform(.35,.75)+np.array([0,0,.1]))
            end=attach+aim*length*rng.uniform(.48,.78)
            path=curve(attach,end,unit(tangent*.45+aim*.55),rng,.30)
            radius=max(.0007,root_radius*(1-t*.6)*.63)
            paths.append({'points':path,'radii':np.linspace(radius,.0009,9),'group':int(group)})
            local_shoots.append((path,int(numbers[j+1]),j+1))
        for path,number,local_id in local_shoots:
            if number<2:continue
            opposite=kind=='viburnum';stations=(number+1)//2 if opposite else number
            increments=rng.lognormal(0,.33,stations)
            ts=np.array([.86]) if stations==1 else .15+.77*(np.cumsum(increments)-increments[0])/(increments.sum()-increments[0])
            if ts[-1]<.8:raise RuntimeError('Terminal leaf station leaves an unsupported bare shoot tip')
            shoot_id=len(shoots);shoots.append({'group':int(group),'path':path.tolist(),'leafStart':len(leaves),'kind':'opposite' if opposite else 'alternate'})
            phase=rng.uniform(-.35,.35)
            for node,t in enumerate(ts):
                attachment,tangent=station(path,float(t));local_basis=frame(tangent)
                step=math.pi if kind in ['linden','elm'] else (math.pi/2 if opposite else 2.399)
                phi=phase+node*step+rng.normal(0,.17)
                width=rng.uniform(low,high)*(1-.12*max(0,(t-.65)/.3));leaf_length=width*LENGTH_RATIO[kind]*rng.uniform(.92,1.07)
                for paired in range(2 if opposite else 1):
                    angle=phi+paired*math.pi
                    lateral=local_basis[:,0]*math.cos(angle)+local_basis[:,2]*math.sin(angle)
                    direction=unit(lateral*.85+tangent*rng.uniform(.25,.70))
                    best=None
                    # Reorient around a fixed petiole node, preserving botanical attachment.
                    for attempt in range(4):
                        aim=unit(direction+local_basis[:,0]*rng.normal(0,.18)+np.array([0,0,rng.normal(.08,.10)])) if attempt else direction
                        leaf_basis=frame(aim)
                        roll=rng.normal(0,.34)+.12*math.sin(node+phase)
                        face=leaf_basis[:,2]*math.cos(roll)+leaf_basis[:,0]*math.sin(roll)
                        side=unit(np.cross(aim,face));face=np.cross(side,aim)
                        origin=attachment+aim*(PETIOLE[kind]*leaf_length)
                        midpoint=origin+aim*leaf_length*.48
                        cost=neighbors.cost(midpoint,width*.31,face)
                        if attempt==0:crowd_before+=cost
                        candidate={'form':int(rng.integers(8)),'origin':origin,'matrix':np.column_stack([side*width,aim*leaf_length,face*leaf_length]),'center':midpoint,'normal':face,'width':width,'length':leaf_length,'group':int(group),'shoot':shoot_id,'node':node,'attachment':attachment,'cost':cost,'attempt':attempt}
                        if best is None or cost<best['cost']:best=candidate
                        if cost<.02:break
                    # Keep light overlap, reject only severe local congestion.
                    if best['cost']>.62:rejected+=1;continue
                    crowd_after+=best['cost'];adjusted+=int(best['attempt']>0)
                    best['tint']=rng.uniform(.83,1.0)*np.array([rng.uniform(.96,1),1,rng.uniform(.92,1)])
                    leaves.append(best);neighbors.add(best['center'],width*.31,best['normal'])
            shoots[-1]['leafEnd']=len(leaves)
        if len(leaves)==0:raise RuntimeError('Empty natural foliage')
    new={'centers':np.array([leaf['center'] for leaf in leaves]),'normals':np.array([leaf['normal'] for leaf in leaves]),'widths':np.array([leaf['width'] for leaf in leaves]),'lengths':np.array([leaf['length'] for leaf in leaves])}
    report={'oldLeafCount':len(old_ids),'leafCount':len(leaves),'reductionPercent':100*(1-len(leaves)/len(old_ids)),
        'shootGroups':len(groups),'shoots':len(shoots),'curvedPaths':len(paths),'collisionRejectedLeaves':rejected,'reorientedLeaves':adjusted,
        'candidateCrowdingScore':crowd_before,'acceptedCrowdingScore':crowd_after,'twigBaseRadiusMillimetres':[min(p['radii'][0] for p in paths)*1000,max(p['radii'][0] for p in paths)*1000],
        'phyllotaxis':'opposite pairs' if kind=='viburnum' else 'alternate',
        'proxyBoundsBefore':[old_centers.min(axis=0).tolist(),old_centers.max(axis=0).tolist()],
        'proxyBoundsAfter':[new['centers'].min(axis=0).tolist(),new['centers'].max(axis=0).tolist()]}
    return leaves,paths,shoots,old,new,report
