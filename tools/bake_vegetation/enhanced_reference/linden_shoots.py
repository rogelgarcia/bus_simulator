# Grows finite staggered sprays at separate support nodes, competing for crown space.
import math
import numpy as np
from architecture import unit
from shoot_growth import TwigSpace,shoot_heading


def branchlets(p,paths,lobes,rng):
    policy=p['shootGrowth'];space=TwigSpace(p['leafLength']*policy['clearanceRatio'])
    shoots=[];clearances=[];attachments=set();rejected=0;accepted=0;t=np.linspace(0,1,19);u=t[:,None]

    def add(parent,node,heading,length,radius,group,normal,depth):
        nonlocal rejected
        if (parent,node) in attachments:rejected+=1;return None
        if radius<policy['minimumTipRadius']/.85:rejected+=1;return None
        source=paths[parent];start=source['points'][node]
        incoming=unit(start-source['points'][max(0,node-2)]);side=unit(np.cross(heading,normal));best=None
        for offset in [0.,.20,-.20,.40,-.40]:
            direction=shoot_heading(heading+side*offset,policy,1);end=start+direction*length
            bend=normal*rng.uniform(-.035,.035)*length
            points=(1-u)**3*start+3*(1-u)**2*u*(start+incoming*length*.16)+3*(1-u)*u*u*(end-direction*length*.30+bend)+u**3*end
            clearance=space.clearance(points[4:],parent)
            score=min(clearance,space.gap*2)-abs(offset)*.025
            if best is None or score>best[0]:best=(score,clearance,points)
        _,clearance,points=best
        if clearance<space.gap:rejected+=1;return None
        tip=max(policy['minimumTipRadius'],radius*.70);child=len(paths)
        paths.append({'points':points,'radii':radius+(tip-radius)*t,'parent':parent,'parentNode':node,
                      'phase':float(rng.random()),'basal':False,'shootRole':'open-staggered-fan',
                      'shootDepth':depth,'shootTerminal':True,'junctionMode':'inherited-tangent',
                      'group':group,'sprayNormal':normal.tolist()})
        space.add(points[4:],child);clearances.append(clearance);attachments.add((parent,node))
        shoots.append({'id':child,'parent':parent,'group':group,'stations':max(3,round(length/(p['leafLength']*.5)))})
        return child

    for index in rng.permutation(len(lobes)):
        lobe=lobes[index];support=paths[lobe['parent']];tip=lobe['parentNode']
        for sprig,fraction in enumerate(policy['supportFractions']):
            node=max(2,round(tip*fraction));start=support['points'][node]
            axis=unit(start-support['points'][node-2]);radial=unit(np.r_[start[:2],0.])
            normal=unit(radial*.90+[0,0,.80]);side=unit(np.cross(axis,normal))
            angle=sprig*2.39996+rng.uniform(-.25,.25);across=unit(np.cross(axis,side))
            heading=unit(axis*.75+radial*.25+(side*math.cos(angle)+across*math.sin(angle))*.75)
            roll=rng.uniform(-.30,.30);normal=unit(normal*math.cos(roll)+side*math.sin(roll))
            length=lobe['radius']*rng.uniform(*policy['lengthRatio']);group=int(index)*len(policy['supportFractions'])+sprig
            radius=min(.009,float(support['radii'][node])*.62)
            main=add(lobe['parent'],node,heading,length,radius,group,normal,0)
            if main is None:continue
            accepted+=1;paths[main]['shootTerminal']=False
            for i,fraction in enumerate([.26,.44,.63,.81]):
                node=round((fraction+rng.uniform(-.025,.025))*18);source=paths[main]
                tangent=unit(source['points'][node]-source['points'][node-2]);sign=1 if i%2 else -1
                direction=unit(tangent*.64+side*sign*.78+normal*rng.uniform(-.10,.10))
                lateral=add(main,node,direction,length*rng.uniform(.56,.78),float(source['radii'][node])*.68,group,normal,1)
                if lateral is not None:
                    for node,secondary_sign in [(7,-1),(13,1)]:
                        source=paths[lateral];tangent=unit(source['points'][node]-source['points'][node-2])
                        child=add(lateral,node,unit(tangent*.70+side*secondary_sign*.70),length*rng.uniform(.35,.52),
                                  float(source['radii'][node])*.68,group,normal,2)
                        if child is not None:paths[lateral]['shootTerminal']=False
    return shoots,{'supportGroups':len(lobes),'acceptedSprays':accepted,'fineShootPaths':len(shoots),
                   'crowdedShootSubtreesRejected':rejected,'minimumSampleClearance':min(clearances),
                   'requiredSampleClearance':space.gap,'maximumFineForkLevels':3,'maximumPathsPerSpray':13,
                   'withinSprayCompetition':True,'method':'Distinct support nodes; four staggered laterals with two secondaries each; sibling and neighbouring sprays compete for space',
                   'limitations':'Sampled centreline clearance excludes the immediate parent; not exact mesh intersection'}
