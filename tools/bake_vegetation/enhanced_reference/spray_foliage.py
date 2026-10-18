# Places alternate leaves in coherent curved sprays, with species petioles and volume exclusion.
import math
from collections import defaultdict
import numpy as np
from architecture import unit,point
from leaf_space import LeafSpace
from spray_space import SpraySpace
from spray_candidates import candidates
from spray_gap_fill import gap_nodes


def leaf_shape(form,policy=None):
    policy=policy or {}
    rng=np.random.default_rng(38419+form*83)
    return {'petiole':float(rng.uniform(*policy.get('petiole',[.17,.25]))),'arch':float(rng.uniform(.025,.055)),
            'curl':float(rng.uniform(-.065,-.025)),'twist':float(rng.uniform(-.07,.07)),
            'fold':float(rng.uniform(-.10,-.045)),'width':float(rng.uniform(.94,1.06))}


def blade_center(form,policy=None):
    shape=leaf_shape(form,policy)
    return np.array([0.,shape['petiole']+.48,shape['curl']*.48**2])


def place_leaves(p,paths,shoots,rng,layout=None,existing=None,gap_passes=None):
    half_axes=p.get('leafExclusionHalfAxes',[.44,.49,.12])
    space=LeafSpace(half_axes);pending=[];leaves=[];rejected=0;clearances=[];faces={}
    spray_space=SpraySpace(half_axes[:2]) if 'sprayMinimumClearance' in p else None;projected=[]
    dome_faces=layout.fan_faces(paths,shoots) if layout else {}
    for shoot in shoots:
        path=paths[shoot['id']];points=path['points'];axis=unit(points[-1]-points[0])
        if shoot['group'] not in faces:
            radial=unit(np.r_[points[-1,:2],0.]);side=unit(np.cross([0,0,1],radial));roll=rng.uniform(-.95,.95)
            faces[shoot['group']]=unit((radial*math.cos(roll)+side*math.sin(roll))*.90+[0,0,.80])
            if p.get('shootGrowth',{}).get('layout')=='open-staggered-fan':faces[shoot['group']]=np.asarray(path['sprayNormal'])
            if layout:faces[shoot['group']]=dome_faces[shoot['group']]
        face=faces[shoot['group']]
        path['sprayNormal']=face.tolist()
        if existing is not None:continue
        arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(points,axis=0),axis=1))]
        count=max(2,round(arc[-1]*.86/(p['leafLength']*rng.uniform(*p['leafInternodeRatio']))))
        if layout:count=max(2,round(count*layout.policy['candidateMultiplier']))
        gaps=rng.uniform(.72,1.28,count+1);positions=np.interp(arc[-1]*(.08+.84*np.cumsum(gaps[:-1])/sum(gaps)),arc,np.linspace(0,1,len(arc)))
        for node,t in enumerate(positions):
            if layout and rng.random()>float(layout.density(point(path,t),path['crownCluster']))/layout.policy['candidateMultiplier']:continue
            young=path.get('shootTerminal',path['shootDepth']==3) and node==len(positions)-1
            size=p['leafLength']*rng.uniform(.84,1.10)*(rng.uniform(.65,.84) if young else 1.)
            pending.append((shoot,node,t,young,size,int(rng.integers(8))))
    by_shoot=defaultdict(list);fill_added=0
    for leaf in existing or []:
        size=np.linalg.norm(leaf['matrix'][:,0]);frame=leaf['matrix']/size
        leaves.append(leaf);by_shoot[leaf['shoot']].append(leaf)
        space.add(leaf['bladeCenter'],frame,size)
        if spray_space:spray_space.add(leaf['group'],leaf['bladeCenter'],frame,size)
    def accept(shoot,node,t,young,size,form,placement=None):
        nonlocal rejected
        path=paths[shoot['id']]
        anchor=point(path,t);tangent=unit(point(path,min(1,t+.025))-point(path,max(0,t-.025)))
        face=np.asarray(path['sprayNormal']);lateral=unit(np.cross(tangent,face))*(-1 if node%2 else 1)
        forward=unit(tangent-face*np.dot(tangent,face))
        frames=[];centers=[]
        for attempt in range(0 if spray_space else 10):
            direction=unit(lateral+forward*rng.uniform(.15,.55)+face*rng.uniform(-.16,.16))
            normal=unit(face-direction*np.dot(face,direction));side=unit(np.cross(direction,normal))
            roll=rng.uniform(-.28,.28);normal=normal*math.cos(roll)+side*math.sin(roll)
            frame=np.column_stack([unit(np.cross(direction,normal)),direction,normal])
            frames.append(frame);centers.append(anchor+frame@blade_center(form,p.get('bladeShape'))*size)
        frames=np.asarray(frames);centers=np.asarray(centers)
        if spray_space:anchors,centers,frames,fractions=candidates(path,t,node,size,face,blade_center(form,p.get('bladeShape')),placement or p['sprayPlacement'],rng)
        cost,separation=space.score(anchor,centers,frames,np.full(len(frames),size))
        if spray_space:
            spray_clearance=spray_space.score(shoot['group'],face,centers,frames,np.full(len(frames),size))
            cost[spray_clearance<p['sprayMinimumClearance']]=np.inf
        cost[separation<.80]=np.inf;best=int(np.argmin(cost))
        if not np.isfinite(cost[best]):rejected+=1;return False
        if spray_space:anchor=anchors[best];t=fractions[best]
        center=centers[best];frame=frames[best];space.add(center,frame,size);clearances.append(float(separation[best]))
        if spray_space:spray_space.add(shoot['group'],center,frame,size);projected.append(float(spray_clearance[best]))
        tint=rng.uniform(.91,1.08)*np.array([rng.uniform(.96,1.03),1.,rng.uniform(.93,1.02)])*p['leafGreen']
        if young:tint*=np.array([1.06,1.06,.95])
        leaves.append({'origin':anchor,'matrix':frame*size,'form':form,'tint':tint,'group':shoot['group'],
                       'shoot':shoot['id'],'node':node,'attachment':float(t),'bladeCenter':center,'young':young})
        by_shoot[shoot['id']].append(leaves[-1]);return True
    for index in rng.permutation(len(pending)):accept(*pending[index])
    if 'sprayGapFill' in p:
        policy=p['sprayGapFill'];placement={**p['sprayPlacement'],'candidates':policy['candidates'],'travelLeafLengths':.35}
        next_node=defaultdict(int)
        for shoot,node,*_ in pending:next_node[shoot['id']]=max(next_node[shoot['id']],node+1)
        for leaf in existing or []:next_node[leaf['shoot']]=max(next_node[leaf['shoot']],leaf['node']+1)
        for _ in range(policy['passes'] if gap_passes is None else gap_passes):
            for index in rng.permutation(len(shoots)):
                shoot=shoots[index];path=paths[shoot['id']]
                if layout and layout.density(np.mean(path['points'],axis=0),path['crownCluster'])<policy['minimumDensity']:continue
                for rank,t in gap_nodes(path,by_shoot[shoot['id']],p['leafLength'],policy):
                    node=next_node[shoot['id']];node+=int(node%2!=rank);next_node[shoot['id']]=node+1
                    form=int(rng.integers(8))
                    for scale in policy['sizeScales']:
                        if accept(shoot,node,t,False,p['leafLength']*scale,form,placement):fill_added+=1;break
    leaves.sort(key=lambda leaf:(leaf['shoot'],leaf['node']))
    return leaves,{'candidateNodes':len(pending),'candidateLeavesRejected':rejected,
                   'completedGapPasses':p.get('sprayGapFill',{}).get('passes',0) if gap_passes is None else gap_passes,
                   'gapFillLeaves':fill_added,
                   'minimumAcceptedProxyClearance':min(clearances,default=10.),'youngLeaves':sum(l['young'] for l in leaves),
                   'crowdingMethod':'Twig arc-length internodes; alternate open sprays with bounded rotation; oriented blade exclusion volumes',
                   'exclusionHalfAxes':half_axes,'minimumRequiredProxyClearance':.80,
                   'minimumAcceptedSprayClearance':min(projected,default=10.) if spray_space else None,'minimumRequiredSprayClearance':p.get('sprayMinimumClearance'),
                   'sprayPlanes':{str(k):v.tolist() for k,v in faces.items()} if spray_space else None,
                   'limitations':'Natural overlap remains possible; this is a spacing proxy, not exact mesh intersection'}
