# Allocates connected shoot groups to silhouette meshes, curved volume meshes and interior cards.
import math
import numpy as np
from collections import defaultdict
from anatomy import unit

COUNTS={'london_plane':(650,3200),'silver_linden':(800,3500),'northern_red_oak':(1000,4200),'american_elm':(1200,6000),'arrowwood_viburnum':(300,1500)}


def exposure(centers):
    scores=np.zeros(len(centers));front=np.zeros(len(centers))
    for elevation in [-15,10,35]:
        for angle in range(0,360,30):
            a,e=np.radians([angle,elevation]);sight=np.array([np.cos(a)*np.cos(e),np.sin(a)*np.cos(e),np.sin(e)])
            right=np.array([-np.sin(a),np.cos(a),0]);up=np.cross(sight,right)
            q=centers@np.column_stack([right,up]);q=(q-q.min(axis=0))/max(np.ptp(q,axis=0))*44+2
            xy=q.astype(int);occupancy=np.zeros((50,50),bool);depth=np.full((50,50),-np.inf)
            distances=centers@sight
            for dx,dy in [(0,0),(-1,0),(1,0),(0,-1),(0,1)]:
                occupancy[xy[:,1]+dy,xy[:,0]+dx]=True
                np.maximum.at(depth,(xy[:,1]+dy,xy[:,0]+dx),distances)
            edge=np.zeros(len(centers))
            for dx,dy in [(-2,0),(2,0),(0,-2),(0,2),(-2,-2),(2,2),(-2,2),(2,-2)]:edge+=~occupancy[xy[:,1]+dy,xy[:,0]+dx]
            visible=distances>=depth[xy[:,1],xy[:,0]]-.22
            scores+=edge*visible*(1.3 if elevation<=10 else .8)
            front+=visible*(1.5 if elevation<=10 else .7)
    return scores,front


def layout(data,paths,atlas,species,seed,card_scale):
    members=defaultdict(list)
    for i,g in enumerate(data['groups']):members[int(g)].append(i)
    groups=sorted(members);centers=np.array([data['centers'][members[g]].mean(axis=0) for g in groups]);edge,front=exposure(centers)
    rng=np.random.default_rng(seed);detail_budget,middle_budget=COUNTS[species]
    selected={};used=set();counts=[0,0]
    for level,budget,score in [(0,detail_budget,edge*4+front*.2),(1,middle_budget,front+edge*.25)]:
        order=np.argsort(-(score+rng.uniform(0,.15,len(score))))
        for index in order:
            group=groups[index]
            if group in used:continue
            n=len(members[group])
            if counts[level]+n>budget:continue
            selected[group]=level;used.add(group);counts[level]+=n
            if counts[level]>=budget-5:break
    paths_by_group=defaultdict(list)
    for p in paths:paths_by_group[p['group']].append(p)
    cards=[];detail=[];middle=[];records=[]
    for index,group in enumerate(groups):
        ids=members[group]
        if group in selected:
            (detail if selected[group]==0 else middle).extend(ids)
            records.append({'group':group,'role':'detailed' if selected[group]==0 else 'simple','leaves':len(ids),'edgeScore':float(edge[index]),'frontScore':float(front[index])})
            continue
        p=data['centers'][ids];center=p.mean(axis=0);source=paths_by_group[group]
        root=np.array(source[0]['points'][0]);direction=unit(center-root)
        normals=data['matrices'][ids,:,2];normal=unit(np.sum(normals/np.linalg.norm(normals,axis=1,keepdims=True),axis=0))
        along=direction-normal*(direction@normal)
        if np.linalg.norm(along)<.1:along=unit(data['matrices'][ids[0],:,1])
        along=unit(along);across=unit(np.cross(along,normal));normal=unit(np.cross(across,along))
        roll=rng.uniform(-1.35,1.35);normal=normal*np.cos(roll)+across*np.sin(roll);across=unit(np.cross(along,normal));basis=np.column_stack([across,along,normal])
        patch=min(atlas['tiles'][:8],key=lambda t:abs(math.log(t['leaves']/len(ids))))
        local=(p-center)@basis;leafw=float(np.mean(data['scales'][ids,0]));leafh=float(np.mean(data['scales'][ids,1]))
        span=np.ptp(local[:,:2],axis=0)+[leafw*.82,leafh*.84]
        physical=np.mean(data['scales'][ids,0])/patch['leafWidth']
        expected=patch['extent']/.90*physical
        size=np.clip(span/.80,expected*.72,expected*1.30)
        size*=card_scale
        inset=unit(np.mean(centers,axis=0)-center)*min(leafw*.32,.065)
        cards.append({'group':group,'tile':patch['tile'],'center':(center+inset).tolist(),'basis':basis.tolist(),'size':size.tolist(),'referenceLeaves':len(ids),'edgeScore':float(edge[index])})
    if set(detail)&set(middle):raise RuntimeError('Leaf classifications overlap')
    if len(detail)+len(middle)+sum(c['referenceLeaves'] for c in cards)!=len(data['origins']):raise RuntimeError('Incomplete canopy partition')
    return cards,np.array(detail),np.array(middle),selected,records
