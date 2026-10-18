# Grows a connected skeleton toward shared free-space samples without per-branch crown surfaces.
import copy
import math
import numpy as np
from architecture import unit


def limited_heading(incoming,desired,degrees):
    incoming=unit(incoming);desired=unit(desired);cosine=float(incoming@desired)
    bound=math.cos(math.radians(degrees))
    if cosine>=bound:return desired
    sideways=desired-incoming*cosine
    if np.linalg.norm(sideways)<1e-8:
        reference=np.eye(3)[np.argmin(abs(incoming))];sideways=np.cross(incoming,reference)
    return incoming*bound+unit(sideways)*math.sqrt(1-bound*bound)


def retained_scaffold(source):
    ids=[i for i,p in enumerate(source) if p.get('growthRole') in ['bole','leader','arching-axis','cluster-axis']]
    mapping={old:new for new,old in enumerate(ids)};paths=[]
    for i in ids:
        p=copy.deepcopy(source[i]);p['points']=np.array(p['points']);p['radii']=np.array(p['radii'])
        p['parent']=mapping[p['parent']] if p['parent']>=0 else -1
        memory=np.ones(len(p['points'])) if p['growthRole']=='bole' else 1-.55*np.linspace(0,1,len(p['points']))**1.5
        p['historicalRadii']=p['radii']*memory;p['demand']=np.full(len(p['points']),.00003)
        if p['parent']>=0:
            support=paths[p['parent']]['historicalRadii'][p['parentNode']]
            p['historicalRadii']*=min(1.,support/p['historicalRadii'][0])
        if p['growthRole']=='cluster-axis':p['growthRole']='retained-limb'
        p.pop('crownCluster',None)
        p['junctionMode']='inherited-tangent';p['retainedSourcePath']=i
        paths.append(p)
    return paths,mapping


def light_space(profile,policy,rng):
    count=policy['attractors'];height=profile['height'];radius=profile['radius']*policy['crownHorizontalRadius']
    accepted=[];phase=rng.uniform(0,math.tau)
    while sum(len(p) for p in accepted)<count:
        q=rng.uniform([-1.35,-1.35,-1.35],[1.35,1.35,1.35],(count,3))
        az=np.arctan2(q[:,1],q[:,0]);asymmetry=1+.09*np.sin(3*az+phase)+.065*np.cos(5*az-phase+q[:,2])
        distance=(q[:,0]**2+q[:,1]**2)/asymmetry**2+q[:,2]**2
        probability=np.exp(-distance**3*2.0)
        p=q*np.array([radius,radius,height*policy['crownVerticalRadius']])+[0,0,height*policy['crownCenterHeight']]
        keep=(rng.random(count)<probability)&(p[:,2]>height*.30)
        accepted.append(p[keep])
    return np.concatenate(accepted)[:count]


def light_owners(points,sites,headings,guides,radials,policy):
    ids=[];distances=[];limit=math.cos(math.radians(policy['maximumAxisDeviationDegrees']))
    for start in range(0,len(points),256):
        delta=points[start:start+256,None,:]-sites[None,:,:]
        length=np.linalg.norm(delta,axis=2);direction=delta/np.maximum(length[:,:,None],1e-9)
        reachable=(np.sum(direction*headings,axis=2)>-.05)&(np.sum(direction*guides,axis=2)>limit)&(np.sum(direction*radials,axis=2)>=0.)
        candidate=np.where(reachable,length,np.inf);selected=np.argmin(candidate,axis=1)
        distance=candidate[np.arange(len(selected)),selected]
        # Occupied space is consumed regardless of heading; unclaimed space is
        # assigned only to buds that can actually grow toward it.
        occupied=length.min(axis=1)<=policy['captureMetres']
        distance[occupied]=length.min(axis=1)[occupied]
        ids.extend(selected);distances.extend(distance)
    return np.asarray(ids),np.asarray(distances)


