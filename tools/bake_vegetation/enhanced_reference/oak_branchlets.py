# Grows separated terminal sprays and short lateral shoots in empty crown neighbourhoods.
import math
from collections import defaultdict
import numpy as np
from architecture import unit
from oak_growth import ascending_heading


class TwigSpace:
    def __init__(self,gap):
        self.gap=gap;self.cell=gap*2;self.grid=defaultdict(list)

    def clearance(self,points,group):
        closest=math.inf
        for point in points:
            key=np.floor(point/self.cell).astype(int);near=[]
            for x in [-1,0,1]:
                for y in [-1,0,1]:
                    for z in [-1,0,1]:
                        near.extend(p for g,p in self.grid.get(tuple(key+[x,y,z]),[]) if g!=group)
            if near:closest=min(closest,float(np.linalg.norm(np.asarray(near)-point,axis=1).min()))
        return closest

    def add(self,points,group):
        for point in points:self.grid[tuple(np.floor(point/self.cell).astype(int))].append((group,point))


def oak_branchlets(p,paths,lobes,rng):
    occupied_parents={path['parent'] for path in paths};shoots=[]
    terminal=[(group,lobe) for group,lobe in enumerate(lobes) if lobe['parent'] not in occupied_parents]
    space=TwigSpace(p['leafLength']*.85);rejected=0;clearances=[];supplement_clearances=[]

    def grow(parent,direction,length,radius,depth,plane,group,node=None,required=None):
        nonlocal rejected
        source=paths[parent];node=len(source['points'])-1 if node is None else node;start=source['points'][node]
        incoming=unit(start-source['points'][max(0,node-2)])
        side=unit(plane-direction*np.dot(plane,direction));across=unit(np.cross(direction,side))
        t=np.linspace(0,1,11);u=t[:,None];best=None
        # Search around the parent direction, never toward a fixed camera or crown boundary.
        for attempt in range(6):
            roll=attempt*2.39996+rng.uniform(-.16,.16)
            heading=ascending_heading(direction+(side*math.cos(roll)+across*math.sin(roll))*rng.uniform(.10,.38),.06)
            end=start+heading*length;bow=side*rng.uniform(-.045,.045)*length
            points=(1-u)**3*start+3*(1-u)**2*u*(start+incoming*length*.18)+3*(1-u)*u*u*(end-heading*length*.28+bow)+u**3*end
            clearance=space.clearance(points[2:],group)
            outer_clearance=space.clearance(points[5:],group) if required is not None else clearance
            # Stop rewarding empty space beyond a leaf-sized neighbourhood.
            score=min(clearance,space.gap*2)+min(outer_clearance,space.gap*3)+.02*np.dot(heading,direction)
            if best is None or score>best[0]:best=(score,clearance,outer_clearance,points,heading)
        _,clearance,outer_clearance,points,heading=best
        if clearance<space.gap or required is not None and outer_clearance<required:rejected+=1;return False
        if required is not None:supplement_clearances.append(outer_clearance)
        tip=min(radius*.90,max(.0018,radius*(.76 if depth else .55)))
        paths.append({'points':points,'radii':radius+(tip-radius)*t,'parent':parent,'parentNode':node,
                      'phase':float(rng.random()),'basal':False,'shootRole':'spaced-oak-spray',
                      'shootDepth':3-depth,'shootTerminal':depth==0,'junctionMode':'inherited-tangent','group':group})
        child=len(paths)-1;space.add(points[2:],group);clearances.append(clearance)
        shoots.append({'id':child,'parent':parent,'group':group,'stations':max(3,round(length/(p['leafLength']*.5)))})
        if not depth:return True
        lateral=unit(plane-heading*np.dot(plane,heading))
        nextplane=unit(lateral*.72+unit(np.cross(heading,lateral))*.69)
        for sign,angle,scale in [(1,rng.uniform(.18,.34),rng.uniform(.69,.79)),(-1,rng.uniform(.62,.92),rng.uniform(.60,.72))]:
            direction=unit(heading*math.cos(angle)+lateral*sign*math.sin(angle))
            grow(child,direction,length*scale,tip*(.88 if sign==1 else .74),depth-1,nextplane*sign,group)
        return True

    # Deterministic shuffling avoids favouring one leader or a low path index during competition.
    for index in rng.permutation(len(terminal)):
        group,lobe=terminal[index];support=paths[lobe['parent']];axis=unit(support['points'][-1]-support['points'][-3])
        side=unit(np.cross(axis,[0,0,1]));across=unit(np.cross(axis,side));roll=rng.uniform(0,math.tau)
        length=lobe['radius']*rng.uniform(.75,.98)
        grow(lobe['parent'],axis,length,float(support['radii'][-1])*.97,3,side*math.cos(roll)+across*math.sin(roll),group)
    primary_sprays=len({s['group'] for s in shoots});supplements=0;interior_sprays=0;required=space.gap*2.1
    candidates=[lobe for _,lobe in terminal]+[{'parent':i,'radius':min(1.,np.linalg.norm(path['points'][-1]-path['points'][0])*.78)} for i,path in enumerate(paths) if i in occupied_parents and path.get('growthRole')=='successor' and 4<=path['order']<=7 and np.linalg.norm(path['points'][-1]-path['points'][0])>p['leafLength']*3.2]
    for index in rng.permutation(len(candidates)):
        lobe=candidates[index];support=paths[lobe['parent']];node=round(rng.uniform(.32,.57)*(len(support['points'])-1))
        axis=unit(support['points'][node]-support['points'][node-2])
        side=unit(np.cross(axis,[0,0,1]));across=unit(np.cross(axis,side));roll=rng.uniform(0,math.tau)
        lateral=side*math.cos(roll)+across*math.sin(roll)
        direction=ascending_heading(axis*.70+lateral*.72,.12)
        added=grow(lobe['parent'],direction,lobe['radius']*rng.uniform(.65,.88),float(support['radii'][node])*.62,
                   2,lateral,lobe['parent']+len(lobes),node,required)
        supplements+=added;interior_sprays+=added and lobe['parent'] in occupied_parents
    proof={'terminalSupports':len(terminal),'acceptedSprays':len({s['group'] for s in shoots}),
           'primarySprays':primary_sprays,'supplementalSprays':supplements,'interiorSecondarySprays':interior_sprays,
           'minimumSupplementClearance':min(supplement_clearances,default=None),'requiredSupplementClearance':required,
           'fineShootPaths':len(shoots),'crowdedShootSubtreesRejected':rejected,'minimumSampleClearance':min(clearances),
           'requiredSampleClearance':space.gap,'maximumFineForkLevels':4,
           'method':'One terminal spray plus optional shorter lateral spray only in an empty neighbourhood; no ancestor fans; six ascending directions compete for local space',
           'limitations':'Sampled centreline clearance between sprays, not exact twig or leaf intersection'}
    return shoots,proof
