# Places open elm fans with staggered laterals and clearance within each spray.
import math
import numpy as np
from architecture import unit
from shoot_growth import TwigSpace,shoot_heading


def branchlets(p,paths,lobes,rng):
    policy=p['shootGrowth'];space=TwigSpace(p['leafLength']*1.12)
    shoots=[];clearances=[];rejected=0;accepted=0

    def add(parent,node,heading,length,radius,group,normal,depth):
        nonlocal rejected
        if radius<policy['minimumTipRadius']/.85:rejected+=1;return None
        source=paths[parent];start=source['points'][node]
        incoming=unit(start-source['points'][max(0,node-2)])
        side=unit(np.cross(heading,normal));best=None;t=np.linspace(0,1,19);u=t[:,None]
        for offset in [0.,.15,-.15,.30,-.30]:
            direction=shoot_heading(heading+side*offset,policy,1)
            end=start+direction*length
            bend=normal*rng.uniform(-.025,.025)*length
            points=(1-u)**3*start+3*(1-u)**2*u*(start+incoming*length*.14)+3*(1-u)*u*u*(end-direction*length*.28+bend)+u**3*end
            clearance=space.clearance(points[4:],parent)
            score=min(clearance,space.gap*2)-abs(offset)*.03
            if best is None or score>best[0]:best=(score,clearance,points)
        _,clearance,points=best
        if clearance<space.gap:rejected+=1;return None
        tip=max(policy['minimumTipRadius'],radius*.72)
        child=len(paths)
        paths.append({'points':points,'radii':radius+(tip-radius)*t,'parent':parent,'parentNode':node,
                      'phase':float(rng.random()),'basal':False,'shootRole':'open-staggered-fan',
                      'shootDepth':depth,'shootTerminal':True,'junctionMode':'inherited-tangent',
                      'group':group,'sprayNormal':normal.tolist(),'crownCluster':source.get('crownCluster')})
        space.add(points[4:],child);clearances.append(clearance)
        shoots.append({'id':child,'parent':parent,'group':group,'stations':max(3,round(length/(p['leafLength']*.5)))})
        return child

    for group in rng.permutation(len(lobes)):
        lobe=lobes[group];support=paths[lobe['parent']]
        local=unit(support['points'][-1]-np.asarray(lobe['clusterCenter']))
        guide=unit(local*.65+np.array(lobe['clusterGuide'])*.35)
        axis=unit(support['points'][-1]-support['points'][-3])
        heading=unit(guide*.45+axis*.55)
        radial=unit(np.r_[support['points'][-1,:2],0.])
        normal=unit(np.r_[local[:2],0.]*.65+radial*.20+[0,0,.90]);side=unit(np.cross(heading,normal))
        length=lobe['radius']*rng.uniform(1.25,1.60)
        radius=float(support['radii'][-1])*.97
        main=add(lobe['parent'],len(support['points'])-1,heading,length,radius,int(group),normal,0)
        if main is None:continue
        accepted+=1;paths[main]['shootTerminal']=False
        for i,fraction in enumerate([.30,.51,.73]):
            node=round((fraction+rng.uniform(-.035,.035))*18);source=paths[main]
            tangent=unit(source['points'][node]-source['points'][node-2]);sign=1 if i%2==0 else -1
            direction=unit(tangent*.70+side*sign*.72+normal*rng.uniform(-.08,.08))
            lateral=add(main,node,direction,length*rng.uniform(.55,.73),float(source['radii'][node])*.68,
                        int(group),normal,1)
            if lateral is not None and i!=1:
                source=paths[lateral];node=10
                tangent=unit(source['points'][node]-source['points'][node-2])
                direction=unit(tangent*.83-side*sign*.40)
                child=add(lateral,node,direction,length*rng.uniform(.28,.38),float(source['radii'][node])*.68,
                          int(group),normal,2)
                if child is not None:paths[lateral]['shootTerminal']=False

    proof={'terminalSupports':len(lobes),'acceptedSprays':accepted,'primarySprays':accepted,
           'supplementalSprays':0,'interiorSecondarySprays':0,'fineShootPaths':len(shoots),
           'crowdedShootSubtreesRejected':rejected,'minimumSampleClearance':min(clearances),
           'requiredSampleClearance':space.gap,'maximumFineForkLevels':3,
           'maximumPathsPerSpray':6,'withinSprayCompetition':True,
           'method':'One continuous shoot with three staggered side shoots and at most two short secondaries; sibling and neighbouring shoots share clearance checks',
           'limitations':'Sampled clearance excludes the immediate supporting twig near a shared junction; leaf spacing uses oriented volume proxies'}
    return shoots,proof