def colonize(paths,targets,policy,rng):
    positions=[];parents=[];headings=[];guides=[];anchors={};children=[];active=[];runs=[]
    for parent,path in enumerate(paths):
        if path['growthRole'] not in ['arching-axis','retained-limb']:continue
        for fraction in ([.55,1.] if path['growthRole']=='retained-limb' else [.72,1.]):
            node=round(fraction*(len(path['points'])-1));idx=len(positions)
            positions.append(path['points'][node].copy());headings.append(unit(path['points'][node]-path['points'][node-2]))
            guides.append(headings[-1].copy())
            parents.append(-1);children.append([]);anchors[idx]=(parent,node);active.append(idx)
            runs.append(0.)
    remaining=np.array(targets);consumed=0;forks=0
    for iteration in range(policy['iterations']):
        if not len(remaining) or not active:break
        sites=np.array([positions[i] for i in active])
        radials=sites-paths[0]['points'][0];radials[:,2]=0.
        radials/=np.maximum(np.linalg.norm(radials,axis=1)[:,None],1e-9)
        owners,distance=light_owners(remaining,sites,np.array([headings[i] for i in active]),np.array([guides[i] for i in active]),radials,policy)
        keep=distance>policy['captureMetres'];consumed+=int((~keep).sum())
        remaining=remaining[keep];owners=owners[keep];distance=distance[keep];next_active=[]
        for index,parent in enumerate(active):
            selected=remaining[(owners==index)&(distance<policy['influenceMetres'])]
            if not len(selected):continue
            vectors=selected-positions[parent];length=np.linalg.norm(vectors,axis=1);vectors/=length[:,None]
            incoming=headings[parent];guide=guides[parent]
            forward=(vectors@incoming>-.05)&(vectors@guide>math.cos(math.radians(policy['maximumAxisDeviationDegrees'])))
            radial=unit(np.r_[positions[parent][:2]-paths[0]['points'][0,:2],0.])
            forward&=vectors@radial>=0.
            vectors=vectors[forward]
            if not len(vectors):continue
            groups=[vectors];mean=unit(vectors.mean(axis=0))
            if not children[parent] and len(vectors)>=policy['splitMinimumTargets']:
                residual=vectors-mean*(vectors@mean)[:,None];_,_,basis=np.linalg.svd(residual,full_matrices=False)
                projection=residual@basis[0];positive=projection>np.median(projection)
                a=vectors[positive];b=vectors[~positive]
                if len(a)>=2 and len(b)>=2 and unit(a.mean(axis=0))@unit(b.mean(axis=0))<math.cos(math.radians(47)):
                    groups=sorted([a,b],key=len,reverse=True)
            directions=[];existing=[headings[i] for i in children[parent]]
            if len(groups)==1 and not existing and runs[parent]+policy['stepMetres']>policy['maximumUnforkedLengthMetres']+1e-8:continue
            for group in groups:
                desired=unit(group.mean(axis=0)+incoming*policy['directionMemory']+[0,0,policy['skyBias']])
                direction=limited_heading(incoming,desired,48 if existing or len(groups)>1 else policy['maximumTurnDegrees'])
                direction=limited_heading(guide,direction,policy['maximumAxisDeviationDegrees'])
                if direction@radial<-.01:continue
                if any(d@direction>math.cos(math.radians(policy['minimumForkDegrees'])) for d in existing+directions):continue
                directions.append(direction)
            for direction in directions:
                idx=len(positions);positions.append(positions[parent]+direction*policy['stepMetres'])
                parents.append(parent);headings.append(direction);children.append([]);children[parent].append(idx);next_active.append(idx)
                runs.append(policy['stepMetres']+(0. if len(directions)>1 or existing else runs[parent]))
                guides.append(unit(guide*.70+direction*.30) if len(directions)>1 else guide.copy())
            if len(children[parent])<2 and directions:next_active.append(parent)
            forks+=int(len(directions)>1)
        active=next_active
    proof={'attractors':len(targets),'consumedAttractors':consumed,'remainingAttractors':len(remaining),
           'growthSteps':iteration+1,'skeletonNodes':len(positions),'forks':forks,'postGrowthFanRotations':0,'crownSurfaceNormalsUsed':False}
    return np.asarray(positions),parents,children,anchors,proof


def append_skeleton(paths,nodes,children,anchors,rng):
    terminals=[]
    def visit(start,parent,parent_node):
        for first in children[start]:
            chain=[start,first]
            while len(children[chain[-1]])==1:chain.append(children[chain[-1]][0])
            raw=nodes[chain];incoming=unit(paths[parent]['points'][parent_node]-paths[parent]['points'][max(0,parent_node-2)])
            tangent=np.vstack([incoming,*[unit(raw[min(i+1,len(raw)-1)]-raw[max(0,i-1)]) for i in range(1,len(raw))]])
            points=[]
            for j in range(len(raw)-1):
                u=np.linspace(0,1,5)[:-1,None];length=np.linalg.norm(raw[j+1]-raw[j])
                points.extend((2*u**3-3*u**2+1)*raw[j]+(u**3-2*u**2+u)*tangent[j]*length+(-2*u**3+3*u**2)*raw[j+1]+(u**3-u**2)*tangent[j+1]*length)
            points=np.vstack([points,raw[-1]]);idx=len(paths)
            paths.append({'points':points,'radii':np.full(len(points),.008),'parent':parent,'parentNode':parent_node,
                          'phase':paths[parent]['phase'],'basal':False,'growthRole':'space-grown','order':paths[parent]['order']+1,
                          'demand':np.full(len(points),.00003),'junctionMode':'inherited-tangent','growthNode':chain[-1],
                          'growthAxis':unit(raw[-1]-raw[0]).tolist()})
            if children[chain[-1]]:visit(chain[-1],idx,len(points)-1)
            else:terminals.append(idx)
    for seed,(parent,node) in anchors.items():visit(seed,parent,node)
    return terminals
